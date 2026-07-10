import { Inject, Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import {
  IDENTITY_KAFKA_TOPICS,
  buildPaginationMeta,
  createMembershipSchema,
  paginationQuerySchema,
  updateMembershipSchema,
  type DomainEvent,
  type MembershipResponse,
} from '@gain/shared';
import type { RequestContext } from '../../domain/identity/auth.types';
import {
  AUDIT_REPOSITORY,
  MEMBERSHIP_REPOSITORY,
  OUTBOX_REPOSITORY,
  ROLE_REPOSITORY,
} from '../../domain/identity/tokens';
import type { MembershipRepository } from '../../domain/identity/ports/membership.repository';
import type { RoleRepository } from '../../domain/identity/ports/role.repository';
import type { AuditRepository } from '../../domain/identity/ports/audit.repository';
import type { OutboxRepository } from '../../domain/identity/ports/infrastructure.ports';
import {
  NotFoundError,
  ValidationError,
} from '../../domain/identity/errors';
import { AuthorizationService } from './authorization.service';

const listQuerySchema = paginationQuerySchema.and(
  z.object({
    organizationId: z.string().uuid().optional(),
    userId: z.string().uuid().optional(),
  }),
);

@Injectable()
export class MembershipService {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly memberships: MembershipRepository,
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository,
    @Inject(AUDIT_REPOSITORY) private readonly audit: AuditRepository,
    @Inject(OUTBOX_REPOSITORY) private readonly outbox: OutboxRepository,
    private readonly authz: AuthorizationService,
  ) {}

  async create(
    raw: unknown,
    ctx: RequestContext,
  ): Promise<MembershipResponse> {
    this.authz.requirePermission(ctx, 'identity:membership:manage');
    const parsed = createMembershipSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid membership payload',
        parsed.error.issues as unknown as Record<string, unknown>[],
      );
    }

    const foundRoles = await this.roles.findByIds(parsed.data.roleIds);
    if (foundRoles.length !== parsed.data.roleIds.length) {
      throw new ValidationError('One or more roleIds are invalid');
    }

    const membership = await this.memberships.create(parsed.data);
    await this.audit.create({
      organizationId: membership.organizationId,
      actorUserId: ctx.principal.userId,
      actorType: ctx.principal.actorType,
      action: 'create',
      resourceType: 'membership',
      resourceId: membership.id,
      correlationId: ctx.principal.correlationId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      changes: membership as unknown as Record<string, unknown>,
    });
    await this.outbox.enqueue(
      this.event(
        IDENTITY_KAFKA_TOPICS.MEMBERSHIP_CREATED,
        membership.id,
        ctx,
        membership,
      ),
      IDENTITY_KAFKA_TOPICS.MEMBERSHIP_CREATED,
    );
    return membership;
  }

  async getById(id: string, ctx: RequestContext): Promise<MembershipResponse> {
    this.authz.requirePermission(ctx, 'identity:user:read');
    const membership = await this.memberships.findById(id);
    if (!membership) throw new NotFoundError('Membership', id);
    return membership;
  }

  async list(rawQuery: unknown, ctx: RequestContext) {
    this.authz.requirePermission(ctx, 'identity:user:read');
    const parsed = listQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid query parameters',
        parsed.error.issues as unknown as Record<string, unknown>[],
      );
    }
    const result = await this.memberships.list(parsed.data);
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
  ): Promise<MembershipResponse> {
    this.authz.requirePermission(ctx, 'identity:membership:manage');
    const parsed = updateMembershipSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid membership update payload',
        parsed.error.issues as unknown as Record<string, unknown>[],
      );
    }
    if (parsed.data.roleIds) {
      const foundRoles = await this.roles.findByIds(parsed.data.roleIds);
      if (foundRoles.length !== parsed.data.roleIds.length) {
        throw new ValidationError('One or more roleIds are invalid');
      }
    }
    const membership = await this.memberships.update(id, parsed.data);
    await this.audit.create({
      organizationId: membership.organizationId,
      actorUserId: ctx.principal.userId,
      actorType: ctx.principal.actorType,
      action: 'update',
      resourceType: 'membership',
      resourceId: membership.id,
      correlationId: ctx.principal.correlationId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      changes: membership as unknown as Record<string, unknown>,
    });
    await this.outbox.enqueue(
      this.event(
        IDENTITY_KAFKA_TOPICS.MEMBERSHIP_UPDATED,
        membership.id,
        ctx,
        membership,
      ),
      IDENTITY_KAFKA_TOPICS.MEMBERSHIP_UPDATED,
    );
    return membership;
  }

  async softDelete(
    id: string,
    version: number,
    ctx: RequestContext,
  ): Promise<void> {
    this.authz.requirePermission(ctx, 'identity:membership:manage');
    const existing = await this.memberships.findById(id);
    if (!existing) throw new NotFoundError('Membership', id);
    await this.memberships.softDelete(id, version);
    await this.audit.create({
      organizationId: existing.organizationId,
      actorUserId: ctx.principal.userId,
      actorType: ctx.principal.actorType,
      action: 'soft_delete',
      resourceType: 'membership',
      resourceId: id,
      correlationId: ctx.principal.correlationId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      changes: { version },
    });
    await this.outbox.enqueue(
      this.event(IDENTITY_KAFKA_TOPICS.MEMBERSHIP_REMOVED, id, ctx, {
        id,
        version,
      }),
      IDENTITY_KAFKA_TOPICS.MEMBERSHIP_REMOVED,
    );
  }

  private event(
    eventType: string,
    aggregateId: string,
    ctx: RequestContext,
    payload: unknown,
  ): DomainEvent {
    return {
      eventId: uuidv4(),
      eventType,
      aggregateType: 'membership',
      aggregateId,
      occurredAt: new Date().toISOString(),
      correlationId: ctx.principal.correlationId,
      actorUserId: ctx.principal.userId,
      organizationId: ctx.principal.organizationId ?? null,
      payload: payload as Record<string, unknown>,
      metadata: {},
    };
  }
}
