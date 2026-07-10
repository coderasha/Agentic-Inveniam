import {
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import type { RequestContext } from '../../domain/identity/auth.types';
import type { AuthenticatedRequest } from '../guards/auth.guard';

export const CurrentContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestContext => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return {
      principal: request.principal,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    };
  },
);
