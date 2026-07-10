import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { v4 as uuidv4 } from 'uuid';
import type { Permission } from '@gain/shared';
import type { Request } from 'express';
import type { AuthenticatedPrincipal } from '../../domain/identity/auth.types';
import {
  API_KEY_REPOSITORY,
  CRYPTO_PORT,
  MEMBERSHIP_REPOSITORY,
  TOKEN_VERIFIER,
  USER_REPOSITORY,
} from '../../domain/identity/tokens';
import type { UserRepository } from '../../domain/identity/ports/user.repository';
import type { MembershipRepository } from '../../domain/identity/ports/membership.repository';
import type { ApiKeyRepository } from '../../domain/identity/ports/api-key.repository';
import type {
  CryptoPort,
  TokenVerifier,
} from '../../domain/identity/ports/infrastructure.ports';
import { UnauthorizedError } from '../../domain/identity/errors';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

export interface AuthenticatedRequest extends Request {
  principal: AuthenticatedPrincipal;
  correlationId: string;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(TOKEN_VERIFIER) private readonly tokens: TokenVerifier,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly memberships: MembershipRepository,
    @Inject(API_KEY_REPOSITORY) private readonly apiKeys: ApiKeyRepository,
    @Inject(CRYPTO_PORT) private readonly crypto: CryptoPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const correlationId =
      (request.headers['x-correlation-id'] as string | undefined) ?? uuidv4();
    request.correlationId = correlationId;

    if (isPublic) {
      request.principal = {
        userId: '00000000-0000-0000-0000-000000000000',
        email: 'anonymous@gain.network',
        permissions: [],
        roles: [],
        correlationId,
        actorType: 'system',
      };
      return true;
    }

    const apiKeyHeader = request.headers['x-api-key'];
    if (typeof apiKeyHeader === 'string' && apiKeyHeader.length > 0) {
      request.principal = await this.authenticateApiKey(
        apiKeyHeader,
        correlationId,
      );
      return true;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Bearer token or API key required');
    }

    const token = authHeader.slice('Bearer '.length).trim();
    request.principal = await this.authenticateBearer(
      token,
      correlationId,
      request.headers['x-organization-id'] as string | undefined,
    );
    return true;
  }

  private async authenticateBearer(
    token: string,
    correlationId: string,
    organizationIdHeader?: string,
  ): Promise<AuthenticatedPrincipal> {
    const verified = await this.tokens.verifyAccessToken(token);

    let user = await this.users.findByKeycloakSubjectId(verified.subject);
    if (!user) {
      user = await this.users.findByEmail(verified.email);
      if (user) {
        user = await this.users.linkKeycloakSubject(
          user.id,
          verified.subject,
        );
      } else {
        const nameParts = verified.email.split('@')[0]?.split('.') ?? ['User'];
        user = await this.users.create({
          email: verified.email,
          firstName: nameParts[0] ?? 'User',
          lastName: nameParts[1] ?? 'Account',
          keycloakSubjectId: verified.subject,
        });
        user = await this.users.update(user.id, {
          version: user.version,
          status: 'active',
        });
      }
    }

    await this.users.markLogin(user.id);

    let permissions: Permission[] = [];
    let roles: string[] = [];
    let organizationId = organizationIdHeader;

    if (organizationId) {
      const membership = await this.memberships.findByUserAndOrg(
        user.id,
        organizationId,
      );
      if (membership && membership.status === 'active') {
        permissions = membership.permissions;
        roles = membership.roles.map((r) => r.slug);
      }
    } else {
      const memberships = await this.memberships.list({
        userId: user.id,
        page: 1,
        pageSize: 1,
        sortOrder: 'desc',
      });
      const primary =
        memberships.items.find((m) => m.isPrimary && m.status === 'active') ??
        memberships.items.find((m) => m.status === 'active');
      if (primary) {
        organizationId = primary.organizationId;
        permissions = primary.permissions;
        roles = primary.roles.map((r) => r.slug);
      }
    }

    return {
      userId: user.id,
      email: user.email,
      organizationId,
      permissions,
      roles,
      sessionId: verified.sessionId,
      correlationId,
      actorType: 'user',
    };
  }

  private async authenticateApiKey(
    rawKey: string,
    correlationId: string,
  ): Promise<AuthenticatedPrincipal> {
    const hash = this.crypto.hashToken(rawKey);
    const record = await this.apiKeys.findByKeyHash(hash);
    if (!record) {
      throw new UnauthorizedError('Invalid API key');
    }
    await this.apiKeys.touchLastUsed(record.apiKey.id, new Date());

    return {
      userId: '00000000-0000-0000-0000-000000000001',
      email: `apikey:${record.apiKey.id}@gain.network`,
      organizationId: record.organizationId,
      permissions: record.scopes as Permission[],
      roles: record.roleSlugs,
      apiKeyId: record.apiKey.id,
      correlationId,
      actorType: 'api_key',
    };
  }
}
