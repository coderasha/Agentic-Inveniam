export interface AuthenticatedPrincipal {
  userId: string;
  email: string;
  organizationId?: string;
  permissions: string[];
  correlationId: string;
}

export interface VerifiedToken {
  subject: string;
  email: string;
  emailVerified: boolean;
  sessionId?: string;
  audience: string | string[];
  expiresAt: number;
  claims: Record<string, unknown>;
}
