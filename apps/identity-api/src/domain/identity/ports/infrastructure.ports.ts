import type { DomainEvent } from '@gain/shared';

export interface OutboxMessage {
  id: string;
  topic: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  headers: Record<string, unknown>;
  status: 'pending' | 'published' | 'failed';
  attempts: number;
}

export interface OutboxRepository {
  enqueue(event: DomainEvent, topic: string): Promise<OutboxMessage>;
  claimPending(limit: number): Promise<OutboxMessage[]>;
  markPublished(id: string): Promise<void>;
  markFailed(id: string, error: string, retryDelayMs: number): Promise<void>;
}

export interface EventPublisher {
  publish(topic: string, event: DomainEvent): Promise<void>;
}

export interface CachePort {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  delByPrefix(prefix: string): Promise<void>;
}

export interface VerifiedToken {
  subject: string;
  email: string;
  emailVerified: boolean;
  sessionId?: string;
  audience: string | string[];
  expiresAt: number;
  claims: Record<string, unknown>;
}

export interface TokenVerifier {
  verifyAccessToken(token: string): Promise<VerifiedToken>;
}

export interface CryptoPort {
  hashToken(raw: string): string;
  generateInvitationToken(): { raw: string; hash: string };
  generateApiKey(): { raw: string; prefix: string; hash: string };
  timingSafeEqual(a: string, b: string): boolean;
}
