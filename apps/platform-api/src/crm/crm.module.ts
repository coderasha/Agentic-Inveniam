import {
  Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@gain/database';
import { CRM_KAFKA_TOPICS, type DomainEvent } from '@gain/shared';
import { v4 as uuidv4 } from 'uuid';
import { AuthorizationService, CurrentPrincipal, type Principal } from '../common/auth';
import { ConflictError, NotFoundError, ValidationError } from '../common/errors';
import { OutboxService, PrismaService } from '../infrastructure/services';
import {
  canTransitionPipeline,
  summarizePipeline,
  totalCommitmentsMinor,
  type PipelineStage,
} from './pipeline';

const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;
const serialize = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value, (_, item) => typeof item === 'bigint'
    ? (item <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(item) : item.toString()) : item)) as T;

@Injectable()
export class CrmService {
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

  async createInvestor(input: Record<string, unknown>, p: Principal) {
    if (typeof input.displayName !== 'string') {
      throw new ValidationError('displayName is required');
    }
    const investor = await this.db.investor.create({
      data: {
        organizationId: this.orgId(p),
        displayName: input.displayName,
        investorType: (input.investorType as never) ?? 'individual',
        status: (input.status as never) ?? 'prospect',
        pipelineStage: (input.pipelineStage as never) ?? 'lead',
        email: input.email as string | undefined,
        phone: input.phone as string | undefined,
        company: input.company as string | undefined,
        countryCode: input.countryCode as string | undefined,
        ownerRef: input.ownerRef as string | undefined,
        tags: (input.tags as string[] | undefined) ?? [],
        metadata: json(input.metadata ?? {}),
      },
    });
    await this.emit(
      p, CRM_KAFKA_TOPICS.INVESTOR_CREATED, 'crm.investor.created',
      'investor', investor.id, { investorId: investor.id },
    );
    return investor;
  }

  async listInvestors(p: Principal, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.InvestorWhereInput = {
      organizationId: this.orgId(p),
      deletedAt: null,
      status: query.status as never,
      pipelineStage: query.pipelineStage as never,
      ...(query.q
        ? {
          OR: [
            { displayName: { contains: query.q, mode: 'insensitive' as const } },
            { email: { contains: query.q, mode: 'insensitive' as const } },
            { company: { contains: query.q, mode: 'insensitive' as const } },
          ],
        }
        : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.investor.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { updatedAt: 'desc' },
      }),
      this.db.investor.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getInvestor(id: string, p: Principal) {
    const investor = await this.db.investor.findFirst({
      where: { id, organizationId: this.orgId(p), deletedAt: null },
      include: {
        interactions: { orderBy: { occurredAt: 'desc' }, take: 50 },
        commitments: { orderBy: { committedAt: 'desc' } },
      },
    });
    if (!investor) throw new NotFoundError('Investor', id);
    return serialize(investor);
  }

  async updateInvestor(id: string, input: Record<string, unknown>, p: Principal) {
    const current = await this.db.investor.findFirst({
      where: { id, organizationId: this.orgId(p), deletedAt: null },
    });
    if (!current) throw new NotFoundError('Investor', id);
    const version = Number(input.version);
    if (!Number.isInteger(version)) throw new ValidationError('version is required');

    if (typeof input.pipelineStage === 'string') {
      if (!canTransitionPipeline(
        current.pipelineStage as PipelineStage,
        input.pipelineStage as PipelineStage,
      )) {
        throw new ValidationError(
          `Invalid pipeline transition ${current.pipelineStage} → ${input.pipelineStage}`,
        );
      }
    }

    const data: Prisma.InvestorUpdateManyMutationInput = { version: { increment: 1 } };
    for (const key of [
      'displayName', 'investorType', 'status', 'pipelineStage', 'email', 'phone',
      'company', 'countryCode', 'ownerRef', 'tags',
    ] as const) {
      if (key in input) (data as Record<string, unknown>)[key] = input[key];
    }
    if ('metadata' in input) data.metadata = json(input.metadata);

    const result = await this.db.investor.updateMany({
      where: { id, organizationId: this.orgId(p), deletedAt: null, version },
      data,
    });
    if (result.count === 0) throw new ConflictError('Investor version is stale');
    const updated = await this.getInvestor(id, p);
    await this.emit(
      p, CRM_KAFKA_TOPICS.INVESTOR_UPDATED, 'crm.investor.updated',
      'investor', id, { investorId: id },
    );
    return updated;
  }

  async removeInvestor(id: string, p: Principal): Promise<void> {
    await this.getInvestor(id, p);
    await this.db.investor.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async createInteraction(input: Record<string, unknown>, p: Principal) {
    if (typeof input.investorId !== 'string' || typeof input.subject !== 'string') {
      throw new ValidationError('investorId and subject are required');
    }
    await this.getInvestor(input.investorId, p);
    const row = await this.db.investorInteraction.create({
      data: {
        organizationId: this.orgId(p),
        investorId: input.investorId,
        channel: (input.channel as never) ?? 'note',
        subject: input.subject,
        body: input.body as string | undefined,
        occurredAt: input.occurredAt ? new Date(input.occurredAt as string) : new Date(),
        metadata: json(input.metadata ?? {}),
        createdByUserId: p.userId,
      },
    });
    await this.emit(
      p, CRM_KAFKA_TOPICS.INTERACTION_CREATED, 'crm.interaction.created',
      'investor_interaction', row.id, { investorId: input.investorId, interactionId: row.id },
    );
    return row;
  }

  async listInteractions(p: Principal, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.InvestorInteractionWhereInput = {
      organizationId: this.orgId(p),
      investorId: query.investorId,
    };
    const [items, total] = await this.db.$transaction([
      this.db.investorInteraction.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { occurredAt: 'desc' },
      }),
      this.db.investorInteraction.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async createCommitment(input: Record<string, unknown>, p: Principal) {
    if (typeof input.investorId !== 'string' || typeof input.label !== 'string'
      || input.amountMinor == null) {
      throw new ValidationError('investorId, label and amountMinor are required');
    }
    await this.getInvestor(input.investorId, p);
    if (typeof input.portfolioId === 'string') {
      const portfolio = await this.db.portfolio.findFirst({
        where: { id: input.portfolioId, organizationId: this.orgId(p), deletedAt: null },
      });
      if (!portfolio) throw new NotFoundError('Portfolio', input.portfolioId);
    }
    const amountText = String(input.amountMinor);
    if (!/^\d+$/.test(amountText)) throw new ValidationError('amountMinor must be a non-negative integer');
    const amountMinor = BigInt(amountText);
    if (amountMinor <= 0n) throw new ValidationError('amountMinor must be positive');

    const row = await this.db.investorCommitment.create({
      data: {
        organizationId: this.orgId(p),
        investorId: input.investorId,
        portfolioId: input.portfolioId as string | undefined,
        label: input.label,
        amountMinor,
        currencyCode: (input.currencyCode as string | undefined) ?? 'USD',
        status: (input.status as never) ?? 'soft',
        committedAt: input.committedAt ? new Date(input.committedAt as string) : new Date(),
        metadata: json(input.metadata ?? {}),
        createdByUserId: p.userId,
      },
    });
    await this.emit(
      p, CRM_KAFKA_TOPICS.COMMITMENT_CREATED, 'crm.commitment.created',
      'investor_commitment', row.id, { commitmentId: row.id, investorId: input.investorId },
    );
    return serialize(row);
  }

  async updateCommitment(id: string, input: Record<string, unknown>, p: Principal) {
    const current = await this.db.investorCommitment.findFirst({
      where: { id, organizationId: this.orgId(p) },
    });
    if (!current) throw new NotFoundError('InvestorCommitment', id);
    const data: Prisma.InvestorCommitmentUpdateInput = {};
    if (typeof input.status === 'string') data.status = input.status as never;
    if (typeof input.label === 'string') data.label = input.label;
    if (input.amountMinor != null) {
      const amountText = String(input.amountMinor);
      if (!/^\d+$/.test(amountText)) throw new ValidationError('amountMinor must be a non-negative integer');
      data.amountMinor = BigInt(amountText);
    }
    if ('metadata' in input) data.metadata = json(input.metadata);
    const updated = await this.db.investorCommitment.update({ where: { id }, data });
    await this.emit(
      p, CRM_KAFKA_TOPICS.COMMITMENT_UPDATED, 'crm.commitment.updated',
      'investor_commitment', id, { commitmentId: id },
    );
    return serialize(updated);
  }

  async listCommitments(p: Principal, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.InvestorCommitmentWhereInput = {
      organizationId: this.orgId(p),
      investorId: query.investorId,
      status: query.status as never,
      portfolioId: query.portfolioId,
    };
    const [items, total] = await this.db.$transaction([
      this.db.investorCommitment.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { committedAt: 'desc' },
      }),
      this.db.investorCommitment.count({ where }),
    ]);
    return serialize({ items, total, page, pageSize });
  }

  async pipeline(p: Principal) {
    const [investors, commitments] = await Promise.all([
      this.db.investor.findMany({
        where: { organizationId: this.orgId(p), deletedAt: null },
        select: { pipelineStage: true },
      }),
      this.db.investorCommitment.findMany({
        where: { organizationId: this.orgId(p) },
        select: { amountMinor: true, status: true },
      }),
    ]);
    return serialize({
      stages: summarizePipeline(investors),
      commitments: totalCommitmentsMinor(commitments),
      investorCount: investors.length,
    });
  }
}

@ApiTags('Investor CRM')
@ApiBearerAuth()
@Controller({ path: 'crm', version: '1' })
export class CrmController {
  constructor(
    private readonly service: CrmService,
    private readonly auth: AuthorizationService,
  ) {}

  @Get('pipeline')
  pipeline(@CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'crm:pipeline:read');
    return this.service.pipeline(p);
  }

  @Post('investors')
  createInvestor(@Body() body: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'crm:investor:create');
    return this.service.createInvestor(body, p);
  }

  @Get('investors')
  listInvestors(@Query() query: Record<string, string | undefined>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'crm:investor:read');
    return this.service.listInvestors(p, query);
  }

  @Get('investors/:id')
  getInvestor(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'crm:investor:read');
    return this.service.getInvestor(id, p);
  }

  @Patch('investors/:id')
  updateInvestor(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'crm:investor:update');
    return this.service.updateInvestor(id, body, p);
  }

  @Delete('investors/:id')
  removeInvestor(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'crm:investor:delete');
    return this.service.removeInvestor(id, p);
  }

  @Post('interactions')
  createInteraction(@Body() body: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'crm:interaction:create');
    return this.service.createInteraction(body, p);
  }

  @Get('interactions')
  listInteractions(@Query() query: Record<string, string | undefined>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'crm:interaction:read');
    return this.service.listInteractions(p, query);
  }

  @Post('commitments')
  createCommitment(@Body() body: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'crm:commitment:create');
    return this.service.createCommitment(body, p);
  }

  @Patch('commitments/:id')
  updateCommitment(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'crm:commitment:update');
    return this.service.updateCommitment(id, body, p);
  }

  @Get('commitments')
  listCommitments(@Query() query: Record<string, string | undefined>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'crm:commitment:read');
    return this.service.listCommitments(p, query);
  }
}

@Module({
  controllers: [CrmController],
  providers: [CrmService],
})
export class CrmModule {}
