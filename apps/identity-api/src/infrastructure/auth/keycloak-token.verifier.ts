import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type {
  TokenVerifier,
  VerifiedToken,
} from '../../domain/identity/ports/infrastructure.ports';
import { UnauthorizedError } from '../../domain/identity/errors';

@Injectable()
export class KeycloakTokenVerifier implements TokenVerifier {
  private readonly logger = new Logger(KeycloakTokenVerifier.name);
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(config: ConfigService) {
    this.issuer = config.getOrThrow<string>('KEYCLOAK_ISSUER');
    this.audience = config.getOrThrow<string>('KEYCLOAK_AUDIENCE');
    const jwksUri = config.getOrThrow<string>('KEYCLOAK_JWKS_URI');
    this.jwks = createRemoteJWKSet(new URL(jwksUri));
  }

  async verifyAccessToken(token: string): Promise<VerifiedToken> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
      });
      return this.mapPayload(payload);
    } catch (error) {
      // Fallback: some Keycloak clients use azp instead of aud matching API client
      try {
        const { payload } = await jwtVerify(token, this.jwks, {
          issuer: this.issuer,
        });
        const azp = typeof payload.azp === 'string' ? payload.azp : undefined;
        const aud = payload.aud;
        const audienceOk =
          azp === this.audience ||
          aud === this.audience ||
          (Array.isArray(aud) && aud.includes(this.audience));
        if (!audienceOk) {
          throw new UnauthorizedError('Token audience is invalid');
        }
        return this.mapPayload(payload);
      } catch (inner) {
        this.logger.warn(
          `Token verification failed: ${
            inner instanceof Error ? inner.message : String(inner)
          }`,
        );
        throw new UnauthorizedError('Invalid or expired access token');
      }
    }
  }

  private mapPayload(payload: JWTPayload): VerifiedToken {
    const email =
      typeof payload.email === 'string'
        ? payload.email
        : typeof payload.preferred_username === 'string'
          ? payload.preferred_username
          : undefined;
    if (!payload.sub || !email) {
      throw new UnauthorizedError('Token missing required claims');
    }

    return {
      subject: payload.sub,
      email: email.toLowerCase(),
      emailVerified: payload.email_verified === true,
      sessionId:
        typeof payload.sid === 'string' ? payload.sid : undefined,
      audience: payload.aud ?? this.audience,
      expiresAt: payload.exp ?? 0,
      claims: payload as Record<string, unknown>,
    };
  }
}
