import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.IDENTITY_API_PORT ?? 3001),
  host: process.env.IDENTITY_API_HOST ?? '0.0.0.0',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  rateLimitTtlMs: Number(process.env.RATE_LIMIT_TTL_MS ?? 60_000),
  rateLimitLimit: Number(process.env.RATE_LIMIT_LIMIT ?? 120),
}));
