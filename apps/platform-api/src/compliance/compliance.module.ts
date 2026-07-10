import {
  Body, Controller, Get, Injectable, Module, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@gain/database';
import { COMPLIANCE_KAFKA_TOPICS, type DomainEvent } from '@gain/shared';
import { v4 as uuidv4 } from 'uuid';
import { AuthorizationService, CurrentPrincipal, type Principal } from '../common/auth';
import { ConflictError, NotFoundError, ValidationError } from '../common/errors';
import { OutboxService, PrismaService } from '../infrastructure/services';
import {
  evaluateCompliancePolicy,
  type ComplianceRule,
} from './policy-engine';

const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

@Injectable()
export class ComplianceService {
  constructor(
    private readonly db: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  private orgId(p: Principal): string {
    if (!p.organizationId) throw new ValidationError('x-organization-id is required');
    return p.organizationId;
  }

  private async emit(
    p: Principal,
    topic: string,
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const event: DomainEvent = {
      eventId: uuidv4(),
      eventType,
      aggregateType,
      aggregateId,
      occurredAt: new Date().toISOString(),
      correlationId: p.correlationId,
      actorUserId: p.userId,
      organizationId: this.orgId(p),
      payload,
      metadata: {},
    };
    await this.outbox.enqueue(event, topic);
  }

  private parseRules(raw: unknown): ComplianceRule[] {
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new ValidationError('rules must be a non-empty array');
    }
    return raw.map((item, index) => {
      if (!item || typeof item !== 'object') {
        throw new ValidationError(`rules[${index}] must be an object`);
      }
      const rule = item as Record<string, unknown>;
      if (typeof rule.id !== 'string' || typeof rule.type !== 'string'
        || typeof rule.message !== 'string') {
        throw new ValidationError(`rules[${index}] requires id, type and message`);
      }
      return {
        id: rule.id,
        type: rule.type as ComplianceRule['type'],
        severity: (rule.severity as ComplianceRule['severity'] | undefined) ?? 'medium',
        message: rule.message,
        field: rule.field as string | undefined,
        value: rule.value as string | number | boolean | undefined,
      };
    });
  }

  async createPolicy(input: Record<string, unknown>, p: Principal) {
    if (typeof input.name !== 'string' || typeof input.slug !== 'string'
      || typeof input.subjectType !== 'string') {
      throw new ValidationError('name, slug and subjectType are required');
    }
    const rules = this.parseRules(input.rules);
    const policy = await this.db.compliancePolicy.create({
      data: {
        organizationId: this.orgId(p),
        name: input.name,
        slug: input.slug,
        description: input.description as string | undefined,
        subjectType: input.subjectType as never,
        status: 'active',
        rules: json(rules),
      },
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('Compliance policy slug already exists');
      }
      throw error;
    });
    await this.emit(
      p, COMPLIANCE_KAFKA_TOPICS.POLICY_CREATED, 'compliance.policy.created',
      'compliance_policy', policy.id, { policyId: policy.id, slug: policy.slug },
    );
    return policy;
  }

  async listPolicies(p: Principal, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.CompliancePolicyWhereInput = {
      organizationId: this.orgId(p),
      deletedAt: null,
      status: query.status as never,
      subjectType: query.subjectType as never,
    };
    const [items, total] = await this.db.$transaction([
      this.db.compliancePolicy.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { updatedAt: 'desc' },
      }),
      this.db.compliancePolicy.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getPolicy(id: string, p: Principal) {
    const policy = await this.db.compliancePolicy.findFirst({
      where: { id, organizationId: this.orgId(p), deletedAt: null },
    });
    if (!policy) throw new NotFoundError('CompliancePolicy', id);
    return policy;
  }

  async updatePolicy(id: string, input: Record<string, unknown>, p: Principal) {
    await this.getPolicy(id, p);
    const version = Number(input.version);
    if (!Number.isInteger(version)) throw new ValidationError('version is required');
    const data: Prisma.CompliancePolicyUpdateManyMutationInput = { version: { increment: 1 } };
    if (typeof input.name === 'string') data.name = input.name;
    if (typeof input.description === 'string' || input.description === null) {
      data.description = input.description as string | null;
    }
    if (typeof input.status === 'string') data.status = input.status as never;
    if ('rules' in input) data.rules = json(this.parseRules(input.rules));
    const result = await this.db.compliancePolicy.updateMany({
      where: { id, organizationId: this.orgId(p), deletedAt: null, version },
      data,
    });
    if (result.count === 0) throw new ConflictError('Compliance policy version is stale');
    return this.getPolicy(id, p);
  }

  async runCheck(input: Record<string, unknown>, p: Principal) {
    if (typeof input.policyId !== 'string' || typeof input.subjectType !== 'string'
      || typeof input.subjectId !== 'string'
      || !input.subjectSnapshot || typeof input.subjectSnapshot !== 'object') {
      throw new ValidationError('policyId, subjectType, subjectId and subjectSnapshot are required');
    }
    const policy = await this.getPolicy(input.policyId, p);
    if (policy.status !== 'active') throw new ValidationError('Policy must be active');
    if (policy.subjectType !== input.subjectType) {
      throw new ValidationError(`Policy subjectType is ${policy.subjectType}`);
    }

    const rules = this.parseRules(policy.rules);
    const evaluation = evaluateCompliancePolicy(
      rules,
      input.subjectSnapshot as Record<string, unknown>,
    );

    const check = await this.db.complianceCheck.create({
      data: {
        organizationId: this.orgId(p),
        policyId: policy.id,
        subjectType: input.subjectType as never,
        subjectId: input.subjectId,
        status: evaluation.status,
        summary: evaluation.summary,
        subjectSnapshot: json(input.subjectSnapshot),
        createdByUserId: p.userId,
        findings: {
          create: evaluation.findings.map((finding) => ({
            organizationId: this.orgId(p),
            ruleId: finding.ruleId,
            severity: finding.severity,
            message: finding.message,
            details: json(finding.details),
          })),
        },
      },
      include: { findings: true },
    });

    await this.emit(
      p, COMPLIANCE_KAFKA_TOPICS.CHECK_COMPLETED, 'compliance.check.completed',
      'compliance_check', check.id, {
        checkId: check.id,
        status: check.status,
        findingCount: check.findings.length,
      },
    );
    return check;
  }

  async listChecks(p: Principal, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.ComplianceCheckWhereInput = {
      organizationId: this.orgId(p),
      status: query.status as never,
      subjectType: query.subjectType as never,
      subjectId: query.subjectId,
      policyId: query.policyId,
    };
    const [items, total] = await this.db.$transaction([
      this.db.complianceCheck.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' },
        include: { findings: true },
      }),
      this.db.complianceCheck.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getCheck(id: string, p: Principal) {
    const check = await this.db.complianceCheck.findFirst({
      where: { id, organizationId: this.orgId(p) },
      include: { findings: true, cases: true, policy: true },
    });
    if (!check) throw new NotFoundError('ComplianceCheck', id);
    return check;
  }

  async updateFinding(id: string, input: Record<string, unknown>, p: Principal) {
    const finding = await this.db.complianceFinding.findFirst({
      where: { id, organizationId: this.orgId(p) },
    });
    if (!finding) throw new NotFoundError('ComplianceFinding', id);
    if (typeof input.status !== 'string') throw new ValidationError('status is required');
    const updated = await this.db.complianceFinding.update({
      where: { id },
      data: {
        status: input.status as never,
        details: 'details' in input ? json(input.details) : undefined,
      },
    });
    await this.emit(
      p, COMPLIANCE_KAFKA_TOPICS.FINDING_UPDATED, 'compliance.finding.updated',
      'compliance_finding', id, { findingId: id, status: input.status },
    );
    return updated;
  }

  async listFindings(p: Principal, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.ComplianceFindingWhereInput = {
      organizationId: this.orgId(p),
      status: query.status as never,
      severity: query.severity as never,
      checkId: query.checkId,
    };
    const [items, total] = await this.db.$transaction([
      this.db.complianceFinding.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' },
      }),
      this.db.complianceFinding.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async createCase(input: Record<string, unknown>, p: Principal) {
    if (typeof input.checkId !== 'string' || typeof input.title !== 'string') {
      throw new ValidationError('checkId and title are required');
    }
    await this.getCheck(input.checkId, p);
    const row = await this.db.complianceCase.create({
      data: {
        organizationId: this.orgId(p),
        checkId: input.checkId,
        title: input.title,
        assigneeRef: input.assigneeRef as string | undefined,
        notes: input.notes as string | undefined,
        dueAt: input.dueAt ? new Date(input.dueAt as string) : undefined,
        createdByUserId: p.userId,
      },
    });
    await this.emit(
      p, COMPLIANCE_KAFKA_TOPICS.CASE_CREATED, 'compliance.case.created',
      'compliance_case', row.id, { caseId: row.id, checkId: input.checkId },
    );
    return row;
  }

  async updateCase(id: string, input: Record<string, unknown>, p: Principal) {
    const current = await this.db.complianceCase.findFirst({
      where: { id, organizationId: this.orgId(p) },
    });
    if (!current) throw new NotFoundError('ComplianceCase', id);
    const data: Prisma.ComplianceCaseUpdateInput = {};
    if (typeof input.status === 'string') {
      data.status = input.status as never;
      if (input.status === 'resolved' || input.status === 'closed') {
        data.resolvedAt = new Date();
      }
    }
    if (typeof input.title === 'string') data.title = input.title;
    if (typeof input.assigneeRef === 'string' || input.assigneeRef === null) {
      data.assigneeRef = input.assigneeRef as string | null;
    }
    if (typeof input.notes === 'string' || input.notes === null) {
      data.notes = input.notes as string | null;
    }
    const updated = await this.db.complianceCase.update({ where: { id }, data });
    await this.emit(
      p, COMPLIANCE_KAFKA_TOPICS.CASE_UPDATED, 'compliance.case.updated',
      'compliance_case', id, { caseId: id },
    );
    return updated;
  }

  async listCases(p: Principal, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.ComplianceCaseWhereInput = {
      organizationId: this.orgId(p),
      status: query.status as never,
      checkId: query.checkId,
    };
    const [items, total] = await this.db.$transaction([
      this.db.complianceCase.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' },
      }),
      this.db.complianceCase.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
}

@ApiTags('Compliance')
@ApiBearerAuth()
@Controller({ path: 'compliance', version: '1' })
export class ComplianceController {
  constructor(
    private readonly service: ComplianceService,
    private readonly auth: AuthorizationService,
  ) {}

  @Post('policies')
  createPolicy(@Body() body: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'compliance:policy:create');
    return this.service.createPolicy(body, p);
  }

  @Get('policies')
  listPolicies(@Query() query: Record<string, string | undefined>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'compliance:policy:read');
    return this.service.listPolicies(p, query);
  }

  @Get('policies/:id')
  getPolicy(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'compliance:policy:read');
    return this.service.getPolicy(id, p);
  }

  @Patch('policies/:id')
  updatePolicy(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'compliance:policy:update');
    return this.service.updatePolicy(id, body, p);
  }

  @Post('checks')
  runCheck(@Body() body: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'compliance:check:create');
    return this.service.runCheck(body, p);
  }

  @Get('checks')
  listChecks(@Query() query: Record<string, string | undefined>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'compliance:check:read');
    return this.service.listChecks(p, query);
  }

  @Get('checks/:id')
  getCheck(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'compliance:check:read');
    return this.service.getCheck(id, p);
  }

  @Get('findings')
  listFindings(@Query() query: Record<string, string | undefined>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'compliance:finding:read');
    return this.service.listFindings(p, query);
  }

  @Patch('findings/:id')
  updateFinding(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'compliance:finding:update');
    return this.service.updateFinding(id, body, p);
  }

  @Post('cases')
  createCase(@Body() body: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'compliance:case:create');
    return this.service.createCase(body, p);
  }

  @Get('cases')
  listCases(@Query() query: Record<string, string | undefined>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'compliance:case:read');
    return this.service.listCases(p, query);
  }

  @Patch('cases/:id')
  updateCase(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'compliance:case:update');
    return this.service.updateCase(id, body, p);
  }
}

@Module({
  controllers: [ComplianceController],
  providers: [ComplianceService],
})
export class ComplianceModule {}
