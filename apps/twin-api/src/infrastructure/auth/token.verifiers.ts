import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTPayload } from 'jose';
import type { TokenVerifier } from '../../domain/twin/ports';
import type { VerifiedToken } from '../../domain/twin/auth.types';
import { UnauthorizedError } from '../../domain/twin/errors';

@Injectable()
export class KeycloakTokenVerifier implements TokenVerifier {
  private readonly logger = new Logger(KeycloakTokenVerifier.name);
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;
  private readonly audience: string;
  constructor(config: ConfigService) {
    this.issuer = config.getOrThrow<string>('KEYCLOAK_ISSUER');
    this.audience = config.getOrThrow<string>('KEYCLOAK_AUDIENCE');
    this.jwks = createRemoteJWKSet(new URL(config.getOrThrow<string>('KEYCLOAK_JWKS_URI')));
  }
  async verifyAccessToken(token: string): Promise<VerifiedToken> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, { issuer: this.issuer });
      const aud = payload.aud;
      const valid = payload.azp === this.audience || aud === this.audience ||
        (Array.isArray(aud) && aud.includes(this.audience));
      if (!valid) throw new UnauthorizedError('Token audience is invalid');
      return this.map(payload);
    } catch (error) {
      this.logger.warn(`Token verification failed: ${error instanceof Error ? error.message : String(error)}`);
      throw new UnauthorizedError('Invalid or expired access token');
    }
  }
  private map(payload: JWTPayload): VerifiedToken {
    const email = typeof payload.email === 'string' ? payload.email :
      typeof payload.preferred_username === 'string' ? payload.preferred_username : undefined;
    if (!payload.sub || !email) throw new UnauthorizedError('Token missing required claims');
    return {
      subject: payload.sub, email: email.toLowerCase(), emailVerified: payload.email_verified === true,
      sessionId: typeof payload.sid === 'string' ? payload.sid : undefined,
      audience: payload.aud ?? this.audience, expiresAt: payload.exp ?? 0,
      claims: payload as Record<string, unknown>,
    };
  }
}

@Injectable()
export class CompositeTokenVerifier implements TokenVerifier {
  private readonly devSecret: Uint8Array | null;
  private readonly audience: string;
  constructor(private readonly keycloak: KeycloakTokenVerifier, config: ConfigService) {
    const secret = config.get<string>('IDENTITY_DEV_AUTH_SECRET');
    this.audience = config.getOrThrow<string>('KEYCLOAK_AUDIENCE');
    this.devSecret = config.get<string>('NODE_ENV') === 'development' && secret && secret.length >= 32
      ? new TextEncoder().encode(secret) : null;
  }
  async verifyAccessToken(token: string): Promise<VerifiedToken> {
    if (this.devSecret) {
      try {
        const { payload } = await jwtVerify(token, this.devSecret, {
          algorithms: ['HS256'], audience: this.audience, issuer: 'gain-identity-dev',
        });
        const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
        if (!payload.sub || !email) throw new UnauthorizedError('Dev token missing required claims');
        return {
          subject: payload.sub, email, emailVerified: true,
          sessionId: typeof payload.sid === 'string' ? payload.sid : undefined,
          audience: payload.aud ?? this.audience, expiresAt: payload.exp ?? 0,
          claims: payload as Record<string, unknown>,
        };
      } catch {
        // A token that is not a valid development token may still be a Keycloak token.
      }
    }
    return this.keycloak.verifyAccessToken(token);
  }
}

export async function mintDevAccessToken(params: {
  secret: string; subject: string; email: string; audience: string;
  permissions?: string[]; expiresInSeconds?: number;
}): Promise<string> {
  return new SignJWT({
    email: params.email, email_verified: true, permissions: params.permissions ?? [],
  })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(params.subject)
    .setIssuer('gain-identity-dev').setAudience(params.audience).setIssuedAt()
    .setExpirationTime(`${params.expiresInSeconds ?? 3600}s`)
    .sign(new TextEncoder().encode(params.secret));
}
