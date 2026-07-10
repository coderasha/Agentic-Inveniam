import { Injectable } from '@nestjs/common';
import type {
  CreateUserInput,
  UpdateUserInput,
  UserResponse,
} from '@gain/shared';
import { Prisma } from '@gain/database';
import type {
  UserListFilters,
  UserRepository,
} from '../../domain/identity/ports/user.repository';
import {
  ConflictError,
  NotFoundError,
  OptimisticLockError,
} from '../../domain/identity/errors';
import { PrismaService } from './prisma.service';
import { mapUser } from './mappers';

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateUserInput): Promise<UserResponse> {
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: input.email.toLowerCase(),
            firstName: input.firstName,
            lastName: input.lastName,
            displayName: input.displayName,
            phone: input.phone,
            locale: input.locale ?? 'en-US',
            timezone: input.timezone ?? 'UTC',
            keycloakSubjectId: input.keycloakSubjectId,
            metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
            status: 'invited',
          },
        });

        await tx.userVersion.create({
          data: {
            userId: created.id,
            version: created.version,
            snapshot: created as unknown as Prisma.InputJsonValue,
          },
        });

        return created;
      });

      return mapUser(user);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictError(`User email '${input.email}' already exists`);
      }
      throw error;
    }
  }

  async findById(
    id: string,
    includeDeleted = false,
  ): Promise<UserResponse | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
    });
    return user ? mapUser(user) : null;
  }

  async findByEmail(email: string): Promise<UserResponse | null> {
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
    });
    return user ? mapUser(user) : null;
  }

  async findByKeycloakSubjectId(
    subjectId: string,
  ): Promise<UserResponse | null> {
    const user = await this.prisma.user.findFirst({
      where: { keycloakSubjectId: subjectId, deletedAt: null },
    });
    return user ? mapUser(user) : null;
  }

  async list(
    filters: UserListFilters,
  ): Promise<{ items: UserResponse[]; total: number }> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.organizationId
        ? {
            memberships: {
              some: {
                organizationId: filters.organizationId,
                deletedAt: null,
              },
            },
          }
        : {}),
      ...(filters.search
        ? {
            OR: [
              { email: { contains: filters.search, mode: 'insensitive' } },
              { firstName: { contains: filters.search, mode: 'insensitive' } },
              { lastName: { contains: filters.search, mode: 'insensitive' } },
              {
                displayName: { contains: filters.search, mode: 'insensitive' },
              },
            ],
          }
        : {}),
    };

    const sortBy = filters.sortBy ?? 'createdAt';
    const sortOrder = filters.sortOrder ?? 'desc';
    const allowedSort = new Set([
      'createdAt',
      'updatedAt',
      'email',
      'firstName',
      'lastName',
      'status',
    ]);
    const orderField = allowedSort.has(sortBy) ? sortBy : 'createdAt';

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [orderField]: sortOrder },
      }),
    ]);

    return { items: rows.map(mapUser), total };
  }

  async update(id: string, input: UpdateUserInput): Promise<UserResponse> {
    const existing = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundError('User', id);
    }
    if (existing.version !== input.version) {
      throw new OptimisticLockError('User');
    }

    const { version: _version, ...patch } = input;
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.user.update({
        where: { id },
        data: {
          ...patch,
          metadata:
            patch.metadata !== undefined
              ? (patch.metadata as Prisma.InputJsonValue)
              : undefined,
          version: { increment: 1 },
        },
      });

      await tx.userVersion.create({
        data: {
          userId: result.id,
          version: result.version,
          snapshot: result as unknown as Prisma.InputJsonValue,
        },
      });

      return result;
    });

    return mapUser(updated);
  }

  async softDelete(id: string, version: number): Promise<void> {
    const existing = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundError('User', id);
    }
    if (existing.version !== version) {
      throw new OptimisticLockError('User');
    }

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.user.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          status: 'deactivated',
          version: { increment: 1 },
        },
      });

      await tx.userVersion.create({
        data: {
          userId: result.id,
          version: result.version,
          snapshot: result as unknown as Prisma.InputJsonValue,
        },
      });
    });
  }

  async markLogin(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }

  async linkKeycloakSubject(
    id: string,
    subjectId: string,
  ): Promise<UserResponse> {
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        keycloakSubjectId: subjectId,
        emailVerified: true,
        status: 'active',
        version: { increment: 1 },
      },
    });
    return mapUser(user);
  }
}
