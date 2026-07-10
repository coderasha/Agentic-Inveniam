-- Document Management
CREATE TYPE "DocumentStatus" AS ENUM ('draft', 'uploaded', 'processing', 'ready', 'quarantined', 'archived');
CREATE TYPE "DocumentScanStatus" AS ENUM ('pending', 'clean', 'infected', 'skipped');
CREATE TYPE "DocumentSensitivity" AS ENUM ('public', 'internal', 'confidential', 'restricted');
CREATE TYPE "DocumentLinkTargetType" AS ENUM ('organization', 'twin', 'asset', 'user', 'workflow');

CREATE TABLE "documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "description" VARCHAR(4000),
    "category" VARCHAR(100) NOT NULL DEFAULT 'general',
    "sensitivity" "DocumentSensitivity" NOT NULL DEFAULT 'internal',
    "status" "DocumentStatus" NOT NULL DEFAULT 'draft',
    "scan_status" "DocumentScanStatus" NOT NULL DEFAULT 'pending',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mime_type" VARCHAR(200) NOT NULL,
    "file_name" VARCHAR(500) NOT NULL,
    "byte_size" BIGINT NOT NULL,
    "checksum_sha256" CHAR(64) NOT NULL,
    "storage_key" VARCHAR(1000) NOT NULL,
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "documents_organization_id_status_idx" ON "documents"("organization_id", "status");
CREATE INDEX "documents_organization_id_category_idx" ON "documents"("organization_id", "category");
CREATE INDEX "documents_checksum_sha256_idx" ON "documents"("checksum_sha256");
CREATE INDEX "documents_deleted_at_idx" ON "documents"("deleted_at");
CREATE INDEX "documents_created_at_idx" ON "documents"("created_at");

CREATE TABLE "document_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "file_name" VARCHAR(500) NOT NULL,
    "mime_type" VARCHAR(200) NOT NULL,
    "byte_size" BIGINT NOT NULL,
    "checksum_sha256" CHAR(64) NOT NULL,
    "storage_key" VARCHAR(1000) NOT NULL,
    "change_summary" VARCHAR(1000),
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "document_versions_document_id_version_number_key" ON "document_versions"("document_id", "version_number");
CREATE INDEX "document_versions_document_id_created_at_idx" ON "document_versions"("document_id", "created_at");
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "document_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "target_type" "DocumentLinkTargetType" NOT NULL,
    "target_id" UUID NOT NULL,
    "relationship" VARCHAR(100) NOT NULL DEFAULT 'attached_to',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),
    CONSTRAINT "document_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "document_links_document_id_target_type_target_id_relationship_key" ON "document_links"("document_id", "target_type", "target_id", "relationship");
CREATE INDEX "document_links_organization_id_target_type_target_id_idx" ON "document_links"("organization_id", "target_type", "target_id");
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Asset Registry
CREATE TYPE "AssetStatus" AS ENUM ('draft', 'active', 'under_review', 'disposed', 'archived');
CREATE TYPE "AssetClass" AS ENUM ('real_estate', 'private_equity', 'private_credit', 'infrastructure', 'fund', 'collectible', 'operating_company', 'other');

CREATE TABLE "registered_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "description" VARCHAR(4000),
    "asset_class" "AssetClass" NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'draft',
    "twin_id" UUID,
    "external_reference" VARCHAR(200),
    "currency_code" CHAR(3) NOT NULL DEFAULT 'USD',
    "acquisition_date" DATE,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    CONSTRAINT "registered_assets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "registered_assets_twin_id_key" ON "registered_assets"("twin_id");
CREATE UNIQUE INDEX "registered_assets_organization_id_slug_key" ON "registered_assets"("organization_id", "slug");
CREATE INDEX "registered_assets_organization_id_status_idx" ON "registered_assets"("organization_id", "status");
CREATE INDEX "registered_assets_organization_id_asset_class_idx" ON "registered_assets"("organization_id", "asset_class");
CREATE INDEX "registered_assets_deleted_at_idx" ON "registered_assets"("deleted_at");

CREATE TABLE "asset_valuations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "asset_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "as_of_date" DATE NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "methodology" VARCHAR(100) NOT NULL,
    "confidence" DOUBLE PRECISION,
    "source" VARCHAR(100),
    "notes" VARCHAR(2000),
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "asset_valuations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "asset_valuations_asset_id_as_of_date_idx" ON "asset_valuations"("asset_id", "as_of_date");
CREATE INDEX "asset_valuations_organization_id_as_of_date_idx" ON "asset_valuations"("organization_id", "as_of_date");
ALTER TABLE "asset_valuations" ADD CONSTRAINT "asset_valuations_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "registered_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Workflow
CREATE TYPE "WorkflowStatus" AS ENUM ('draft', 'active', 'paused', 'archived');
CREATE TYPE "WorkflowRunStatus" AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');
CREATE TYPE "WorkflowTaskStatus" AS ENUM ('pending', 'in_progress', 'completed', 'skipped', 'failed');

CREATE TABLE "workflow_definitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000),
    "status" "WorkflowStatus" NOT NULL DEFAULT 'draft',
    "definition" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    CONSTRAINT "workflow_definitions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "workflow_definitions_organization_id_slug_key" ON "workflow_definitions"("organization_id", "slug");
CREATE INDEX "workflow_definitions_organization_id_status_idx" ON "workflow_definitions"("organization_id", "status");

CREATE TABLE "workflow_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "status" "WorkflowRunStatus" NOT NULL DEFAULT 'pending',
    "context" JSONB NOT NULL DEFAULT '{}',
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "workflow_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "workflow_runs_organization_id_status_idx" ON "workflow_runs"("organization_id", "status");
CREATE INDEX "workflow_runs_workflow_id_created_at_idx" ON "workflow_runs"("workflow_id", "created_at");
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflow_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "workflow_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "run_id" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "status" "WorkflowTaskStatus" NOT NULL DEFAULT 'pending',
    "assignee_user_id" UUID,
    "input" JSONB NOT NULL DEFAULT '{}',
    "output" JSONB,
    "due_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "workflow_tasks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "workflow_tasks_run_id_key_key" ON "workflow_tasks"("run_id", "key");
CREATE INDEX "workflow_tasks_run_id_status_idx" ON "workflow_tasks"("run_id", "status");
ALTER TABLE "workflow_tasks" ADD CONSTRAINT "workflow_tasks_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "workflow_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Notifications
CREATE TYPE "NotificationChannel" AS ENUM ('in_app', 'email', 'webhook');
CREATE TYPE "NotificationStatus" AS ENUM ('pending', 'sent', 'failed', 'read');

CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID,
    "user_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'in_app',
    "status" "NotificationStatus" NOT NULL DEFAULT 'pending',
    "title" VARCHAR(300) NOT NULL,
    "body" VARCHAR(4000) NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "read_at" TIMESTAMPTZ(3),
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notifications_user_id_status_created_at_idx" ON "notifications"("user_id", "status", "created_at");
CREATE INDEX "notifications_organization_id_created_at_idx" ON "notifications"("organization_id", "created_at");
