import type { Permission } from '@gain/shared';

export interface AuthenticatedPrincipal {
  userId: string;
  email: string;
  organizationId?: string;
  permissions: Permission[];
  roles: string[];
  sessionId?: string;
  apiKeyId?: string;
  correlationId: string;
  actorType: 'user' | 'api_key' | 'system' | 'service';
}

export interface RequestContext {
  principal: AuthenticatedPrincipal;
  ipAddress?: string;
  userAgent?: string;
}

export const AUTH_PRINCIPAL_KEY = 'authPrincipal';
