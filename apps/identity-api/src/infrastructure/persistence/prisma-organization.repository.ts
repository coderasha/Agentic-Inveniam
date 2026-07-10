import { Injectable } from '@nestjs/common';
import type {
  CreateOrganizationInput,
  OrganizationResponse,
  UpdateOrganizationInput,
} from '@gain/shared';
import { Prisma } from '@gain/database';
import type {
  OrganizationListFilters,
  OrganizationRepository,
} from '../../../domain/identity/ports/organization.repository';
import {
  ConflictError,
  NotFoundError,
  OptimisticLockError,
} from '../../../domain/identity/errors';
import { PrismaService } from './prisma.service';
import { mapOrganization } from './mappers';

@Injectable()
export class PrismaOrganizationRepository implements OrganizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    input: CreateOrganizationInput,
    actorUserId: string | null,
  ): Promise<OrganizationResponse> {
    try {
      const org = await this.prisma.$transaction(async (tx) => {
        const created = await tx.organization.create({
          data: {
            name: input.name,
            slug: input.slug,
            legalName: input.legalName,
            description: input.description,
            website: input.website,
            industry: input.industry,
            countryCode: input.countryCode,
            timezone: input.timezone ?? 'UTC',
            parentOrganizationId: input.parentOrganizationId,
            settings: (input.settings ?? {}) as Prisma.InputJsonValue,
          },
        });

        await tx.organizationVersion.create({
          data: {
            organizationId: created.id,
            version: created.version,
            snapshot: created as unknown as Prisma.InputJsonValue,
            changedByUserId: actorUserId,
          },
        });

        return created;
      });

      return mapOrganization(org);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictError(
          `Organization slug '${input.slug}' already exists`,
        );
      }
      throw error;
    }
  }

  async findById(
    id: string,
    includeDeleted = false,
  ): Promise<OrganizationResponse | null> {
    const org = await this.prisma.organization.findFirst({
      where: {
        id,
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
    });
    return org ? mapOrganization(org) : null;
  }

  async findBySlug(slug: string): Promise<OrganizationResponse | null> {
    const org = await this.prisma.organization.findFirst({
      where: { slug, deletedAt: null },
    });
    return org ? mapOrganization(org) : null;
  }

  async list(filters: OrganizationListFilters): Promise<{
    items: OrganizationResponse[];
    total: number;
  }> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const where: Prisma.OrganizationWhereInput = {
      deletedAt: null,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.parentOrganizationId
        ? { parentOrganizationId: filters.parentOrganizationId }
        : {}),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: 'insensitive' } },
              { slug: { contains: filters.search, mode: 'insensitive' } },
              { legalName: { contains: filters.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const sortBy = filters.sortBy ?? 'createdAt';
    const sortOrder = filters.sortOrder ?? 'desc';
    const allowedSort = new Set([
      'createdAt',
      'updatedAt',
      'name',
      'slug',
      'status',
    ]);
    const orderField = allowedSort.has(sortBy) ? sortBy : 'createdAt';

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.organization.count({ where }),
      this.prisma.organization.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [orderField]: sortOrder },
      }),
    ]);

    return { items: rows.map(mapOrganization), total };
  }

  async update(
    id: string,
    input: UpdateOrganizationInput,
    actorUserId: string | null,
  ): Promise<OrganizationResponse> {
    const existing = await this.prisma.organization.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundError('Organization', id);
    }
    if (existing.version !== input.version) {
      throw new OptimisticLockError('Organization');
    }

    const { version: _version, ...patch } = input;
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.organization.update({
        where: { id },
        data: {
          ...patch,
          settings:
            patch.settings !== undefined
              ? (patch.settings as Prisma.InputJsonValue)
              : undefined,
          version: { increment: 1 },
        },
      });

      await tx.organizationVersion.create({
        data: {
          organizationId: result.id,
          version: result.version,
          snapshot: result as unknown as Prisma.InputJsonValue,
          changedByUserId: actorUserId,
        },
      });

      return result;
    });

    return mapOrganization(updated);
  }

  async softDelete(
    id: string,
    version: number,
    actorUserId: string | null,
  ): Promise<void> {
    const existing = await this.prisma.organization.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundError('Organization', id);
    }
    if (existing.version !== version) {
      throw new OptimisticLockError('Organization');
    }

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.organization.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          status: 'archived',
          version: { increment: 1 },
        },
      });

      await tx.organizationVersion.create({
        data: {
          organizationId: result.id,
          version: result.version,
          snapshot: result as unknown as Prisma.InputJsonValue,
          changedByUserId: actorUserId,
        },
      });
    });
  }
}
