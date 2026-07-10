import { Inject, Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import {
  IDENTITY_KAFKA_TOPICS,
  buildPaginationMeta,
  createOrganizationSchema,
  organizationStatusSchema,
  paginationQuerySchema,
  updateOrganizationSchema,
  type CreateOrganizationInput,
  type DomainEvent,
  type OrganizationResponse,
  type UpdateOrganizationInput,
} from '@gain/shared';
import type { RequestContext } from '../../domain/identity/auth.types';
import {
  AUDIT_REPOSITORY,
  CACHE_PORT,
  ORGANIZATION_REPOSITORY,
  OUTBOX_REPOSITORY,
} from '../../domain/identity/tokens';
import type { OrganizationRepository } from '../../domain/identity/ports/organization.repository';
import type { AuditRepository } from '../../domain/identity/ports/audit.repository';
import type {
  CachePort,
  OutboxRepository,
} from '../../domain/identity/ports/infrastructure.ports';
import { NotFoundError, ValidationError } from '../../domain/identity/errors';
import { AuthorizationService } from './authorization.service';

const listQuerySchema = paginationQuerySchema.and(
  z.object({
    status: organizationStatusSchema.optional(),
    parentOrganizationId: z.string().uuid().optional(),
  }),
);

@Injectable()
export class OrganizationService {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizations: OrganizationRepository,
    @Inject(AUDIT_REPOSITORY)
    private readonly audit: AuditRepository,
    @Inject(OUTBOX_REPOSITORY)
    private readonly outbox: OutboxRepository,
    @Inject(CACHE_PORT)
    private readonly cache: CachePort,
    private readonly authz: AuthorizationService,
  ) {}

  async create(
    raw: unknown,
    ctx: RequestContext,
  ): Promise<OrganizationResponse> {
    this.authz.requirePermission(ctx, 'identity:organization:create');
    const parsed = createOrganizationSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid organization payload',
        parsed.error.issues as unknown as Record<string, unknown>[],
      );
    }
    const input: CreateOrganizationInput = parsed.data;

    if (input.parentOrganizationId) {
      const parent = await this.organizations.findById(
        input.parentOrganizationId,
      );
      if (!parent) {
        throw new NotFoundError(
          'Parent organization',
          input.parentOrganizationId,
        );
      }
    }

    const org = await this.organizations.create(input, ctx.principal.userId);
    await this.recordAndPublish(
      ctx,
      'create',
      org,
      IDENTITY_KAFKA_TOPICS.ORGANIZATION_CREATED,
    );
    await this.cache.delByPrefix('identity:org:');
    return org;
  }

  async getById(id: string, ctx: RequestContext): Promise<OrganizationResponse> {
    this.authz.requirePermission(ctx, 'identity:organization:read');
    const cacheKey = `identity:org:${id}`;
    const cached = await this.cache.get<OrganizationResponse>(cacheKey);
    if (cached) return cached;

    const org = await this.organizations.findById(id);
    if (!org) throw new NotFoundError('Organization', id);

    await this.cache.set(cacheKey, org, 60);
    return org;
  }

  async list(rawQuery: unknown, ctx: RequestContext) {
    this.authz.requirePermission(ctx, 'identity:organization:read');
    const parsed = listQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid query parameters',
        parsed.error.issues as unknown as Record<string, unknown>[],
      );
    }

    const result = await this.organizations.list(parsed.data);
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
  ): Promise<OrganizationResponse> {
    this.authz.requirePermission(ctx, 'identity:organization:update');
    const parsed = updateOrganizationSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid organization update payload',
        parsed.error.issues as unknown as Record<string, unknown>[],
      );
    }
    const input: UpdateOrganizationInput = parsed.data;
    const org = await this.organizations.update(
      id,
      input,
      ctx.principal.userId,
    );
    await this.recordAndPublish(
      ctx,
      'update',
      org,
      IDENTITY_KAFKA_TOPICS.ORGANIZATION_UPDATED,
    );
    await this.cache.del(`identity:org:${id}`);
    return org;
  }

  async softDelete(
    id: string,
    version: number,
    ctx: RequestContext,
  ): Promise<void> {
    this.authz.requirePermission(ctx, 'identity:organization:delete');
    const existing = await this.organizations.findById(id);
    if (!existing) throw new NotFoundError('Organization', id);

    await this.organizations.softDelete(id, version, ctx.principal.userId);
    await this.audit.create({
      organizationId: id,
      actorUserId: ctx.principal.userId,
      actorType: ctx.principal.actorType,
      action: 'soft_delete',
      resourceType: 'organization',
      resourceId: id,
      correlationId: ctx.principal.correlationId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      changes: { version },
    });

    const event = this.buildEvent(
      IDENTITY_KAFKA_TOPICS.ORGANIZATION_DELETED,
      'organization',
      id,
      ctx,
      { id, version },
    );
    await this.outbox.enqueue(
      event,
      IDENTITY_KAFKA_TOPICS.ORGANIZATION_DELETED,
    );
    await this.cache.del(`identity:org:${id}`);
  }

  private async recordAndPublish(
    ctx: RequestContext,
    action: 'create' | 'update',
    org: OrganizationResponse,
    topic: string,
  ): Promise<void> {
    await this.audit.create({
      organizationId: org.id,
      actorUserId: ctx.principal.userId,
      actorType: ctx.principal.actorType,
      action,
      resourceType: 'organization',
      resourceId: org.id,
      correlationId: ctx.principal.correlationId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      changes: org as unknown as Record<string, unknown>,
    });

    const event = this.buildEvent(topic, 'organization', org.id, ctx, org);
    await this.outbox.enqueue(event, topic);
  }

  private buildEvent(
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    ctx: RequestContext,
    payload: unknown,
  ): DomainEvent {
    return {
      eventId: uuidv4(),
      eventType,
      aggregateType,
      aggregateId,
      occurredAt: new Date().toISOString(),
      correlationId: ctx.principal.correlationId,
      actorUserId: ctx.principal.userId,
      organizationId: aggregateType === 'organization' ? aggregateId : null,
      payload: payload as Record<string, unknown>,
      metadata: {},
    };
  }
}
