import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  auditActionSchema,
  buildPaginationMeta,
  createAbacPolicySchema,
  paginationQuerySchema,
  type AbacPolicyResponse,
} from '@gain/shared';
import type { RequestContext } from '../../domain/identity/auth.types';
import {
  ABAC_POLICY_REPOSITORY,
  AUDIT_REPOSITORY,
} from '../../domain/identity/tokens';
import type { AuditRepository } from '../../domain/identity/ports/audit.repository';
import type { AbacPolicyRepository } from '../../domain/identity/ports/abac-policy.repository';
import { NotFoundError, ValidationError } from '../../domain/identity/errors';
import { AuthorizationService } from './authorization.service';

const auditListSchema = paginationQuerySchema.and(
  z.object({
    organizationId: z.string().uuid().optional(),
    actorUserId: z.string().uuid().optional(),
    resourceType: z.string().optional(),
    resourceId: z.string().optional(),
    action: auditActionSchema.optional(),
  }),
);

const abacListSchema = paginationQuerySchema.and(
  z.object({
    organizationId: z.string().uuid(),
    resourceType: z.string().optional(),
    enabled: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .optional()
      .transform((v) =>
        v === undefined ? undefined : v === true || v === 'true',
      ),
  }),
);

@Injectable()
export class AuditService {
  constructor(
    @Inject(AUDIT_REPOSITORY) private readonly audit: AuditRepository,
    private readonly authz: AuthorizationService,
  ) {}

  async list(rawQuery: unknown, ctx: RequestContext) {
    this.authz.requirePermission(ctx, 'identity:audit:read');
    const parsed = auditListSchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid query parameters',
        parsed.error.issues as unknown as Record<string, unknown>[],
      );
    }
    const result = await this.audit.list(parsed.data);
    return {
      data: result.items,
      meta: buildPaginationMeta(
        parsed.data.page,
        parsed.data.pageSize,
        result.total,
      ),
    };
  }
}

@Injectable()
export class AbacPolicyService {
  constructor(
    @Inject(ABAC_POLICY_REPOSITORY)
    private readonly policies: AbacPolicyRepository,
    @Inject(AUDIT_REPOSITORY) private readonly audit: AuditRepository,
    private readonly authz: AuthorizationService,
  ) {}

  async create(
    raw: unknown,
    ctx: RequestContext,
  ): Promise<AbacPolicyResponse> {
    this.authz.requirePermission(ctx, 'identity:organization:manage_settings');
    const parsed = createAbacPolicySchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid ABAC policy payload',
        parsed.error.issues as unknown as Record<string, unknown>[],
      );
    }
    const policy = await this.policies.create(parsed.data);
    await this.audit.create({
      organizationId: policy.organizationId,
      actorUserId: ctx.principal.userId,
      actorType: ctx.principal.actorType,
      action: 'create',
      resourceType: 'abac_policy',
      resourceId: policy.id,
      correlationId: ctx.principal.correlationId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      changes: policy as unknown as Record<string, unknown>,
    });
    return policy;
  }

  async list(rawQuery: unknown, ctx: RequestContext) {
    this.authz.requirePermission(ctx, 'identity:organization:manage_settings');
    const parsed = abacListSchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid query parameters',
        parsed.error.issues as unknown as Record<string, unknown>[],
      );
    }
    const result = await this.policies.list(parsed.data);
    return {
      data: result.items,
      meta: buildPaginationMeta(
        parsed.data.page,
        parsed.data.pageSize,
        result.total,
      ),
    };
  }

  async softDelete(
    id: string,
    version: number,
    ctx: RequestContext,
  ): Promise<void> {
    this.authz.requirePermission(ctx, 'identity:organization:manage_settings');
    const existing = await this.policies.findById(id);
    if (!existing) throw new NotFoundError('AbacPolicy', id);
    await this.policies.softDelete(id, version);
    await this.audit.create({
      organizationId: existing.organizationId,
      actorUserId: ctx.principal.userId,
      actorType: ctx.principal.actorType,
      action: 'soft_delete',
      resourceType: 'abac_policy',
      resourceId: id,
      correlationId: ctx.principal.correlationId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      changes: { version },
    });
  }
}
