-- CreateSchema
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('active', 'suspended', 'pending_verification', 'archived');
CREATE TYPE "UserStatus" AS ENUM ('active', 'invited', 'suspended', 'deactivated');
CREATE TYPE "MembershipStatus" AS ENUM ('active', 'invited', 'suspended', 'removed');
CREATE TYPE "InvitationStatus" AS ENUM ('pending', 'accepted', 'revoked', 'expired');
CREATE TYPE "ApiKeyStatus" AS ENUM ('active', 'revoked', 'expired');
CREATE TYPE "ActorType" AS ENUM ('user', 'api_key', 'system', 'service');
CREATE TYPE "AuditAction" AS ENUM ('create', 'update', 'delete', 'soft_delete', 'restore', 'invite', 'accept_invite', 'revoke', 'assign_role', 'revoke_role', 'login', 'logout', 'permission_denied');
CREATE TYPE "AbacEffect" AS ENUM ('allow', 'deny');
CREATE TYPE "OutboxStatus" AS ENUM ('pending', 'published', 'failed');

-- CreateTable organizations
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "legal_name" VARCHAR(300),
    "description" VARCHAR(2000),
    "website" VARCHAR(500),
    "industry" VARCHAR(100),
    "country_code" CHAR(2),
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
    "status" "OrganizationStatus" NOT NULL DEFAULT 'pending_verification',
    "parent_organization_id" UUID,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");
CREATE INDEX "organizations_status_idx" ON "organizations"("status");
CREATE INDEX "organizations_parent_organization_id_idx" ON "organizations"("parent_organization_id");
CREATE INDEX "organizations_deleted_at_idx" ON "organizations"("deleted_at");
CREATE INDEX "organizations_created_at_idx" ON "organizations"("created_at");

ALTER TABLE "organizations" ADD CONSTRAINT "organizations_parent_organization_id_fkey" FOREIGN KEY ("parent_organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "organization_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changed_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organization_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "organization_versions_organization_id_version_key" ON "organization_versions"("organization_id", "version");
CREATE INDEX "organization_versions_organization_id_created_at_idx" ON "organization_versions"("organization_id", "created_at");
ALTER TABLE "organization_versions" ADD CONSTRAINT "organization_versions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(320) NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "display_name" VARCHAR(200),
    "phone" VARCHAR(20),
    "locale" VARCHAR(16) NOT NULL DEFAULT 'en-US',
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
    "status" "UserStatus" NOT NULL DEFAULT 'invited',
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "keycloak_subject_id" VARCHAR(128),
    "last_login_at" TIMESTAMPTZ(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_keycloak_subject_id_key" ON "users"("keycloak_subject_id");
CREATE INDEX "users_status_idx" ON "users"("status");
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

CREATE TABLE "user_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changed_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_versions_user_id_version_key" ON "user_versions"("user_id", "version");
CREATE INDEX "user_versions_user_id_created_at_idx" ON "user_versions"("user_id", "created_at");
ALTER TABLE "user_versions" ADD CONSTRAINT "user_versions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description" VARCHAR(1000),
    "permissions" TEXT[],
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "roles_organization_id_slug_key" ON "roles"("organization_id", "slug");
CREATE INDEX "roles_is_system_idx" ON "roles"("is_system");
CREATE INDEX "roles_deleted_at_idx" ON "roles"("deleted_at");
ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "title" VARCHAR(200),
    "department" VARCHAR(200),
    "status" "MembershipStatus" NOT NULL DEFAULT 'invited',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "memberships_user_id_organization_id_key" ON "memberships"("user_id", "organization_id");
CREATE INDEX "memberships_organization_id_status_idx" ON "memberships"("organization_id", "status");
CREATE INDEX "memberships_user_id_status_idx" ON "memberships"("user_id", "status");
CREATE INDEX "memberships_deleted_at_idx" ON "memberships"("deleted_at");
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "membership_roles" (
    "membership_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by" UUID,
    CONSTRAINT "membership_roles_pkey" PRIMARY KEY ("membership_id", "role_id")
);
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'pending',
    "message" VARCHAR(1000),
    "invited_by_user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");
CREATE INDEX "invitations_organization_id_status_idx" ON "invitations"("organization_id", "status");
CREATE INDEX "invitations_email_status_idx" ON "invitations"("email", "status");
CREATE INDEX "invitations_expires_at_idx" ON "invitations"("expires_at");
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "invitation_roles" (
    "invitation_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    CONSTRAINT "invitation_roles_pkey" PRIMARY KEY ("invitation_id", "role_id")
);
ALTER TABLE "invitation_roles" ADD CONSTRAINT "invitation_roles_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invitation_roles" ADD CONSTRAINT "invitation_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "api_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "key_prefix" VARCHAR(16) NOT NULL,
    "key_hash" VARCHAR(128) NOT NULL,
    "status" "ApiKeyStatus" NOT NULL DEFAULT 'active',
    "scopes" TEXT[],
    "last_used_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");
CREATE INDEX "api_keys_organization_id_status_idx" ON "api_keys"("organization_id", "status");
CREATE INDEX "api_keys_key_prefix_idx" ON "api_keys"("key_prefix");
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "api_key_roles" (
    "api_key_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    CONSTRAINT "api_key_roles_pkey" PRIMARY KEY ("api_key_id", "role_id")
);
ALTER TABLE "api_key_roles" ADD CONSTRAINT "api_key_roles_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "api_key_roles" ADD CONSTRAINT "api_key_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "organization_id" UUID,
    "keycloak_session_id" VARCHAR(128),
    "ip_address" VARCHAR(64),
    "user_agent" VARCHAR(500),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "user_sessions_user_id_revoked_at_idx" ON "user_sessions"("user_id", "revoked_at");
CREATE INDEX "user_sessions_expires_at_idx" ON "user_sessions"("expires_at");
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "abac_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(1000),
    "effect" "AbacEffect" NOT NULL,
    "resource_type" VARCHAR(100) NOT NULL,
    "actions" TEXT[],
    "conditions" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    CONSTRAINT "abac_policies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "abac_policies_organization_id_name_key" ON "abac_policies"("organization_id", "name");
CREATE INDEX "abac_policies_organization_id_resource_type_enabled_idx" ON "abac_policies"("organization_id", "resource_type", "enabled");
CREATE INDEX "abac_policies_priority_idx" ON "abac_policies"("priority");
ALTER TABLE "abac_policies" ADD CONSTRAINT "abac_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID,
    "actor_user_id" UUID,
    "actor_type" "ActorType" NOT NULL,
    "action" "AuditAction" NOT NULL,
    "resource_type" VARCHAR(100) NOT NULL,
    "resource_id" VARCHAR(64),
    "correlation_id" UUID NOT NULL,
    "ip_address" VARCHAR(64),
    "user_agent" VARCHAR(500),
    "changes" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");
CREATE INDEX "audit_logs_resource_type_resource_id_idx" ON "audit_logs"("resource_type", "resource_id");
CREATE INDEX "audit_logs_correlation_id_idx" ON "audit_logs"("correlation_id");
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "outbox_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "topic" VARCHAR(200) NOT NULL,
    "aggregate_type" VARCHAR(100) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "event_type" VARCHAR(200) NOT NULL,
    "payload" JSONB NOT NULL,
    "headers" JSONB NOT NULL DEFAULT '{}',
    "status" "OutboxStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" VARCHAR(2000),
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "outbox_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "outbox_messages_status_available_at_idx" ON "outbox_messages"("status", "available_at");
CREATE INDEX "outbox_messages_aggregate_type_aggregate_id_idx" ON "outbox_messages"("aggregate_type", "aggregate_id");
