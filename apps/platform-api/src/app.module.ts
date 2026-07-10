import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { TerminusModule } from '@nestjs/terminus';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AssetModule } from './asset/asset.module';
import {
  AuthGuard, AuthorizationService, TOKEN_VERIFIER,
} from './common/auth';
import { GlobalExceptionFilter, HealthController } from './common/http';
import appConfig, { validateEnv } from './config';
import { DocumentModule } from './document/document.module';
import { GraphModule } from './graph/graph.module';
import {
  CompositeTokenVerifier, KafkaPublisher, KeycloakTokenVerifier,
  OutboxService, PrismaService, RedisService,
} from './infrastructure/services';
import { NotificationModule } from './notification/notification.module';
import { ProvenanceModule } from './provenance/provenance.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { TokenizationModule } from './tokenization/tokenization.module';
import { TrustModule } from './trust/trust.module';
import { ValuationModule } from './valuation/valuation.module';
import { WorkflowModule } from './workflow/workflow.module';

@Global()
@Module({
  controllers: [HealthController],
  imports: [TerminusModule],
  providers: [
    PrismaService, RedisService, KafkaPublisher, OutboxService,
    KeycloakTokenVerifier, CompositeTokenVerifier, AuthorizationService,
    { provide: TOKEN_VERIFIER, useExisting: CompositeTokenVerifier },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
  exports: [PrismaService, RedisService, KafkaPublisher, OutboxService, AuthorizationService],
})
class PlatformCoreModule {}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, cache: true, envFilePath: ['../../.env', '.env', '../../../.env'],
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
    ScheduleModule.forRoot(), TerminusModule, PlatformCoreModule,
    DocumentModule, AssetModule, WorkflowModule, NotificationModule, GraphModule, ProvenanceModule, TrustModule, ValuationModule, TokenizationModule, MarketplaceModule, PortfolioModule,
  ],
})
export class AppModule {}
