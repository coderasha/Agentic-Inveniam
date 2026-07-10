import {
  Body, Controller, Get, Injectable, Module, Param, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@gain/database';
import { PROVENANCE_KAFKA_TOPICS, type DomainEvent } from '@gain/shared';
import { v4 as uuidv4 } from 'uuid';
import { AuthorizationService, CurrentPrincipal, type Principal } from '../common/auth';
import { ConflictError, NotFoundError, ValidationError } from '../common/errors';
import { OutboxService, PrismaService } from '../infrastructure/services';
import {
  computeChainHash,
  verifyChainIntegrity,
  walkLineageIds,
} from './chain';

const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;
const HASH_RE = /^[a-f0-9]{64}$/;

@Injectable()
export class ProvenanceService {
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

  async get(id: string, p: Principal) {
    const row = await this.db.provenanceRecord.findFirst({
      where: { id, organizationId: this.orgId(p) },
    });
    if (!row) throw new NotFoundError('ProvenanceRecord', id);
    return row;
  }

  async create(input: Record<string, unknown>, p: Principal) {
    const organizationId = this.orgId(p);
    if (typeof input.subjectType !== 'string' || typeof input.subjectId !== 'string') {
      throw new ValidationError('subjectType and subjectId are required');
    }
    if (typeof input.contentHash !== 'string' || !HASH_RE.test(input.contentHash)) {
      throw new ValidationError('contentHash must be a SHA-256 hex digest');
    }

    let previousHash: string | null = null;
    let previousRecordId: string | undefined;
    if (typeof input.previousRecordId === 'string') {
      const previous = await this.get(input.previousRecordId, p);
      if (previous.status === 'revoked') {
        throw new ValidationError('Cannot chain from a revoked provenance record');
      }
      previousRecordId = previous.id;
      previousHash = previous.chainHash;
    }

    const capturedAt = input.capturedAt
      ? new Date(input.capturedAt as string)
      : new Date();
    if (Number.isNaN(capturedAt.getTime())) {
      throw new ValidationError('capturedAt must be a valid ISO datetime');
    }

    const chainHash = computeChainHash({
      previousHash,
      contentHash: input.contentHash,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      capturedAtIso: capturedAt.toISOString(),
    });

    const row = await this.db.provenanceRecord.create({
      data: {
        organizationId,
        subjectType: input.subjectType as never,
        subjectId: input.subjectId,
        sourceType: (input.sourceType as never) ?? 'manual',
        sourceRef: input.sourceRef as string | undefined,
        contentHash: input.contentHash,
        chainHash,
        previousRecordId,
        previousHash,
        confidence: typeof input.confidence === 'number' ? input.confidence : undefined,
        summary: input.summary as string | undefined,
        metadata: json(input.metadata ?? {}),
        capturedAt,
        createdByUserId: p.userId,
      },
    });

    await this.emit(
      p, PROVENANCE_KAFKA_TOPICS.RECORD_CREATED, 'provenance.record.created',
      'provenance_record', row.id, { recordId: row.id, subjectType: row.subjectType },
    );
    return row;
  }

  async list(p: Principal, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.ProvenanceRecordWhereInput = {
      organizationId: this.orgId(p),
      subjectType: query.subjectType as never,
      subjectId: query.subjectId,
      status: query.status as never,
    };
    const [items, total] = await this.db.$transaction([
      this.db.provenanceRecord.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { capturedAt: 'desc' },
      }),
      this.db.provenanceRecord.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async forSubject(subjectType: string, subjectId: string, p: Principal) {
    return this.db.provenanceRecord.findMany({
      where: {
        organizationId: this.orgId(p),
        subjectType: subjectType as never,
        subjectId,
      },
      orderBy: { capturedAt: 'asc' },
    });
  }

  async verifySubjectChain(subjectType: string, subjectId: string, p: Principal) {
    const records = await this.forSubject(subjectType, subjectId, p);
    const nodes = records.map((row) => ({
      id: row.id,
      previousRecordId: row.previousRecordId,
      previousHash: row.previousHash,
      contentHash: row.contentHash,
      chainHash: row.chainHash,
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      capturedAt: row.capturedAt.toISOString(),
    }));
    return { ...verifyChainIntegrity(nodes), recordCount: records.length, records };
  }

  async verifyRecord(id: string, p: Principal) {
    const row = await this.get(id, p);
    if (row.status === 'revoked') throw new ValidationError('Revoked records cannot be verified');
    const updated = await this.db.provenanceRecord.update({
      where: { id },
      data: {
        status: 'verified',
        verifiedAt: new Date(),
        verifiedByUserId: p.userId,
      },
    });
    await this.emit(
      p, PROVENANCE_KAFKA_TOPICS.RECORD_VERIFIED, 'provenance.record.verified',
      'provenance_record', id, { recordId: id },
    );
    return updated;
  }

  async revokeRecord(id: string, p: Principal) {
    await this.get(id, p);
    const updated = await this.db.provenanceRecord.update({
      where: { id },
      data: { status: 'revoked', revokedAt: new Date() },
    });
    await this.emit(
      p, PROVENANCE_KAFKA_TOPICS.RECORD_REVOKED, 'provenance.record.revoked',
      'provenance_record', id, { recordId: id },
    );
    return updated;
  }

  async createLink(input: Record<string, unknown>, p: Principal) {
    if (typeof input.fromRecordId !== 'string' || typeof input.toRecordId !== 'string'
      || typeof input.relation !== 'string') {
      throw new ValidationError('fromRecordId, toRecordId and relation are required');
    }
    if (input.fromRecordId === input.toRecordId) {
      throw new ValidationError('Self-links are not allowed');
    }
    await this.get(input.fromRecordId, p);
    await this.get(input.toRecordId, p);
    const link = await this.db.provenanceLink.create({
      data: {
        organizationId: this.orgId(p),
        fromRecordId: input.fromRecordId,
        toRecordId: input.toRecordId,
        relation: input.relation as never,
        note: input.note as string | undefined,
        createdByUserId: p.userId,
      },
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('Provenance link already exists');
      }
      throw error;
    });
    await this.emit(
      p, PROVENANCE_KAFKA_TOPICS.LINK_CREATED, 'provenance.link.created',
      'provenance_link', link.id, { linkId: link.id, relation: link.relation },
    );
    return link;
  }

  async listLinks(p: Principal, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.ProvenanceLinkWhereInput = {
      organizationId: this.orgId(p),
      deletedAt: null,
      relation: query.relation as never,
      fromRecordId: query.fromRecordId,
      toRecordId: query.toRecordId,
    };
    const [items, total] = await this.db.$transaction([
      this.db.provenanceLink.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' },
      }),
      this.db.provenanceLink.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async lineage(recordId: string, p: Principal, query: Record<string, string | undefined>) {
    await this.get(recordId, p);
    const direction = (query.direction as 'ancestors' | 'descendants' | 'both' | undefined) ?? 'both';
    const depth = Math.max(1, Math.min(12, Number(query.depth) || 8));
    const links = await this.db.provenanceLink.findMany({
      where: { organizationId: this.orgId(p), deletedAt: null },
      select: { fromRecordId: true, toRecordId: true, relation: true, id: true },
    });
    const ids = walkLineageIds(recordId, links, direction, depth);
    const records = await this.db.provenanceRecord.findMany({
      where: { id: { in: ids }, organizationId: this.orgId(p) },
      orderBy: { capturedAt: 'asc' },
    });
    const relatedLinks = links.filter(
      (link) => ids.includes(link.fromRecordId) && ids.includes(link.toRecordId),
    );
    return { rootRecordId: recordId, records, links: relatedLinks };
  }
}

@ApiTags('Data Provenance')
@ApiBearerAuth()
@Controller({ path: 'provenance', version: '1' })
export class ProvenanceController {
  constructor(
    private readonly service: ProvenanceService,
    private readonly auth: AuthorizationService,
  ) {}

  @Post('records')
  create(@Body() body: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'provenance:record:create');
    return this.service.create(body, p);
  }

  @Get('records')
  list(@Query() query: Record<string, string | undefined>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'provenance:record:read');
    return this.service.list(p, query);
  }

  @Get('records/:id')
  get(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'provenance:record:read');
    return this.service.get(id, p);
  }

  @Post('records/:id/verify')
  verify(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'provenance:record:verify');
    return this.service.verifyRecord(id, p);
  }

  @Post('records/:id/revoke')
  revoke(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'provenance:record:revoke');
    return this.service.revokeRecord(id, p);
  }

  @Get('subjects/:subjectType/:subjectId')
  forSubject(
    @Param('subjectType') subjectType: string,
    @Param('subjectId') subjectId: string,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'provenance:record:read');
    return this.service.forSubject(subjectType, subjectId, p);
  }

  @Get('subjects/:subjectType/:subjectId/chain')
  verifyChain(
    @Param('subjectType') subjectType: string,
    @Param('subjectId') subjectId: string,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'provenance:lineage:read');
    return this.service.verifySubjectChain(subjectType, subjectId, p);
  }

  @Get('lineage/:recordId')
  lineage(
    @Param('recordId') recordId: string,
    @Query() query: Record<string, string | undefined>,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'provenance:lineage:read');
    return this.service.lineage(recordId, p, query);
  }

  @Post('links')
  createLink(@Body() body: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'provenance:link:create');
    return this.service.createLink(body, p);
  }

  @Get('links')
  listLinks(@Query() query: Record<string, string | undefined>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'provenance:link:read');
    return this.service.listLinks(p, query);
  }
}

@Module({
  controllers: [ProvenanceController],
  providers: [ProvenanceService],
  exports: [ProvenanceService],
})
export class ProvenanceModule {}
