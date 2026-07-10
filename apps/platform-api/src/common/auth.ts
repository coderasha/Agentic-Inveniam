import {
  CanActivate, createParamDecorator, ExecutionContext, Inject, Injectable, SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ForbiddenError, UnauthorizedError } from './errors';

export interface Principal {
  userId: string;
  email: string;
  organizationId?: string;
  permissions: string[];
  correlationId: string;
}
export interface VerifiedToken {
  subject: string; email: string; claims: Record<string, unknown>;
}
export interface TokenVerifier {
  verifyAccessToken(token: string): Promise<VerifiedToken>;
}
export const TOKEN_VERIFIER = Symbol('TOKEN_VERIFIER');
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export interface AuthenticatedRequest extends Request {
  principal: Principal;
  correlationId: string;
}
export const CurrentPrincipal = createParamDecorator(
  (_: unknown, context: ExecutionContext): Principal =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().principal,
);

@Injectable()
export class AuthorizationService {
  require(principal: Principal, permission: string, organizationRequired = true): void {
    const family = `${permission.split(':')[0]}:*`;
    if (!principal.permissions.includes(permission) && !principal.permissions.includes(family)) {
      throw new ForbiddenError(`Permission '${permission}' is required`);
    }
    if (organizationRequired && !principal.organizationId) {
      throw new ForbiddenError('x-organization-id is required');
    }
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(TOKEN_VERIFIER) private readonly verifier: TokenVerifier,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const correlationId = typeof request.headers['x-correlation-id'] === 'string'
      ? request.headers['x-correlation-id'] : uuidv4();
    request.correlationId = correlationId;
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])) {
      request.principal = {
        userId: '00000000-0000-0000-0000-000000000000',
        email: 'anonymous@gain.network', permissions: [], correlationId,
      };
      return true;
    }
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedError('Bearer token required');
    const token = await this.verifier.verifyAccessToken(authorization.slice(7).trim());
    const claims = token.claims.permissions;
    const fallback = request.headers['x-permissions'];
    const permissions = Array.isArray(claims) && claims.every((x) => typeof x === 'string')
      ? claims as string[] : typeof fallback === 'string'
        ? fallback.split(',').map((x) => x.trim()).filter(Boolean) : [];
    request.principal = {
      userId: token.subject, email: token.email, permissions, correlationId,
      organizationId: typeof request.headers['x-organization-id'] === 'string'
        ? request.headers['x-organization-id'] : undefined,
    };
    return true;
  }
}
