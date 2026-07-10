import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import appConfig, { validateEnv } from './config';
import { TwinModule } from './twin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, cache: true,
      envFilePath: ['../../.env', '.env', '../../../.env'],
      load: [appConfig], validate: validateEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
        redact: { paths: ['req.headers.authorization'], remove: true },
      },
    }),
    ThrottlerModule.forRoot([{
      ttl: Number(process.env.RATE_LIMIT_TTL_MS ?? 60_000),
      limit: Number(process.env.RATE_LIMIT_LIMIT ?? 120),
    }]),
    TwinModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
