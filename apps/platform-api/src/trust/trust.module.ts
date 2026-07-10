import {
  Body, Controller, Get, Injectable, Module, Param, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@gain/database';
import { TRUST_KAFKA_TOPICS, type DomainEvent } from '@gain/shared';
import { createHash } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { AuthorizationService, CurrentPrincipal, type Principal } from '../common/auth';
import { NotFoundError, ValidationError } from '../common/errors';
import { OutboxService, PrismaService } from '../infrastructure/services';
import { computeTrustScore } from './scoring';

const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;
const HASH_RE = /^[a-f0-9]{64}$/;

@Injectable()
export class TrustService {
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

  async createAttestation(input: Record<string, unknown>, p: Principal) {
    if (typeof input.subjectType !== 'string' || typeof input.subjectId !== 'string'
      || typeof input.statement !== 'string') {
      throw new ValidationError('subjectType, subjectId and statement are required');
    }
    if (input.evidenceHash && (typeof input.evidenceHash !== 'string' || !HASH_RE.test(input.evidenceHash))) {
      throw new ValidationError('evidenceHash must be a SHA-256 hex digest');
    }
    if (typeof input.provenanceRecordId === 'string') {
      const record = await this.db.provenanceRecord.findFirst({
        where: { id: input.provenanceRecordId, organizationId: this.orgId(p) },
      });
      if (!record) throw new NotFoundError('ProvenanceRecord', input.provenanceRecordId);
    }

    const row = await this.db.trustAttestation.create({
      data: {
        organizationId: this.orgId(p),
        subjectType: input.subjectType as never,
        subjectId: input.subjectId,
        kind: (input.kind as never) ?? 'data_quality',
        statement: input.statement,
        evidenceHash: input.evidenceHash as string | undefined,
        provenanceRecordId: input.provenanceRecordId as string | undefined,
        confidence: typeof input.confidence === 'number' ? input.confidence : 0.7,
        weight: typeof input.weight === 'number' ? input.weight : 1,
        expiresAt: input.expiresAt ? new Date(input.expiresAt as string) : undefined,
        metadata: json(input.metadata ?? {}),
        createdByUserId: p.userId,
      },
    });

    await this.emit(
      p, TRUST_KAFKA_TOPICS.ATTESTATION_CREATED, 'trust.attestation.created',
      'trust_attestation', row.id, { attestationId: row.id },
    );
    return row;
  }

  async listAttestations(p: Principal, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.TrustAttestationWhereInput = {
      organizationId: this.orgId(p),
      subjectType: query.subjectType as never,
      subjectId: query.subjectId,
      status: query.status as never,
    };
    const [items, total] = await this.db.$transaction([
      this.db.trustAttestation.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' },
      }),
      this.db.trustAttestation.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async revokeAttestation(id: string, p: Principal) {
    const row = await this.db.trustAttestation.findFirst({
      where: { id, organizationId: this.orgId(p) },
    });
    if (!row) throw new NotFoundError('TrustAttestation', id);
    const updated = await this.db.trustAttestation.update({
      where: { id },
      data: { status: 'revoked', revokedAt: new Date() },
    });
    await this.emit(
      p, TRUST_KAFKA_TOPICS.ATTESTATION_REVOKED, 'trust.attestation.revoked',
      'trust_attestation', id, { attestationId: id },
    );
    return updated;
  }

  async getScore(subjectType: string, subjectId: string, p: Principal) {
    const score = await this.db.trustScore.findFirst({
      where: {
        organizationId: this.orgId(p),
        subjectType: subjectType as never,
        subjectId,
      },
    });
    if (!score) throw new NotFoundError('TrustScore', `${subjectType}:${subjectId}`);
    return score;
  }

  async computeScore(subjectType: string, subjectId: string, p: Principal) {
    const organizationId = this.orgId(p);
    const provenanceCompatible = new Set([
      'twin', 'document', 'asset', 'graph_node', 'claim', 'custom',
    ]);

    const [attestations, provenanceRows, anchors] = await Promise.all([
      this.db.trustAttestation.findMany({
        where: { organizationId, subjectType: subjectType as never, subjectId },
      }),
      provenanceCompatible.has(subjectType)
        ? this.db.provenanceRecord.findMany({
          where: {
            organizationId,
            subjectType: subjectType as never,
            subjectId,
          },
        })
        : Promise.resolve([]),
      this.db.trustAnchor.findMany({
        where: { organizationId, subjectType: subjectType as never, subjectId },
      }),
    ]);

    const computed = computeTrustScore({
      attestations: attestations.map((row) => ({
        confidence: row.confidence,
        weight: row.weight,
        status: row.status,
        kind: row.kind,
        expiresAt: row.expiresAt?.toISOString() ?? null,
      })),
      provenance: provenanceRows.map((row) => ({
        status: row.status as 'recorded' | 'verified' | 'disputed' | 'revoked',
        confidence: row.confidence,
      })),
      anchors: anchors.map((row) => ({ status: row.status })),
    });

    const existing = await this.db.trustScore.findFirst({
      where: { organizationId, subjectType: subjectType as never, subjectId },
    });

    const saved = existing
      ? await this.db.trustScore.update({
        where: { id: existing.id },
        data: {
          score: computed.score,
          grade: computed.grade,
          components: json(computed.components),
          attestationCount: computed.components.activeAttestations,
          provenanceCount: computed.components.verifiedProvenance,
          computedAt: new Date(),
        },
      })
      : await this.db.trustScore.create({
        data: {
          organizationId,
          subjectType: subjectType as never,
          subjectId,
          score: computed.score,
          grade: computed.grade,
          components: json(computed.components),
          attestationCount: computed.components.activeAttestations,
          provenanceCount: computed.components.verifiedProvenance,
        },
      });

    await this.emit(
      p, TRUST_KAFKA_TOPICS.SCORE_COMPUTED, 'trust.score.computed',
      'trust_score', saved.id, { subjectType, subjectId, score: saved.score, grade: saved.grade },
    );
    return saved;
  }

  async createAnchor(input: Record<string, unknown>, p: Principal) {
    if (typeof input.subjectType !== 'string' || typeof input.subjectId !== 'string'
      || typeof input.payloadHash !== 'string' || !HASH_RE.test(input.payloadHash)) {
      throw new ValidationError('subjectType, subjectId and payloadHash are required');
    }
    const network = (input.network as string | undefined) ?? 'offchain';
    const now = new Date();
    // Off-chain anchor: deterministic receipt ref. On-chain networks stay pending until a connector lands.
    const anchored = network === 'offchain';
    const anchorRef = anchored
      ? `offchain:${createHash('sha256').update(`${input.payloadHash}:${now.toISOString()}`).digest('hex').slice(0, 32)}`
      : undefined;

    const row = await this.db.trustAnchor.create({
      data: {
        organizationId: this.orgId(p),
        subjectType: input.subjectType as never,
        subjectId: input.subjectId,
        payloadHash: input.payloadHash,
        network,
        status: anchored ? 'anchored' : 'pending',
        anchorRef,
        anchoredAt: anchored ? now : undefined,
        metadata: json(input.metadata ?? {}),
        createdByUserId: p.userId,
      },
    });

    await this.emit(
      p, TRUST_KAFKA_TOPICS.ANCHOR_CREATED, 'trust.anchor.created',
      'trust_anchor', row.id, { anchorId: row.id, network, status: row.status },
    );
    return row;
  }

  async listAnchors(p: Principal, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.TrustAnchorWhereInput = {
      organizationId: this.orgId(p),
      subjectType: query.subjectType as never,
      subjectId: query.subjectId,
      status: query.status as never,
    };
    const [items, total] = await this.db.$transaction([
      this.db.trustAnchor.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' },
      }),
      this.db.trustAnchor.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async listScores(p: Principal, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.TrustScoreWhereInput = {
      organizationId: this.orgId(p),
      subjectType: query.subjectType as never,
    };
    const [items, total] = await this.db.$transaction([
      this.db.trustScore.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { score: 'desc' },
      }),
      this.db.trustScore.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
}

@ApiTags('Trust Engine')
@ApiBearerAuth()
@Controller({ path: 'trust', version: '1' })
export class TrustController {
  constructor(
    private readonly service: TrustService,
    private readonly auth: AuthorizationService,
  ) {}

  @Post('attestations')
  createAttestation(@Body() body: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'trust:attestation:create');
    return this.service.createAttestation(body, p);
  }

  @Get('attestations')
  listAttestations(@Query() query: Record<string, string | undefined>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'trust:attestation:read');
    return this.service.listAttestations(p, query);
  }

  @Post('attestations/:id/revoke')
  revokeAttestation(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'trust:attestation:revoke');
    return this.service.revokeAttestation(id, p);
  }

  @Get('scores')
  listScores(@Query() query: Record<string, string | undefined>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'trust:score:read');
    return this.service.listScores(p, query);
  }

  @Get('scores/:subjectType/:subjectId')
  getScore(
    @Param('subjectType') subjectType: string,
    @Param('subjectId') subjectId: string,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'trust:score:read');
    return this.service.getScore(subjectType, subjectId, p);
  }

  @Post('scores/:subjectType/:subjectId/compute')
  computeScore(
    @Param('subjectType') subjectType: string,
    @Param('subjectId') subjectId: string,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'trust:score:compute');
    return this.service.computeScore(subjectType, subjectId, p);
  }

  @Post('anchors')
  createAnchor(@Body() body: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'trust:anchor:create');
    return this.service.createAnchor(body, p);
  }

  @Get('anchors')
  listAnchors(@Query() query: Record<string, string | undefined>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'trust:anchor:read');
    return this.service.listAnchors(p, query);
  }
}

@Module({
  controllers: [TrustController],
  providers: [TrustService],
})
export class TrustModule {}
