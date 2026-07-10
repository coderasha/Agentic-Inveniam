import { registerAs } from '@nestjs/config';
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production', 'staging']).default('development'),
  TWIN_API_PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  TWIN_API_HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  KAFKA_BROKERS: z.string().min(1),
  KAFKA_CLIENT_ID: z.string().default('gain-twin-api'),
  KAFKA_GROUP_ID: z.string().default('gain-twin-api'),
  KEYCLOAK_ISSUER: z.string().min(1),
  KEYCLOAK_JWKS_URI: z.string().min(1),
  KEYCLOAK_AUDIENCE: z.string().min(1),
  IDENTITY_DEV_AUTH_SECRET: z.string().min(32).optional(),
  RATE_LIMIT_TTL_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_LIMIT: z.coerce.number().int().positive().default(120),
});

export function validateEnv(config: Record<string, unknown>) {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  return parsed.data;
}

export default registerAs('app', () => ({
  port: Number(process.env.TWIN_API_PORT ?? 3002),
  host: process.env.TWIN_API_HOST ?? '0.0.0.0',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((x) => x.trim()).filter(Boolean),
}));
