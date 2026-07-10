import { Inject, Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import {
  IDENTITY_KAFKA_TOPICS,
  acceptInvitationSchema,
  buildPaginationMeta,
  createInvitationSchema,
  invitationStatusSchema,
  paginationQuerySchema,
  type ApiKeyCreatedResponse,
  type DomainEvent,
  type InvitationResponse,
  createApiKeySchema,
  type ApiKeyResponse,
} from '@gain/shared';
import type { RequestContext } from '../../domain/identity/auth.types';
import {
  API_KEY_REPOSITORY,
  AUDIT_REPOSITORY,
  CRYPTO_PORT,
  INVITATION_REPOSITORY,
  MEMBERSHIP_REPOSITORY,
  OUTBOX_REPOSITORY,
  ROLE_REPOSITORY,
  USER_REPOSITORY,
} from '../../domain/identity/tokens';
import type { InvitationRepository } from '../../domain/identity/ports/invitation.repository';
import type { UserRepository } from '../../domain/identity/ports/user.repository';
import type { MembershipRepository } from '../../domain/identity/ports/membership.repository';
import type { RoleRepository } from '../../domain/identity/ports/role.repository';
import type { ApiKeyRepository } from '../../domain/identity/ports/api-key.repository';
import type { AuditRepository } from '../../domain/identity/ports/audit.repository';
import type {
  CryptoPort,
  OutboxRepository,
} from '../../domain/identity/ports/infrastructure.ports';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../domain/identity/errors';
import { AuthorizationService } from './authorization.service';

const invitationListSchema = paginationQuerySchema.and(
  z.object({
    organizationId: z.string().uuid().optional(),
    status: invitationStatusSchema.optional(),
    email: z.string().email().optional(),
  }),
);

const apiKeyListSchema = paginationQuerySchema.and(
  z.object({
    organizationId: z.string().uuid().optional(),
  }),
);

@Injectable()
export class InvitationService {
  constructor(
    @Inject(INVITATION_REPOSITORY)
    private readonly invitations: InvitationRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly memberships: MembershipRepository,
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository,
    @Inject(CRYPTO_PORT) private readonly crypto: CryptoPort,
    @Inject(AUDIT_REPOSITORY) private readonly audit: AuditRepository,
    @Inject(OUTBOX_REPOSITORY) private readonly outbox: OutboxRepository,
    private readonly authz: AuthorizationService,
  ) {}

  async create(
    raw: unknown,
    ctx: RequestContext,
  ): Promise<InvitationResponse & { token: string }> {
    this.authz.requirePermission(ctx, 'identity:invitation:create');
    const parsed = createInvitationSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid invitation payload',
        parsed.error.issues as unknown as Record<string, unknown>[],
      );
    }

    const foundRoles = await this.roles.findByIds(parsed.data.roleIds);
    if (foundRoles.length !== parsed.data.roleIds.length) {
      throw new ValidationError('One or more roleIds are invalid');
    }

    const { raw: token, hash } = this.crypto.generateInvitationToken();
    const expiresAt = new Date(
      Date.now() + parsed.data.expiresInHours * 60 * 60 * 1000,
    );

    const invitation = await this.invitations.create(
      parsed.data,
      hash,
      ctx.principal.userId,
      expiresAt,
    );

    await this.audit.create({
      organizationId: invitation.organizationId,
      actorUserId: ctx.principal.userId,
      actorType: ctx.principal.actorType,
      action: 'invite',
      resourceType: 'invitation',
      resourceId: invitation.id,
      correlationId: ctx.principal.correlationId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      changes: { email: invitation.email, roleIds: invitation.roleIds },
    });

    await this.outbox.enqueue(
      this.event(
        IDENTITY_KAFKA_TOPICS.INVITATION_CREATED,
        invitation.id,
        ctx,
        invitation,
      ),
      IDENTITY_KAFKA_TOPICS.INVITATION_CREATED,
    );

    return { ...invitation, token };
  }

  async list(rawQuery: unknown, ctx: RequestContext) {
    this.authz.requirePermission(ctx, 'identity:invitation:create');
    const parsed = invitationListSchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid query parameters',
        parsed.error.issues as unknown as Record<string, unknown>[],
      );
    }
    const result = await this.invitations.list(parsed.data);
    return {
      data: result.items,
      meta: buildPaginationMeta(
        parsed.data.page,
        parsed.data.pageSize,
        result.total,
      ),
    };
  }

  async accept(raw: unknown, ctx: RequestContext): Promise<InvitationResponse> {
    const parsed = acceptInvitationSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid accept invitation payload',
        parsed.error.issues as unknown as Record<string, unknown>[],
      );
    }

    const tokenHash = this.crypto.hashToken(parsed.data.token);
    const invitation = await this.invitations.findByTokenHash(tokenHash);
    if (!invitation || invitation.status !== 'pending') {
      throw new NotFoundError('Invitation');
    }
    if (new Date(invitation.expiresAt) < new Date()) {
      throw new ValidationError('Invitation has expired');
    }

    let user = await this.users.findByEmail(invitation.email);
    if (!user) {
      user = await this.users.create({
        email: invitation.email,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        displayName: parsed.data.displayName,
        locale: 'en-US',
        timezone: 'UTC',
      });
    }

    const existingMembership = await this.memberships.findByUserAndOrg(
      user.id,
      invitation.organizationId,
    );
    if (existingMembership) {
      throw new ConflictError('User is already a member of this organization');
    }

    await this.memberships.create({
      userId: user.id,
      organizationId: invitation.organizationId,
      roleIds: invitation.roleIds,
      isPrimary: true,
    });

    await this.users.update(user.id, {
      version: user.version,
      status: 'active',
    });

    const accepted = await this.invitations.accept(invitation.id, new Date());

    await this.audit.create({
      organizationId: invitation.organizationId,
      actorUserId: user.id,
      actorType: 'user',
      action: 'accept_invite',
      resourceType: 'invitation',
      resourceId: invitation.id,
      correlationId: ctx.principal.correlationId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    await this.outbox.enqueue(
      this.event(
        IDENTITY_KAFKA_TOPICS.INVITATION_ACCEPTED,
        invitation.id,
        { ...ctx, principal: { ...ctx.principal, userId: user.id } },
        accepted,
      ),
      IDENTITY_KAFKA_TOPICS.INVITATION_ACCEPTED,
    );

    return accepted;
  }

  async revoke(id: string, ctx: RequestContext): Promise<InvitationResponse> {
    this.authz.requirePermission(ctx, 'identity:invitation:revoke');
    const revoked = await this.invitations.revoke(id, new Date());
    await this.audit.create({
      organizationId: revoked.organizationId,
      actorUserId: ctx.principal.userId,
      actorType: ctx.principal.actorType,
      action: 'revoke',
      resourceType: 'invitation',
      resourceId: id,
      correlationId: ctx.principal.correlationId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
    await this.outbox.enqueue(
      this.event(
        IDENTITY_KAFKA_TOPICS.INVITATION_REVOKED,
        id,
        ctx,
        revoked,
      ),
      IDENTITY_KAFKA_TOPICS.INVITATION_REVOKED,
    );
    return revoked;
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
      aggregateType: 'invitation',
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

@Injectable()
export class ApiKeyService {
  constructor(
    @Inject(API_KEY_REPOSITORY) private readonly apiKeys: ApiKeyRepository,
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository,
    @Inject(CRYPTO_PORT) private readonly crypto: CryptoPort,
    @Inject(AUDIT_REPOSITORY) private readonly audit: AuditRepository,
    @Inject(OUTBOX_REPOSITORY) private readonly outbox: OutboxRepository,
    private readonly authz: AuthorizationService,
  ) {}

  async create(
    raw: unknown,
    ctx: RequestContext,
  ): Promise<ApiKeyCreatedResponse> {
    this.authz.requirePermission(ctx, 'identity:api_key:create');
    const parsed = createApiKeySchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid API key payload',
        parsed.error.issues as unknown as Record<string, unknown>[],
      );
    }

    const foundRoles = await this.roles.findByIds(parsed.data.roleIds);
    if (foundRoles.length !== parsed.data.roleIds.length) {
      throw new ValidationError('One or more roleIds are invalid');
    }

    const scopes =
      parsed.data.scopes ??
      ([...new Set(foundRoles.flatMap((r) => r.permissions))] as string[]);

    const { raw: secret, prefix, hash } = this.crypto.generateApiKey();
    const apiKey = await this.apiKeys.create({
      input: parsed.data,
      keyPrefix: prefix,
      keyHash: hash,
      createdByUserId: ctx.principal.userId,
      scopes,
    });

    await this.audit.create({
      organizationId: apiKey.organizationId,
      actorUserId: ctx.principal.userId,
      actorType: ctx.principal.actorType,
      action: 'create',
      resourceType: 'api_key',
      resourceId: apiKey.id,
      correlationId: ctx.principal.correlationId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      changes: { name: apiKey.name, keyPrefix: apiKey.keyPrefix },
    });

    await this.outbox.enqueue(
      {
        eventId: uuidv4(),
        eventType: IDENTITY_KAFKA_TOPICS.API_KEY_CREATED,
        aggregateType: 'api_key',
        aggregateId: apiKey.id,
        occurredAt: new Date().toISOString(),
        correlationId: ctx.principal.correlationId,
        actorUserId: ctx.principal.userId,
        organizationId: apiKey.organizationId,
        payload: { id: apiKey.id, name: apiKey.name },
        metadata: {},
      },
      IDENTITY_KAFKA_TOPICS.API_KEY_CREATED,
    );

    return {
      id: apiKey.id,
      organizationId: apiKey.organizationId,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      secret,
      expiresAt: apiKey.expiresAt,
      createdAt: apiKey.createdAt,
    };
  }

  async list(rawQuery: unknown, ctx: RequestContext) {
    this.authz.requirePermission(ctx, 'identity:api_key:read');
    const parsed = apiKeyListSchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid query parameters',
        parsed.error.issues as unknown as Record<string, unknown>[],
      );
    }
    const result = await this.apiKeys.list(parsed.data);
    return {
      data: result.items,
      meta: buildPaginationMeta(
        parsed.data.page,
        parsed.data.pageSize,
        result.total,
      ),
    };
  }

  async revoke(id: string, ctx: RequestContext): Promise<ApiKeyResponse> {
    this.authz.requirePermission(ctx, 'identity:api_key:revoke');
    const revoked = await this.apiKeys.revoke(id, new Date());
    await this.audit.create({
      organizationId: revoked.organizationId,
      actorUserId: ctx.principal.userId,
      actorType: ctx.principal.actorType,
      action: 'revoke',
      resourceType: 'api_key',
      resourceId: id,
      correlationId: ctx.principal.correlationId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
    await this.outbox.enqueue(
      {
        eventId: uuidv4(),
        eventType: IDENTITY_KAFKA_TOPICS.API_KEY_REVOKED,
        aggregateType: 'api_key',
        aggregateId: id,
        occurredAt: new Date().toISOString(),
        correlationId: ctx.principal.correlationId,
        actorUserId: ctx.principal.userId,
        organizationId: revoked.organizationId,
        payload: { id },
        metadata: {},
      },
      IDENTITY_KAFKA_TOPICS.API_KEY_REVOKED,
    );
    return revoked;
  }
}
