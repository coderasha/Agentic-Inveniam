import { Injectable } from '@nestjs/common';
import type {
  AbacPolicyResponse,
  CreateAbacPolicyInput,
} from '@gain/shared';
import { Prisma } from '@gain/database';
import type {
  AbacPolicyListFilters,
  AbacPolicyRepository,
} from '../../../domain/identity/ports/abac-policy.repository';
import {
  ConflictError,
  NotFoundError,
  OptimisticLockError,
} from '../../../domain/identity/errors';
import { PrismaService } from './prisma.service';
import { mapAbacPolicy } from './mappers';

@Injectable()
export class PrismaAbacPolicyRepository implements AbacPolicyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateAbacPolicyInput): Promise<AbacPolicyResponse> {
    try {
      const policy = await this.prisma.abacPolicy.create({
        data: {
          organizationId: input.organizationId,
          name: input.name,
          description: input.description,
          effect: input.effect,
          resourceType: input.resourceType,
          actions: input.actions,
          conditions: input.conditions as Prisma.InputJsonValue,
          priority: input.priority ?? 100,
          enabled: input.enabled ?? true,
        },
      });
      return mapAbacPolicy(policy);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictError(
          `ABAC policy '${input.name}' already exists in organization`,
        );
      }
      throw error;
    }
  }

  async findById(id: string): Promise<AbacPolicyResponse | null> {
    const policy = await this.prisma.abacPolicy.findFirst({
      where: { id, deletedAt: null },
    });
    return policy ? mapAbacPolicy(policy) : null;
  }

  async list(filters: AbacPolicyListFilters): Promise<{
    items: AbacPolicyResponse[];
    total: number;
  }> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const where: Prisma.AbacPolicyWhereInput = {
      organizationId: filters.organizationId,
      deletedAt: null,
      ...(filters.resourceType ? { resourceType: filters.resourceType } : {}),
      ...(filters.enabled !== undefined ? { enabled: filters.enabled } : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.abacPolicy.count({ where }),
      this.prisma.abacPolicy.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      }),
    ]);

    return { items: rows.map(mapAbacPolicy), total };
  }

  async findApplicable(params: {
    organizationId: string;
    resourceType: string;
    action: string;
  }): Promise<AbacPolicyResponse[]> {
    const policies = await this.prisma.abacPolicy.findMany({
      where: {
        organizationId: params.organizationId,
        resourceType: params.resourceType,
        enabled: true,
        deletedAt: null,
        actions: { has: params.action },
      },
      orderBy: { priority: 'asc' },
    });
    return policies.map(mapAbacPolicy);
  }

  async softDelete(id: string, version: number): Promise<void> {
    const existing = await this.prisma.abacPolicy.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundError('AbacPolicy', id);
    }
    if (existing.version !== version) {
      throw new OptimisticLockError('AbacPolicy');
    }
    await this.prisma.abacPolicy.update({
      where: { id },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
  }
}
