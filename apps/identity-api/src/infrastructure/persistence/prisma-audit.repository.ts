import { Injectable } from '@nestjs/common';
import type { AuditLogResponse } from '@gain/shared';
import { Prisma } from '@gain/database';
import type {
  AuditListFilters,
  AuditRepository,
  CreateAuditEntryInput,
} from '../../domain/identity/ports/audit.repository';
import { PrismaService } from './prisma.service';
import { mapAuditLog } from './mappers';

@Injectable()
export class PrismaAuditRepository implements AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateAuditEntryInput): Promise<AuditLogResponse> {
    const log = await this.prisma.auditLog.create({
      data: {
        organizationId: input.organizationId ?? null,
        actorUserId: input.actorUserId ?? null,
        actorType: input.actorType,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        correlationId: input.correlationId,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        changes: (input.changes ??
          Prisma.JsonNull) as Prisma.InputJsonValue,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
    return mapAuditLog(log);
  }

  async list(filters: AuditListFilters): Promise<{
    items: AuditLogResponse[];
    total: number;
  }> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const where: Prisma.AuditLogWhereInput = {
      ...(filters.organizationId
        ? { organizationId: filters.organizationId }
        : {}),
      ...(filters.actorUserId ? { actorUserId: filters.actorUserId } : {}),
      ...(filters.resourceType ? { resourceType: filters.resourceType } : {}),
      ...(filters.resourceId ? { resourceId: filters.resourceId } : {}),
      ...(filters.action ? { action: filters.action } : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: filters.sortOrder ?? 'desc' },
      }),
    ]);

    return { items: rows.map(mapAuditLog), total };
  }
}
