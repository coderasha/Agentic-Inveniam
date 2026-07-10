import { Injectable } from '@nestjs/common';
import type {
  CreateRoleInput,
  RoleResponse,
  UpdateRoleInput,
} from '@gain/shared';
import { Prisma } from '@gain/database';
import type {
  RoleListFilters,
  RoleRepository,
} from '../../../domain/identity/ports/role.repository';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  OptimisticLockError,
} from '../../../domain/identity/errors';
import { PrismaService } from './prisma.service';
import { mapRole } from './mappers';

@Injectable()
export class PrismaRoleRepository implements RoleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateRoleInput): Promise<RoleResponse> {
    try {
      const role = await this.prisma.role.create({
        data: {
          organizationId: input.organizationId,
          name: input.name,
          slug: input.slug,
          description: input.description,
          permissions: input.permissions,
          isSystem: input.isSystem ?? false,
        },
      });
      return mapRole(role);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictError(`Role slug '${input.slug}' already exists`);
      }
      throw error;
    }
  }

  async findById(id: string): Promise<RoleResponse | null> {
    const role = await this.prisma.role.findFirst({
      where: { id, deletedAt: null },
    });
    return role ? mapRole(role) : null;
  }

  async findByIds(ids: string[]): Promise<RoleResponse[]> {
    const roles = await this.prisma.role.findMany({
      where: { id: { in: ids }, deletedAt: null },
    });
    return roles.map(mapRole);
  }

  async list(
    filters: RoleListFilters,
  ): Promise<{ items: RoleResponse[]; total: number }> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const where: Prisma.RoleWhereInput = {
      deletedAt: null,
      OR: [
        ...(filters.includeSystem !== false
          ? [{ organizationId: null, isSystem: true }]
          : []),
        ...(filters.organizationId
          ? [{ organizationId: filters.organizationId }]
          : filters.organizationId === null
            ? []
            : [{ organizationId: { not: null } }]),
      ],
      ...(filters.search
        ? {
            AND: [
              {
                OR: [
                  { name: { contains: filters.search, mode: 'insensitive' } },
                  { slug: { contains: filters.search, mode: 'insensitive' } },
                ],
              },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.role.count({ where }),
      this.prisma.role.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { name: 'asc' },
      }),
    ]);

    return { items: rows.map(mapRole), total };
  }

  async update(id: string, input: UpdateRoleInput): Promise<RoleResponse> {
    const existing = await this.prisma.role.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundError('Role', id);
    }
    if (existing.isSystem) {
      throw new ForbiddenError('System roles cannot be modified');
    }
    if (existing.version !== input.version) {
      throw new OptimisticLockError('Role');
    }

    const updated = await this.prisma.role.update({
      where: { id },
      data: {
        name: input.name,
        description:
          input.description === undefined ? undefined : input.description,
        permissions: input.permissions,
        version: { increment: 1 },
      },
    });

    return mapRole(updated);
  }

  async softDelete(id: string, version: number): Promise<void> {
    const existing = await this.prisma.role.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundError('Role', id);
    }
    if (existing.isSystem) {
      throw new ForbiddenError('System roles cannot be deleted');
    }
    if (existing.version !== version) {
      throw new OptimisticLockError('Role');
    }

    await this.prisma.role.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        version: { increment: 1 },
      },
    });
  }
}
