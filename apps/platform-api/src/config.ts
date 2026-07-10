import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production', 'staging']).default('development'),
  PLATFORM_API_PORT: z.coerce.number().int().min(1).max(65535).default(3003),
  PLATFORM_API_HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  KAFKA_BROKERS: z.string().min(1),
  KAFKA_CLIENT_ID: z.string().default('gain-platform-api'),
  KEYCLOAK_ISSUER: z.string().min(1),
  KEYCLOAK_JWKS_URI: z.string().min(1),
  KEYCLOAK_AUDIENCE: z.string().min(1),
  IDENTITY_DEV_AUTH_SECRET: z.string().min(32).optional(),
  DOCUMENT_STORAGE_ROOT: z.string().default('./storage/documents'),
});
export function validateEnv(config: Record<string, unknown>) {
  const result = schema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${result.error.issues
      .map((item) => `${item.path.join('.')}: ${item.message}`).join('; ')}`);
  }
  return result.data;
}
export default registerAs('app', () => ({
  port: Number(process.env.PLATFORM_API_PORT ?? 3003),
  host: process.env.PLATFORM_API_HOST ?? '0.0.0.0',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',').map((item) => item.trim()).filter(Boolean),
}));
