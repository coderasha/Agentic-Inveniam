import type { DomainEvent } from '@gain/shared';
import type {
  AttributeDataType, DigitalTwin, InsightKind, ListQuery, Page, RelationshipType,
  SignalSeverity, TwinAssetClass, TwinAttribute, TwinInsight, TwinLifecycleStage,
  TwinRelationship, TwinSignal, TwinStatus,
} from './models';
import type { VerifiedToken } from './auth.types';

export interface CreateTwinInput {
  organizationId: string; name: string; slug: string; description?: string;
  assetClass: TwinAssetClass; lifecycleStage?: TwinLifecycleStage;
  externalReference?: string; currencyCode?: string; tags?: string[];
  metadata?: Record<string, unknown>;
}
export interface UpdateTwinInput {
  name?: string; slug?: string; description?: string | null;
  assetClass?: TwinAssetClass; lifecycleStage?: TwinLifecycleStage;
  status?: TwinStatus; externalReference?: string | null; currencyCode?: string;
  tags?: string[]; metadata?: Record<string, unknown>; completenessScore?: number;
  publishedAt?: Date | null;
}
export interface TwinRepository {
  create(input: CreateTwinInput): Promise<DigitalTwin>;
  findById(id: string, organizationId: string): Promise<DigitalTwin | null>;
  list(organizationId: string, query: ListQuery): Promise<Page<DigitalTwin>>;
  update(id: string, organizationId: string, input: UpdateTwinInput): Promise<DigitalTwin>;
  softDelete(id: string, organizationId: string): Promise<void>;
}
export interface UpsertAttributeInput {
  key: string; label: string; dataType: AttributeDataType; value: unknown;
  unit?: string; source?: string; confidence?: number; effectiveAt?: Date;
}
export interface AttributeRepository {
  upsert(twinId: string, input: UpsertAttributeInput): Promise<TwinAttribute>;
  list(twinId: string): Promise<TwinAttribute[]>;
}
export interface RelationshipRepository {
  create(input: {
    organizationId: string; fromTwinId: string; toTwinId: string;
    relationshipType: RelationshipType; label?: string; metadata?: Record<string, unknown>;
  }): Promise<TwinRelationship>;
  list(twinId: string, organizationId: string): Promise<TwinRelationship[]>;
}
export interface SignalRepository {
  create(twinId: string, input: {
    signalType: string; severity: SignalSeverity; title: string;
    payload: Record<string, unknown>; source?: string; observedAt: Date;
  }): Promise<TwinSignal>;
  list(twinId: string, limit?: number): Promise<TwinSignal[]>;
}
export interface InsightRepository {
  create(twinId: string, input: {
    kind: InsightKind; title: string; summary: string; confidence: number;
    model: string; evidence: Record<string, unknown>; generatedAt: Date;
  }): Promise<TwinInsight>;
  list(twinId: string): Promise<TwinInsight[]>;
}
export interface OutboxMessage {
  id: string; topic: string; aggregateId: string; eventType: string;
  payload: Record<string, unknown>; attempts: number;
}
export interface OutboxRepository {
  enqueue(event: DomainEvent, topic: string): Promise<void>;
  claimPending(limit: number): Promise<OutboxMessage[]>;
  markPublished(id: string): Promise<void>;
  markFailed(id: string, error: string, retryDelayMs: number): Promise<void>;
}
export interface EventPublisher {
  publish(topic: string, event: DomainEvent): Promise<void>;
  isHealthy(): Promise<boolean>;
}
export interface CachePort {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  ping(): Promise<boolean>;
}
export interface TokenVerifier { verifyAccessToken(token: string): Promise<VerifiedToken> }
export interface CryptoPort { hash(value: string): string }
