import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import Redis from 'ioredis';
import { Kafka, logLevel, type Producer } from 'kafkajs';
import type { DomainEvent } from '@gain/shared';
import type { CachePort, CryptoPort, EventPublisher, OutboxRepository } from '../domain/twin/ports';
import { EVENT_PUBLISHER, OUTBOX_REPOSITORY } from '../domain/twin/tokens';

@Injectable()
export class NodeCryptoService implements CryptoPort {
  hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }
}

@Injectable()
export class RedisCacheService implements CachePort, OnModuleInit, OnModuleDestroy {
  private client!: Redis;
  constructor(private readonly config: ConfigService) {}
  onModuleInit(): void {
    this.client = new Redis(this.config.getOrThrow<string>('REDIS_URL'), { maxRetriesPerRequest: 3 });
  }
  async onModuleDestroy(): Promise<void> { if (this.client) await this.client.quit(); }
  async get<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    return value ? JSON.parse(value) as T : null;
  }
  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }
  async del(key: string): Promise<void> { await this.client.del(key); }
  async ping(): Promise<boolean> { return (await this.client.ping()) === 'PONG'; }
}

@Injectable()
export class KafkaEventPublisher implements EventPublisher, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaEventPublisher.name);
  private producer!: Producer;
  private connected = false;
  constructor(private readonly config: ConfigService) {}
  async onModuleInit(): Promise<void> {
    this.producer = new Kafka({
      clientId: this.config.getOrThrow<string>('KAFKA_CLIENT_ID'),
      brokers: this.config.getOrThrow<string>('KAFKA_BROKERS').split(',').map((x) => x.trim()),
      logLevel: logLevel.WARN,
    }).producer({ idempotent: true, allowAutoTopicCreation: true });
    try { await this.producer.connect(); this.connected = true; }
    catch (error) { this.logger.warn(`Kafka unavailable: ${error instanceof Error ? error.message : String(error)}`); }
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
export class OutboxRelay {
  private running = false;
  constructor(
    @Inject(OUTBOX_REPOSITORY) private readonly outbox: OutboxRepository,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}
  @Interval(2000)
  async relay(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const message of await this.outbox.claimPending(50)) {
        try {
          await this.publisher.publish(message.topic, message.payload as unknown as DomainEvent);
          await this.outbox.markPublished(message.id);
        } catch (error) {
          await this.outbox.markFailed(
            message.id, error instanceof Error ? error.message : String(error),
            Math.min(60_000, 2000 * (message.attempts + 1)),
          );
        }
      }
    } finally { this.running = false; }
  }
}
