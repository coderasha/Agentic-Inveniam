import { Injectable } from '@nestjs/common';
import { Prisma } from '@gain/database';
import type { DomainEvent } from '@gain/shared';
import type {
  AttributeRepository, CreateTwinInput, InsightRepository, OutboxMessage,
  OutboxRepository, RelationshipRepository, SignalRepository, TwinRepository,
  UpdateTwinInput, UpsertAttributeInput,
} from '../../domain/twin/ports';
import type {
  DigitalTwin, ListQuery, Page, TwinAttribute, TwinInsight, TwinRelationship, TwinSignal,
} from '../../domain/twin/models';
import { PrismaService } from './prisma.service';
import {
  mapAttribute, mapInsight, mapRelationship, mapSignal, mapTwin,
} from './mappers';

const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

@Injectable()
export class PrismaTwinRepository implements TwinRepository {
  constructor(private readonly db: PrismaService) {}
  async create(input: CreateTwinInput): Promise<DigitalTwin> {
    return mapTwin(await this.db.digitalTwin.create({ data: {
      ...input, metadata: json(input.metadata ?? {}),
    } }));
  }
  async findById(id: string, organizationId: string): Promise<DigitalTwin | null> {
    const row = await this.db.digitalTwin.findFirst({ where: { id, organizationId, deletedAt: null } });
    return row ? mapTwin(row) : null;
  }
  async list(organizationId: string, query: ListQuery): Promise<Page<DigitalTwin>> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const where = { organizationId, deletedAt: null };
    const [rows, total] = await this.db.$transaction([
      this.db.digitalTwin.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { updatedAt: 'desc' } }),
      this.db.digitalTwin.count({ where }),
    ]);
    return { items: rows.map(mapTwin), total, page, pageSize };
  }
  async update(id: string, organizationId: string, input: UpdateTwinInput): Promise<DigitalTwin> {
    const current = await this.db.digitalTwin.findFirstOrThrow({ where: { id, organizationId, deletedAt: null } });
    const row = await this.db.digitalTwin.update({ where: { id }, data: {
      ...input,
      metadata: input.metadata === undefined ? undefined : json(input.metadata),
      version: { increment: 1 },
    } });
    await this.db.twinVersion.create({ data: {
      twinId: id, version: row.version, snapshot: json(current),
    } });
    return mapTwin(row);
  }
  async softDelete(id: string, organizationId: string): Promise<void> {
    await this.db.digitalTwin.updateMany({ where: { id, organizationId, deletedAt: null }, data: { deletedAt: new Date() } });
  }
}

@Injectable()
export class PrismaAttributeRepository implements AttributeRepository {
  constructor(private readonly db: PrismaService) {}
  async upsert(twinId: string, input: UpsertAttributeInput): Promise<TwinAttribute> {
    const row = await this.db.twinAttribute.upsert({
      where: { twinId_key: { twinId, key: input.key } },
      create: { ...input, twinId, value: json(input.value) },
      update: { ...input, value: json(input.value), deletedAt: null, version: { increment: 1 } },
    });
    return mapAttribute(row);
  }
  async list(twinId: string): Promise<TwinAttribute[]> {
    return (await this.db.twinAttribute.findMany({ where: { twinId, deletedAt: null }, orderBy: { key: 'asc' } })).map(mapAttribute);
  }
}

@Injectable()
export class PrismaRelationshipRepository implements RelationshipRepository {
  constructor(private readonly db: PrismaService) {}
  async create(input: Parameters<RelationshipRepository['create']>[0]): Promise<TwinRelationship> {
    return mapRelationship(await this.db.twinRelationship.create({ data: {
      ...input, metadata: json(input.metadata ?? {}),
    } }));
  }
  async list(twinId: string, organizationId: string): Promise<TwinRelationship[]> {
    return (await this.db.twinRelationship.findMany({
      where: { organizationId, deletedAt: null, OR: [{ fromTwinId: twinId }, { toTwinId: twinId }] },
      orderBy: { createdAt: 'desc' },
    })).map(mapRelationship);
  }
}

@Injectable()
export class PrismaSignalRepository implements SignalRepository {
  constructor(private readonly db: PrismaService) {}
  async create(twinId: string, input: Parameters<SignalRepository['create']>[1]): Promise<TwinSignal> {
    return mapSignal(await this.db.twinSignal.create({ data: { ...input, twinId, payload: json(input.payload) } }));
  }
  async list(twinId: string, limit = 100): Promise<TwinSignal[]> {
    return (await this.db.twinSignal.findMany({
      where: { twinId }, take: Math.min(500, limit), orderBy: { observedAt: 'desc' },
    })).map(mapSignal);
  }
}

@Injectable()
export class PrismaInsightRepository implements InsightRepository {
  constructor(private readonly db: PrismaService) {}
  async create(twinId: string, input: Parameters<InsightRepository['create']>[1]): Promise<TwinInsight> {
    return mapInsight(await this.db.twinInsight.create({ data: { ...input, twinId, evidence: json(input.evidence) } }));
  }
  async list(twinId: string): Promise<TwinInsight[]> {
    return (await this.db.twinInsight.findMany({ where: { twinId }, orderBy: { generatedAt: 'desc' } })).map(mapInsight);
  }
}

@Injectable()
export class PrismaOutboxRepository implements OutboxRepository {
  constructor(private readonly db: PrismaService) {}
  async enqueue(event: DomainEvent, topic: string): Promise<void> {
    await this.db.outboxMessage.create({ data: {
      topic, aggregateType: event.aggregateType, aggregateId: event.aggregateId,
      eventType: event.eventType, payload: json(event), headers: json({ correlationId: event.correlationId }),
    } });
  }
  async claimPending(limit: number): Promise<OutboxMessage[]> {
    const rows = await this.db.outboxMessage.findMany({
      where: { status: 'pending', availableAt: { lte: new Date() } },
      take: limit, orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id, topic: row.topic, aggregateId: row.aggregateId, eventType: row.eventType,
      payload: row.payload as Record<string, unknown>, attempts: row.attempts,
    }));
  }
  async markPublished(id: string): Promise<void> {
    await this.db.outboxMessage.update({ where: { id }, data: { status: 'published', publishedAt: new Date() } });
  }
  async markFailed(id: string, error: string, retryDelayMs: number): Promise<void> {
    await this.db.outboxMessage.update({ where: { id }, data: {
      status: 'pending', attempts: { increment: 1 }, lastError: error.slice(0, 2000),
      availableAt: new Date(Date.now() + retryDelayMs),
    } });
  }
}
