import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { Prisma, PrismaClient } from '@gain/database';
import type { DomainEvent } from '@gain/shared';
import Redis from 'ioredis';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { Kafka, logLevel, type Producer } from 'kafkajs';
import type { TokenVerifier, VerifiedToken } from '../common/auth';
import { UnauthorizedError } from '../common/errors';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService) {
    super({
      datasources: { db: { url: config.getOrThrow<string>('DATABASE_URL') } },
      log: config.get<string>('NODE_ENV') === 'development' ? ['error', 'warn'] : ['error'],
    });
  }
  async onModuleInit(): Promise<void> { await this.$connect(); }
  async onModuleDestroy(): Promise<void> { await this.$disconnect(); }
}

@Injectable()
export class KeycloakTokenVerifier implements TokenVerifier {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;
  private readonly audience: string;
  constructor(config: ConfigService) {
    this.issuer = config.getOrThrow('KEYCLOAK_ISSUER');
    this.audience = config.getOrThrow('KEYCLOAK_AUDIENCE');
    this.jwks = createRemoteJWKSet(new URL(config.getOrThrow('KEYCLOAK_JWKS_URI')));
  }
  async verifyAccessToken(token: string): Promise<VerifiedToken> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, { issuer: this.issuer });
      const aud = payload.aud;
      if (!(payload.azp === this.audience || aud === this.audience ||
        (Array.isArray(aud) && aud.includes(this.audience)))) throw new Error('invalid audience');
      return mapToken(payload);
    } catch { throw new UnauthorizedError('Invalid or expired access token'); }
  }
}
function mapToken(payload: JWTPayload): VerifiedToken {
  const email = typeof payload.email === 'string' ? payload.email :
    typeof payload.preferred_username === 'string' ? payload.preferred_username : null;
  if (!payload.sub || !email) throw new UnauthorizedError('Token missing required claims');
  return { subject: payload.sub, email: email.toLowerCase(), claims: payload as Record<string, unknown> };
}

@Injectable()
export class CompositeTokenVerifier implements TokenVerifier {
  private readonly devSecret: Uint8Array | null;
  private readonly audience: string;
  constructor(private readonly keycloak: KeycloakTokenVerifier, config: ConfigService) {
    const secret = config.get<string>('IDENTITY_DEV_AUTH_SECRET');
    this.audience = config.getOrThrow('KEYCLOAK_AUDIENCE');
    this.devSecret = config.get('NODE_ENV') === 'development' && secret && secret.length >= 32
      ? new TextEncoder().encode(secret) : null;
  }
  async verifyAccessToken(token: string): Promise<VerifiedToken> {
    if (this.devSecret) {
      try {
        const { payload } = await jwtVerify(token, this.devSecret, {
          algorithms: ['HS256'], audience: this.audience, issuer: 'gain-identity-dev',
        });
        return mapToken(payload);
      } catch { /* try Keycloak */ }
    }
    return this.keycloak.verifyAccessToken(token);
  }
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client!: Redis;
  constructor(private readonly config: ConfigService) {}
  onModuleInit(): void { this.client = new Redis(this.config.getOrThrow('REDIS_URL')); }
  async onModuleDestroy(): Promise<void> { await this.client?.quit(); }
  async ping(): Promise<boolean> { return (await this.client.ping()) === 'PONG'; }
}

@Injectable()
export class KafkaPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaPublisher.name);
  private producer!: Producer;
  private connected = false;
  constructor(private readonly config: ConfigService) {}
  async onModuleInit(): Promise<void> {
    this.producer = new Kafka({
      clientId: this.config.getOrThrow('KAFKA_CLIENT_ID'),
      brokers: this.config.getOrThrow<string>('KAFKA_BROKERS').split(',').map((x) => x.trim()),
      logLevel: logLevel.WARN,
    }).producer({ idempotent: true, allowAutoTopicCreation: true });
    try { await this.producer.connect(); this.connected = true; }
    catch (error) { this.logger.warn(`Kafka unavailable: ${String(error)}`); }
  }
  async onModuleDestroy(): Promise<void> { if (this.connected) await this.producer.disconnect(); }
  async publish(topic: string, event: DomainEvent): Promise<void> {
    if (!this.connected) { await this.producer.connect(); this.connected = true; }
    await this.producer.send({ topic, messages: [{
      key: event.aggregateId, value: JSON.stringify(event),
      headers: { eventType: event.eventType, correlationId: event.correlationId },
    }] });
  }
  async isHealthy(): Promise<boolean> { return this.connected; }
}

@Injectable()
export class OutboxService {
  private running = false;
  constructor(private readonly db: PrismaService, private readonly kafka: KafkaPublisher) {}
  async enqueue(event: DomainEvent, topic: string): Promise<void> {
    await this.db.outboxMessage.create({ data: {
      topic, aggregateType: event.aggregateType, aggregateId: event.aggregateId,
      eventType: event.eventType, payload: event as unknown as Prisma.InputJsonValue,
      headers: { correlationId: event.correlationId },
    } });
  }
  @Interval(2000)
  async relay(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const messages = await this.db.outboxMessage.findMany({
        where: { status: 'pending', availableAt: { lte: new Date() } },
        take: 50, orderBy: { createdAt: 'asc' },
      });
      for (const row of messages) {
        try {
          await this.kafka.publish(row.topic, row.payload as unknown as DomainEvent);
          await this.db.outboxMessage.update({
            where: { id: row.id }, data: { status: 'published', publishedAt: new Date() },
          });
        } catch (error) {
          await this.db.outboxMessage.update({ where: { id: row.id }, data: {
            attempts: { increment: 1 }, lastError: String(error).slice(0, 2000),
            availableAt: new Date(Date.now() + Math.min(60_000, 2000 * (row.attempts + 1))),
          } });
        }
      }
    } finally { this.running = false; }
  }
}
