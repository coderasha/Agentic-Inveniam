import { Inject, Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import {
  IDENTITY_KAFKA_TOPICS,
  buildPaginationMeta,
  createUserSchema,
  paginationQuerySchema,
  updateUserSchema,
  userStatusSchema,
  type DomainEvent,
  type UserResponse,
} from '@gain/shared';
import type { RequestContext } from '../../domain/identity/auth.types';
import {
  AUDIT_REPOSITORY,
  OUTBOX_REPOSITORY,
  USER_REPOSITORY,
} from '../../domain/identity/tokens';
import type { UserRepository } from '../../domain/identity/ports/user.repository';
import type { AuditRepository } from '../../domain/identity/ports/audit.repository';
import type { OutboxRepository } from '../../domain/identity/ports/infrastructure.ports';
import { NotFoundError, ValidationError } from '../../domain/identity/errors';
import { AuthorizationService } from './authorization.service';

const listQuerySchema = paginationQuerySchema.and(
  z.object({
    status: userStatusSchema.optional(),
    organizationId: z.string().uuid().optional(),
  }),
);

@Injectable()
export class UserService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(AUDIT_REPOSITORY) private readonly audit: AuditRepository,
    @Inject(OUTBOX_REPOSITORY) private readonly outbox: OutboxRepository,
    private readonly authz: AuthorizationService,
  ) {}

  async create(raw: unknown, ctx: RequestContext): Promise<UserResponse> {
    this.authz.requirePermission(ctx, 'identity:user:invite');
    const parsed = createUserSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid user payload',
        parsed.error.issues as unknown as Record<string, unknown>[],
      );
    }

    const user = await this.users.create(parsed.data);
    await this.audit.create({
      organizationId: ctx.principal.organizationId ?? null,
      actorUserId: ctx.principal.userId,
      actorType: ctx.principal.actorType,
      action: 'create',
      resourceType: 'user',
      resourceId: user.id,
      correlationId: ctx.principal.correlationId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      changes: user as unknown as Record<string, unknown>,
    });
    await this.outbox.enqueue(
      this.event(IDENTITY_KAFKA_TOPICS.USER_CREATED, user.id, ctx, user),
      IDENTITY_KAFKA_TOPICS.USER_CREATED,
    );
    return user;
  }

  async getById(id: string, ctx: RequestContext): Promise<UserResponse> {
    this.authz.requirePermission(ctx, 'identity:user:read');
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundError('User', id);
    return user;
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
    const result = await this.users.list(parsed.data);
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
  ): Promise<UserResponse> {
    this.authz.requirePermission(ctx, 'identity:user:update');
    const parsed = updateUserSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid user update payload',
        parsed.error.issues as unknown as Record<string, unknown>[],
      );
    }
    const user = await this.users.update(id, parsed.data);
    await this.audit.create({
      organizationId: ctx.principal.organizationId ?? null,
      actorUserId: ctx.principal.userId,
      actorType: ctx.principal.actorType,
      action: 'update',
      resourceType: 'user',
      resourceId: user.id,
      correlationId: ctx.principal.correlationId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      changes: user as unknown as Record<string, unknown>,
    });
    await this.outbox.enqueue(
      this.event(IDENTITY_KAFKA_TOPICS.USER_UPDATED, user.id, ctx, user),
      IDENTITY_KAFKA_TOPICS.USER_UPDATED,
    );
    return user;
  }

  async softDelete(
    id: string,
    version: number,
    ctx: RequestContext,
  ): Promise<void> {
    this.authz.requirePermission(ctx, 'identity:user:delete');
    await this.users.softDelete(id, version);
    await this.audit.create({
      organizationId: ctx.principal.organizationId ?? null,
      actorUserId: ctx.principal.userId,
      actorType: ctx.principal.actorType,
      action: 'soft_delete',
      resourceType: 'user',
      resourceId: id,
      correlationId: ctx.principal.correlationId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      changes: { version },
    });
    await this.outbox.enqueue(
      this.event(IDENTITY_KAFKA_TOPICS.USER_DEACTIVATED, id, ctx, {
        id,
        version,
      }),
      IDENTITY_KAFKA_TOPICS.USER_DEACTIVATED,
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
      aggregateType: 'user',
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
