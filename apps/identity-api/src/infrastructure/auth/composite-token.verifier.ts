import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignJWT, jwtVerify } from 'jose';
import type {
  TokenVerifier,
  VerifiedToken,
} from '../../domain/identity/ports/infrastructure.ports';
import { UnauthorizedError } from '../../domain/identity/errors';
import { KeycloakTokenVerifier } from './keycloak-token.verifier';

/**
 * Verifies Keycloak JWTs in all environments.
 * In development only, also accepts HS256 tokens minted with IDENTITY_DEV_AUTH_SECRET
 * so local smoke tests can run before Keycloak is available.
 */
@Injectable()
export class CompositeTokenVerifier implements TokenVerifier {
  private readonly logger = new Logger(CompositeTokenVerifier.name);
  private readonly devSecret: Uint8Array | null;
  private readonly audience: string;

  constructor(
    private readonly keycloak: KeycloakTokenVerifier,
    config: ConfigService,
  ) {
    const nodeEnv = config.get<string>('NODE_ENV') ?? 'development';
    const secret = config.get<string>('IDENTITY_DEV_AUTH_SECRET');
    this.audience = config.getOrThrow<string>('KEYCLOAK_AUDIENCE');
    this.devSecret =
      nodeEnv === 'development' && secret && secret.length >= 32
        ? new TextEncoder().encode(secret)
        : null;

    if (this.devSecret) {
      this.logger.warn(
        'IDENTITY_DEV_AUTH_SECRET enabled — development tokens accepted',
      );
    }
  }

  async verifyAccessToken(token: string): Promise<VerifiedToken> {
    if (this.devSecret) {
      try {
        return await this.verifyDevToken(token);
      } catch {
        // Fall through to Keycloak
      }
    }

    return this.keycloak.verifyAccessToken(token);
  }

  private async verifyDevToken(token: string): Promise<VerifiedToken> {
    if (!this.devSecret) {
      throw new UnauthorizedError('Dev auth is disabled');
    }

    const { payload } = await jwtVerify(token, this.devSecret, {
      algorithms: ['HS256'],
      audience: this.audience,
      issuer: 'gain-identity-dev',
    });

    const email =
      typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
    if (!payload.sub || !email) {
      throw new UnauthorizedError('Dev token missing required claims');
    }

    return {
      subject: payload.sub,
      email,
      emailVerified: true,
      sessionId:
        typeof payload.sid === 'string' ? payload.sid : undefined,
      audience: payload.aud ?? this.audience,
      expiresAt: payload.exp ?? 0,
      claims: payload as Record<string, unknown>,
    };
  }
}

export async function mintDevAccessToken(params: {
  secret: string;
  subject: string;
  email: string;
  audience: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const key = new TextEncoder().encode(params.secret);
  return new SignJWT({
    email: params.email,
    email_verified: true,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(params.subject)
    .setIssuer('gain-identity-dev')
    .setAudience(params.audience)
    .setIssuedAt()
    .setExpirationTime(`${params.expiresInSeconds ?? 3600}s`)
    .sign(key);
}
