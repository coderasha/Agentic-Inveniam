import { Inject, Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import type { DomainEvent } from '@gain/shared';
import type { AuthenticatedPrincipal } from '../domain/twin/auth.types';
import { ForbiddenError, NotFoundError, ValidationError } from '../domain/twin/errors';
import type {
  AttributeRepository, CachePort, CreateTwinInput, InsightRepository,
  OutboxRepository, RelationshipRepository, SignalRepository, TwinRepository,
  UpdateTwinInput, UpsertAttributeInput,
} from '../domain/twin/ports';
import type { DigitalTwin, TwinInsight } from '../domain/twin/models';
import type { ListQuery } from '../domain/twin/models';
import {
  ATTRIBUTE_REPOSITORY, CACHE_PORT, INSIGHT_REPOSITORY, OUTBOX_REPOSITORY,
  RELATIONSHIP_REPOSITORY, SIGNAL_REPOSITORY, TWIN_REPOSITORY,
} from '../domain/twin/tokens';
import { analyzeTwin, calculateCompletenessScore } from './scoring';

@Injectable()
export class AuthorizationService {
  require(principal: AuthenticatedPrincipal, permission: `twin:${string}`): void {
    if (!principal.permissions.includes(permission) && !principal.permissions.includes('twin:*')) {
      throw new ForbiddenError(`Permission '${permission}' is required`);
    }
    if (!principal.organizationId) throw new ForbiddenError('x-organization-id is required');
  }
}

const event = (
  eventType: string, twinId: string, principal: AuthenticatedPrincipal,
  payload: Record<string, unknown>,
): DomainEvent => ({
  eventId: uuidv4(), eventType, aggregateType: 'DigitalTwin', aggregateId: twinId,
  occurredAt: new Date().toISOString(), correlationId: principal.correlationId,
  actorUserId: principal.userId, organizationId: principal.organizationId ?? null,
  payload, metadata: { service: 'twin-api' },
});

@Injectable()
export class TwinService {
  constructor(
    @Inject(TWIN_REPOSITORY) private readonly twins: TwinRepository,
    @Inject(ATTRIBUTE_REPOSITORY) private readonly attributes: AttributeRepository,
    @Inject(OUTBOX_REPOSITORY) private readonly outbox: OutboxRepository,
    @Inject(CACHE_PORT) private readonly cache: CachePort,
  ) {}
  async create(input: Omit<CreateTwinInput, 'organizationId'>, principal: AuthenticatedPrincipal): Promise<DigitalTwin> {
    const organizationId = principal.organizationId!;
    const created = await this.twins.create({ ...input, organizationId });
    const completenessScore = calculateCompletenessScore({
      ...created, attributeCount: 0,
    });
    return completenessScore === 0
      ? created
      : this.twins.update(created.id, organizationId, { completenessScore });
  }
  list(principal: AuthenticatedPrincipal, query: ListQuery) {
    return this.twins.list(principal.organizationId!, query);
  }
  async get(id: string, principal: AuthenticatedPrincipal): Promise<DigitalTwin> {
    const key = `twin:${principal.organizationId}:${id}`;
    const cached = await this.cache.get<DigitalTwin>(key);
    if (cached) return cached;
    const twin = await this.twins.findById(id, principal.organizationId!);
    if (!twin) throw new NotFoundError('Digital twin', id);
    await this.cache.set(key, twin, 60);
    return twin;
  }
  async update(id: string, input: UpdateTwinInput, principal: AuthenticatedPrincipal): Promise<DigitalTwin> {
    const current = await this.get(id, principal);
    const attrs = await this.attributes.list(id);
    const merged = { ...current, ...input };
    input.completenessScore = calculateCompletenessScore({
      ...merged, attributeCount: attrs.length,
    });
    const updated = await this.twins.update(id, principal.organizationId!, input);
    await this.cache.del(`twin:${principal.organizationId}:${id}`);
    return updated;
  }
  async softDelete(id: string, principal: AuthenticatedPrincipal): Promise<void> {
    await this.get(id, principal);
    await this.twins.softDelete(id, principal.organizationId!);
    await this.cache.del(`twin:${principal.organizationId}:${id}`);
  }
  async publish(id: string, principal: AuthenticatedPrincipal): Promise<DigitalTwin> {
    const twin = await this.get(id, principal);
    const attrs = await this.attributes.list(id);
    const completenessScore = calculateCompletenessScore({
      ...twin, status: 'active', attributeCount: attrs.length,
    });
    if (completenessScore < 50) throw new ValidationError('Twin must be at least 50% complete before publishing');
    const published = await this.twins.update(id, principal.organizationId!, {
      status: 'active', publishedAt: new Date(), completenessScore,
    });
    await this.outbox.enqueue(event('TWIN_PUBLISHED', id, principal, { completenessScore }), 'gain.twin.events');
    await this.cache.del(`twin:${principal.organizationId}:${id}`);
    return published;
  }
}

@Injectable()
export class AttributeService {
  constructor(
    @Inject(ATTRIBUTE_REPOSITORY) private readonly attributes: AttributeRepository,
    @Inject(TWIN_REPOSITORY) private readonly twins: TwinRepository,
    @Inject(CACHE_PORT) private readonly cache: CachePort,
  ) {}
  private async ensureTwin(twinId: string, principal: AuthenticatedPrincipal): Promise<DigitalTwin> {
    const twin = await this.twins.findById(twinId, principal.organizationId!);
    if (!twin) throw new NotFoundError('Digital twin', twinId);
    return twin;
  }
  async upsert(twinId: string, input: UpsertAttributeInput, principal: AuthenticatedPrincipal) {
    const twin = await this.ensureTwin(twinId, principal);
    const result = await this.attributes.upsert(twinId, input);
    const count = (await this.attributes.list(twinId)).length;
    await this.twins.update(twinId, principal.organizationId!, {
      completenessScore: calculateCompletenessScore({ ...twin, attributeCount: count }),
    });
    await this.cache.del(`twin:${principal.organizationId}:${twinId}`);
    return result;
  }
  async list(twinId: string, principal: AuthenticatedPrincipal) {
    await this.ensureTwin(twinId, principal);
    return this.attributes.list(twinId);
  }
}

@Injectable()
export class RelationshipService {
  constructor(
    @Inject(RELATIONSHIP_REPOSITORY) private readonly relationships: RelationshipRepository,
    @Inject(TWIN_REPOSITORY) private readonly twins: TwinRepository,
  ) {}
  async create(fromTwinId: string, input: Omit<Parameters<RelationshipRepository['create']>[0], 'organizationId' | 'fromTwinId'>, principal: AuthenticatedPrincipal) {
    const [from, to] = await Promise.all([
      this.twins.findById(fromTwinId, principal.organizationId!),
      this.twins.findById(input.toTwinId, principal.organizationId!),
    ]);
    if (!from) throw new NotFoundError('Digital twin', fromTwinId);
    if (!to) throw new NotFoundError('Digital twin', input.toTwinId);
    if (fromTwinId === input.toTwinId) throw new ValidationError('A twin cannot relate to itself');
    return this.relationships.create({ ...input, fromTwinId, organizationId: principal.organizationId! });
  }
  list(twinId: string, principal: AuthenticatedPrincipal) {
    return this.relationships.list(twinId, principal.organizationId!);
  }
}

@Injectable()
export class SignalService {
  constructor(
    @Inject(SIGNAL_REPOSITORY) private readonly signals: SignalRepository,
    @Inject(TWIN_REPOSITORY) private readonly twins: TwinRepository,
  ) {}
  async ingest(twinId: string, input: Parameters<SignalRepository['create']>[1], principal: AuthenticatedPrincipal) {
    if (!await this.twins.findById(twinId, principal.organizationId!)) throw new NotFoundError('Digital twin', twinId);
    return this.signals.create(twinId, input);
  }
  async list(twinId: string, principal: AuthenticatedPrincipal, limit?: number) {
    if (!await this.twins.findById(twinId, principal.organizationId!)) throw new NotFoundError('Digital twin', twinId);
    return this.signals.list(twinId, limit);
  }
}

@Injectable()
export class InsightService {
  constructor(
    @Inject(INSIGHT_REPOSITORY) private readonly insights: InsightRepository,
    @Inject(TWIN_REPOSITORY) private readonly twins: TwinRepository,
    @Inject(ATTRIBUTE_REPOSITORY) private readonly attributes: AttributeRepository,
    @Inject(SIGNAL_REPOSITORY) private readonly signals: SignalRepository,
    @Inject(OUTBOX_REPOSITORY) private readonly outbox: OutboxRepository,
  ) {}
  async generate(twinId: string, principal: AuthenticatedPrincipal): Promise<TwinInsight> {
    const twin = await this.twins.findById(twinId, principal.organizationId!);
    if (!twin) throw new NotFoundError('Digital twin', twinId);
    const [attributes, signals] = await Promise.all([
      this.attributes.list(twinId), this.signals.list(twinId, 100),
    ]);
    const generatedAt = new Date();
    const analysis = analyzeTwin(twin, attributes, signals);
    const insight = await this.insights.create(twinId, {
      ...analysis, model: 'gain-rules-v1', generatedAt,
    });
    await this.outbox.enqueue(event('TWIN_INSIGHT_GENERATED', twinId, principal, {
      insightId: insight.id, kind: insight.kind, confidence: insight.confidence,
    }), 'gain.twin.events');
    return insight;
  }
  async list(twinId: string, principal: AuthenticatedPrincipal) {
    if (!await this.twins.findById(twinId, principal.organizationId!)) throw new NotFoundError('Digital twin', twinId);
    return this.insights.list(twinId);
  }
}
