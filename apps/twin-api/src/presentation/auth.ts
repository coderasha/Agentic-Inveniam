import {
  CanActivate, createParamDecorator, ExecutionContext, Inject, Injectable, SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { AuthenticatedPrincipal } from '../domain/twin/auth.types';
import type { TokenVerifier } from '../domain/twin/ports';
import { TOKEN_VERIFIER } from '../domain/twin/tokens';
import { UnauthorizedError } from '../domain/twin/errors';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export interface AuthenticatedRequest extends Request {
  principal: AuthenticatedPrincipal;
  correlationId: string;
}

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPrincipal =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().principal,
);

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
    const claimPermissions = token.claims.permissions;
    const headerPermissions = request.headers['x-permissions'];
    const permissions = Array.isArray(claimPermissions) && claimPermissions.every((p) => typeof p === 'string')
      ? claimPermissions as string[]
      : typeof headerPermissions === 'string'
        ? headerPermissions.split(',').map((p) => p.trim()).filter(Boolean)
        : [];
    request.principal = {
      userId: token.subject, email: token.email, permissions, correlationId,
      organizationId: typeof request.headers['x-organization-id'] === 'string'
        ? request.headers['x-organization-id'] : undefined,
    };
    return true;
  }
}
