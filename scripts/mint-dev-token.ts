#!/usr/bin/env tsx
/**
 * Mint a development HS256 access token for local Identity API smoke tests.
 * Requires IDENTITY_DEV_AUTH_SECRET (>=32 chars) and NODE_ENV=development.
 */
import { mintDevAccessToken } from '../apps/identity-api/src/infrastructure/auth/composite-token.verifier';

async function main() {
  const secret = process.env.IDENTITY_DEV_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('IDENTITY_DEV_AUTH_SECRET must be set (min 32 chars)');
  }

  const email = process.env.DEV_TOKEN_EMAIL ?? 'admin@gain.network';
  const subject = process.env.DEV_TOKEN_SUBJECT ?? 'dev-admin-subject';
  const audience =
    process.env.KEYCLOAK_AUDIENCE ?? 'gain-identity-api';

  const token = await mintDevAccessToken({
    secret,
    subject,
    email,
    audience,
    expiresInSeconds: 8 * 60 * 60,
  });

  process.stdout.write(`${token}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
