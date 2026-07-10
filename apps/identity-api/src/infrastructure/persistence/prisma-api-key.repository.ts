import { Injectable } from '@nestjs/common';
import type { ApiKeyResponse, CreateApiKeyInput } from '@gain/shared';
import { Prisma } from '@gain/database';
import type {
  ApiKeyListFilters,
  ApiKeyRepository,
} from '../../domain/identity/ports/api-key.repository';
import { NotFoundError } from '../../domain/identity/errors';
import { PrismaService } from './prisma.service';
import { mapApiKey } from './mappers';

@Injectable()
export class PrismaApiKeyRepository implements ApiKeyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(params: {
    input: CreateApiKeyInput;
    keyPrefix: string;
    keyHash: string;
    createdByUserId: string;
    scopes: string[];
  }): Promise<ApiKeyResponse> {
    const apiKey = await this.prisma.apiKey.create({
      data: {
        organizationId: params.input.organizationId,
        name: params.input.name,
        description: params.input.description,
        keyPrefix: params.keyPrefix,
        keyHash: params.keyHash,
        scopes: params.scopes,
        expiresAt: params.input.expiresAt
          ? new Date(params.input.expiresAt)
          : null,
        createdByUserId: params.createdByUserId,
        roles: {
          create: params.input.roleIds.map((roleId) => ({ roleId })),
        },
      },
    });
    return mapApiKey(apiKey);
  }

  async findById(id: string): Promise<ApiKeyResponse | null> {
    const apiKey = await this.prisma.apiKey.findUnique({ where: { id } });
    return apiKey ? mapApiKey(apiKey) : null;
  }

  async findByKeyHash(keyHash: string): Promise<{
    apiKey: ApiKeyResponse;
    organizationId: string;
    scopes: string[];
    roleSlugs: string[];
  } | null> {
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { keyHash },
      include: { roles: { include: { role: true } } },
    });
    if (!apiKey || apiKey.status !== 'active') {
      return null;
    }
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      await this.prisma.apiKey.update({
        where: { id: apiKey.id },
        data: { status: 'expired' },
      });
      return null;
    }

    return {
      apiKey: mapApiKey(apiKey),
      organizationId: apiKey.organizationId,
      scopes: apiKey.scopes,
      roleSlugs: apiKey.roles.map((r) => r.role.slug),
    };
  }

  async list(filters: ApiKeyListFilters): Promise<{
    items: ApiKeyResponse[];
    total: number;
  }> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const where: Prisma.ApiKeyWhereInput = {
      ...(filters.organizationId
        ? { organizationId: filters.organizationId }
        : {}),
      ...(filters.search
        ? { name: { contains: filters.search, mode: 'insensitive' } }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.apiKey.count({ where }),
      this.prisma.apiKey.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: filters.sortOrder ?? 'desc' },
      }),
    ]);

    return { items: rows.map(mapApiKey), total };
  }

  async revoke(id: string, revokedAt: Date): Promise<ApiKeyResponse> {
    const existing = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('ApiKey', id);
    }
    const apiKey = await this.prisma.apiKey.update({
      where: { id },
      data: { status: 'revoked', revokedAt },
    });
    return mapApiKey(apiKey);
  }

  async touchLastUsed(id: string, at: Date): Promise<void> {
    await this.prisma.apiKey.update({
      where: { id },
      data: { lastUsedAt: at },
    });
  }
}
