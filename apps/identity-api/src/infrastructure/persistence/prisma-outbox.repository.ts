import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '@gain/shared';
import { Prisma } from '@gain/database';
import type {
  OutboxMessage,
  OutboxRepository,
} from '../../domain/identity/ports/infrastructure.ports';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaOutboxRepository implements OutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(event: DomainEvent, topic: string): Promise<OutboxMessage> {
    const row = await this.prisma.outboxMessage.create({
      data: {
        topic,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        payload: event as unknown as Prisma.InputJsonValue,
        headers: {
          correlationId: event.correlationId,
          causationId: event.causationId ?? null,
        } as Prisma.InputJsonValue,
        status: 'pending',
      },
    });

    return {
      id: row.id,
      topic: row.topic,
      aggregateType: row.aggregateType,
      aggregateId: row.aggregateId,
      eventType: row.eventType,
      payload: row.payload as Record<string, unknown>,
      headers: row.headers as Record<string, unknown>,
      status: row.status,
      attempts: row.attempts,
    };
  }

  async claimPending(limit: number): Promise<OutboxMessage[]> {
    const now = new Date();
    const pending = await this.prisma.outboxMessage.findMany({
      where: {
        status: 'pending',
        availableAt: { lte: now },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    return pending.map((row) => ({
      id: row.id,
      topic: row.topic,
      aggregateType: row.aggregateType,
      aggregateId: row.aggregateId,
      eventType: row.eventType,
      payload: row.payload as Record<string, unknown>,
      headers: row.headers as Record<string, unknown>,
      status: row.status,
      attempts: row.attempts,
    }));
  }

  async markPublished(id: string): Promise<void> {
    await this.prisma.outboxMessage.update({
      where: { id },
      data: {
        status: 'published',
        publishedAt: new Date(),
      },
    });
  }

  async markFailed(
    id: string,
    error: string,
    retryDelayMs: number,
  ): Promise<void> {
    await this.prisma.outboxMessage.update({
      where: { id },
      data: {
        status: 'pending',
        attempts: { increment: 1 },
        lastError: error.slice(0, 2000),
        availableAt: new Date(Date.now() + retryDelayMs),
      },
    });
  }
}
