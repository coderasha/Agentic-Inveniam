import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { TerminusModule } from '@nestjs/terminus';
import { ScheduleModule } from '@nestjs/schedule';
import {
  ABAC_POLICY_REPOSITORY,
  API_KEY_REPOSITORY,
  AUDIT_REPOSITORY,
  CACHE_PORT,
  CRYPTO_PORT,
  EVENT_PUBLISHER,
  INVITATION_REPOSITORY,
  MEMBERSHIP_REPOSITORY,
  ORGANIZATION_REPOSITORY,
  OUTBOX_REPOSITORY,
  ROLE_REPOSITORY,
  TOKEN_VERIFIER,
  USER_REPOSITORY,
} from '../domain/identity/tokens';
import { PrismaService } from '../infrastructure/persistence/prisma.service';
import { PrismaOrganizationRepository } from '../infrastructure/persistence/prisma-organization.repository';
import { PrismaUserRepository } from '../infrastructure/persistence/prisma-user.repository';
import { PrismaMembershipRepository } from '../infrastructure/persistence/prisma-membership.repository';
import { PrismaRoleRepository } from '../infrastructure/persistence/prisma-role.repository';
import { PrismaInvitationRepository } from '../infrastructure/persistence/prisma-invitation.repository';
import { PrismaApiKeyRepository } from '../infrastructure/persistence/prisma-api-key.repository';
import { PrismaAuditRepository } from '../infrastructure/persistence/prisma-audit.repository';
import { PrismaAbacPolicyRepository } from '../infrastructure/persistence/prisma-abac-policy.repository';
import { PrismaOutboxRepository } from '../infrastructure/persistence/prisma-outbox.repository';
import { NodeCryptoService } from '../infrastructure/crypto/node-crypto.service';
import { RedisCacheService } from '../infrastructure/cache/redis-cache.service';
import { KafkaEventPublisher } from '../infrastructure/messaging/kafka-event.publisher';
import { OutboxRelayService } from '../infrastructure/messaging/outbox-relay.service';
import { KeycloakTokenVerifier } from '../infrastructure/auth/keycloak-token.verifier';
import { AuthorizationService } from '../application/identity/authorization.service';
import { OrganizationService } from '../application/identity/organization.service';
import { UserService } from '../application/identity/user.service';
import { MembershipService } from '../application/identity/membership.service';
import { RoleService } from '../application/identity/role.service';
import {
  ApiKeyService,
  InvitationService,
} from '../application/identity/invitation-api-key.service';
import {
  AbacPolicyService,
  AuditService,
} from '../application/identity/audit-abac.service';
import { AuthGuard } from './guards/auth.guard';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { OrganizationsController } from './controllers/organizations.controller';
import {
  MembershipsController,
  UsersController,
} from './controllers/users-memberships.controller';
import {
  AbacPoliciesController,
  ApiKeysController,
  AuditLogsController,
  InvitationsController,
  RolesController,
} from './controllers/roles-invitations.controller';
import { HealthController } from './controllers/health.controller';

@Module({
  imports: [TerminusModule, ScheduleModule.forRoot()],
  controllers: [
    HealthController,
    OrganizationsController,
    UsersController,
    MembershipsController,
    RolesController,
    InvitationsController,
    ApiKeysController,
    AuditLogsController,
    AbacPoliciesController,
  ],
  providers: [
    PrismaService,
    RedisCacheService,
    KafkaEventPublisher,
    OutboxRelayService,
    NodeCryptoService,
    KeycloakTokenVerifier,
    AuthorizationService,
    OrganizationService,
    UserService,
    MembershipService,
    RoleService,
    InvitationService,
    ApiKeyService,
    AuditService,
    AbacPolicyService,
    { provide: ORGANIZATION_REPOSITORY, useClass: PrismaOrganizationRepository },
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: MEMBERSHIP_REPOSITORY, useClass: PrismaMembershipRepository },
    { provide: ROLE_REPOSITORY, useClass: PrismaRoleRepository },
    { provide: INVITATION_REPOSITORY, useClass: PrismaInvitationRepository },
    { provide: API_KEY_REPOSITORY, useClass: PrismaApiKeyRepository },
    { provide: AUDIT_REPOSITORY, useClass: PrismaAuditRepository },
    { provide: ABAC_POLICY_REPOSITORY, useClass: PrismaAbacPolicyRepository },
    { provide: OUTBOX_REPOSITORY, useClass: PrismaOutboxRepository },
    { provide: EVENT_PUBLISHER, useExisting: KafkaEventPublisher },
    { provide: CACHE_PORT, useExisting: RedisCacheService },
    { provide: TOKEN_VERIFIER, useExisting: KeycloakTokenVerifier },
    { provide: CRYPTO_PORT, useExisting: NodeCryptoService },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class IdentityModule {}
