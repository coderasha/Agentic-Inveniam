import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { TerminusModule } from '@nestjs/terminus';
import {
  AttributeService, AuthorizationService, InsightService, RelationshipService,
  SignalService, TwinService,
} from './application/services';
import {
  ATTRIBUTE_REPOSITORY, CACHE_PORT, CRYPTO_PORT, EVENT_PUBLISHER,
  INSIGHT_REPOSITORY, OUTBOX_REPOSITORY, RELATIONSHIP_REPOSITORY,
  SIGNAL_REPOSITORY, TOKEN_VERIFIER, TWIN_REPOSITORY,
} from './domain/twin/tokens';
import {
  KafkaEventPublisher, NodeCryptoService, OutboxRelay, RedisCacheService,
} from './infrastructure/adapters';
import {
  CompositeTokenVerifier, KeycloakTokenVerifier,
} from './infrastructure/auth/token.verifiers';
import {
  PrismaAttributeRepository, PrismaInsightRepository, PrismaOutboxRepository,
  PrismaRelationshipRepository, PrismaSignalRepository, PrismaTwinRepository,
} from './infrastructure/persistence/prisma.repositories';
import { PrismaService } from './infrastructure/persistence/prisma.service';
import { AuthGuard } from './presentation/auth';
import {
  AttributesController, InsightsController, RelationshipsController,
  SignalsController, TwinsController,
} from './presentation/controllers';
import { GlobalExceptionFilter } from './presentation/global-exception.filter';
import { HealthController } from './presentation/health.controller';

@Module({
  imports: [TerminusModule, ScheduleModule.forRoot()],
  controllers: [
    HealthController, TwinsController, AttributesController,
    RelationshipsController, SignalsController, InsightsController,
  ],
  providers: [
    PrismaService, RedisCacheService, KafkaEventPublisher, NodeCryptoService, OutboxRelay,
    KeycloakTokenVerifier, CompositeTokenVerifier, AuthorizationService, TwinService,
    AttributeService, RelationshipService, SignalService, InsightService,
    { provide: TWIN_REPOSITORY, useClass: PrismaTwinRepository },
    { provide: ATTRIBUTE_REPOSITORY, useClass: PrismaAttributeRepository },
    { provide: RELATIONSHIP_REPOSITORY, useClass: PrismaRelationshipRepository },
    { provide: SIGNAL_REPOSITORY, useClass: PrismaSignalRepository },
    { provide: INSIGHT_REPOSITORY, useClass: PrismaInsightRepository },
    { provide: OUTBOX_REPOSITORY, useClass: PrismaOutboxRepository },
    { provide: EVENT_PUBLISHER, useExisting: KafkaEventPublisher },
    { provide: CACHE_PORT, useExisting: RedisCacheService },
    { provide: TOKEN_VERIFIER, useExisting: CompositeTokenVerifier },
    { provide: CRYPTO_PORT, useExisting: NodeCryptoService },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class TwinModule {}
