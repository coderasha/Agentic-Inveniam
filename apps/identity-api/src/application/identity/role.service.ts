import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  PERMISSIONS,
  buildPaginationMeta,
  createRoleSchema,
  paginationQuerySchema,
  updateRoleSchema,
  type RoleResponse,
} from '@gain/shared';
import type { RequestContext } from '../../domain/identity/auth.types';
import {
  AUDIT_REPOSITORY,
  ROLE_REPOSITORY,
} from '../../domain/identity/tokens';
import type { RoleRepository } from '../../domain/identity/ports/role.repository';
import type { AuditRepository } from '../../domain/identity/ports/audit.repository';
import { NotFoundError, ValidationError } from '../../domain/identity/errors';
import { AuthorizationService } from './authorization.service';

const listQuerySchema = paginationQuerySchema.and(
  z.object({
    organizationId: z.string().uuid().optional(),
    includeSystem: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .optional()
      .transform((v) =>
        v === undefined ? true : v === true || v === 'true',
      ),
  }),
);

@Injectable()
export class RoleService {
  constructor(
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository,
    @Inject(AUDIT_REPOSITORY) private readonly audit: AuditRepository,
    private readonly authz: AuthorizationService,
  ) {}

  listPermissions(ctx: RequestContext) {
    this.authz.requirePermission(ctx, 'identity:permission:read');
    return { data: PERMISSIONS };
  }

  async create(raw: unknown, ctx: RequestContext): Promise<RoleResponse> {
    this.authz.requirePermission(ctx, 'identity:role:create');
    const parsed = createRoleSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid role payload',
        parsed.error.issues as unknown as Record<string, unknown>[],
      );
    }
    if (parsed.data.isSystem) {
      throw new ValidationError('Cannot create system roles via API');
    }
    const role = await this.roles.create({
      ...parsed.data,
      isSystem: false,
    });
    await this.audit.create({
      organizationId: role.organizationId,
      actorUserId: ctx.principal.userId,
      actorType: ctx.principal.actorType,
      action: 'create',
      resourceType: 'role',
      resourceId: role.id,
      correlationId: ctx.principal.correlationId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      changes: role as unknown as Record<string, unknown>,
    });
    return role;
  }

  async getById(id: string, ctx: RequestContext): Promise<RoleResponse> {
    this.authz.requirePermission(ctx, 'identity:role:read');
    const role = await this.roles.findById(id);
    if (!role) throw new NotFoundError('Role', id);
    return role;
  }

  async list(rawQuery: unknown, ctx: RequestContext) {
    this.authz.requirePermission(ctx, 'identity:role:read');
    const parsed = listQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid query parameters',
        parsed.error.issues as unknown as Record<string, unknown>[],
      );
    }
    const result = await this.roles.list(parsed.data);
    return {
      data: result.items,
      meta: buildPaginationMeta(
        parsed.data.page,
        parsed.data.pageSize,
        result.total,
      ),
    };
  }

  async update(
    id: string,
    raw: unknown,
    ctx: RequestContext,
  ): Promise<RoleResponse> {
    this.authz.requirePermission(ctx, 'identity:role:update');
    const parsed = updateRoleSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid role update payload',
        parsed.error.issues as unknown as Record<string, unknown>[],
      );
    }
    const role = await this.roles.update(id, parsed.data);
    await this.audit.create({
      organizationId: role.organizationId,
      actorUserId: ctx.principal.userId,
      actorType: ctx.principal.actorType,
      action: 'update',
      resourceType: 'role',
      resourceId: role.id,
      correlationId: ctx.principal.correlationId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      changes: role as unknown as Record<string, unknown>,
    });
    return role;
  }

  async softDelete(
    id: string,
    version: number,
    ctx: RequestContext,
  ): Promise<void> {
    this.authz.requirePermission(ctx, 'identity:role:delete');
    const existing = await this.roles.findById(id);
    if (!existing) throw new NotFoundError('Role', id);
    await this.roles.softDelete(id, version);
    await this.audit.create({
      organizationId: existing.organizationId,
      actorUserId: ctx.principal.userId,
      actorType: ctx.principal.actorType,
      action: 'soft_delete',
      resourceType: 'role',
      resourceId: id,
      correlationId: ctx.principal.correlationId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      changes: { version },
    });
  }
}
