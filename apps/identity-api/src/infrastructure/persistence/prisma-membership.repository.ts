import { Injectable } from '@nestjs/common';
import type {
  CreateMembershipInput,
  MembershipResponse,
  UpdateMembershipInput,
} from '@gain/shared';
import { Prisma } from '@gain/database';
import type {
  MembershipListFilters,
  MembershipRepository,
} from '../../domain/identity/ports/membership.repository';
import {
  ConflictError,
  NotFoundError,
  OptimisticLockError,
} from '../../domain/identity/errors';
import { PrismaService } from './prisma.service';
import { mapMembership } from './mappers';

const membershipInclude = {
  roles: { include: { role: true } },
} as const;

@Injectable()
export class PrismaMembershipRepository implements MembershipRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateMembershipInput): Promise<MembershipResponse> {
    try {
      const membership = await this.prisma.membership.create({
        data: {
          userId: input.userId,
          organizationId: input.organizationId,
          title: input.title,
          department: input.department,
          isPrimary: input.isPrimary ?? false,
          status: 'active',
          roles: {
            create: input.roleIds.map((roleId) => ({ roleId })),
          },
        },
        include: membershipInclude,
      });
      return mapMembership(membership);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictError(
          'User is already a member of this organization',
        );
      }
      throw error;
    }
  }

  async findById(id: string): Promise<MembershipResponse | null> {
    const membership = await this.prisma.membership.findFirst({
      where: { id, deletedAt: null },
      include: membershipInclude,
    });
    return membership ? mapMembership(membership) : null;
  }

  async findByUserAndOrg(
    userId: string,
    organizationId: string,
  ): Promise<MembershipResponse | null> {
    const membership = await this.prisma.membership.findFirst({
      where: { userId, organizationId, deletedAt: null },
      include: membershipInclude,
    });
    return membership ? mapMembership(membership) : null;
  }

  async list(filters: MembershipListFilters): Promise<{
    items: MembershipResponse[];
    total: number;
  }> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const where: Prisma.MembershipWhereInput = {
      deletedAt: null,
      ...(filters.organizationId
        ? { organizationId: filters.organizationId }
        : {}),
      ...(filters.userId ? { userId: filters.userId } : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.membership.count({ where }),
      this.prisma.membership.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: filters.sortOrder ?? 'desc' },
        include: membershipInclude,
      }),
    ]);

    return { items: rows.map(mapMembership), total };
  }

  async update(
    id: string,
    input: UpdateMembershipInput,
  ): Promise<MembershipResponse> {
    const existing = await this.prisma.membership.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundError('Membership', id);
    }
    if (existing.version !== input.version) {
      throw new OptimisticLockError('Membership');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.roleIds) {
        await tx.membershipRole.deleteMany({ where: { membershipId: id } });
        await tx.membershipRole.createMany({
          data: input.roleIds.map((roleId) => ({ membershipId: id, roleId })),
        });
      }

      return tx.membership.update({
        where: { id },
        data: {
          title: input.title === undefined ? undefined : input.title,
          department:
            input.department === undefined ? undefined : input.department,
          status: input.status,
          isPrimary: input.isPrimary,
          version: { increment: 1 },
        },
        include: membershipInclude,
      });
    });

    return mapMembership(updated);
  }

  async softDelete(id: string, version: number): Promise<void> {
    const existing = await this.prisma.membership.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundError('Membership', id);
    }
    if (existing.version !== version) {
      throw new OptimisticLockError('Membership');
    }

    await this.prisma.membership.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'removed',
        version: { increment: 1 },
      },
    });
  }

  async getEffectivePermissions(
    userId: string,
    organizationId: string,
  ): Promise<string[]> {
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId,
        organizationId,
        deletedAt: null,
        status: 'active',
      },
      include: membershipInclude,
    });
    if (!membership) {
      return [];
    }
    return [
      ...new Set(membership.roles.flatMap((mr) => mr.role.permissions)),
    ];
  }
}
