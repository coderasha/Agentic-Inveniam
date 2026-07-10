-- CreateEnum
CREATE TYPE "AnalyticsReportStatus" AS ENUM ('active', 'archived');

-- CreateTable
CREATE TABLE "analytics_snapshots" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "notes" VARCHAR(2000),
    "captured_at" TIMESTAMPTZ(3) NOT NULL,
    "metrics" JSONB NOT NULL,
    "derived" JSONB NOT NULL DEFAULT '{}',
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_reports" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000),
    "status" "AnalyticsReportStatus" NOT NULL DEFAULT 'active',
    "metrics" JSONB NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "analytics_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analytics_snapshots_organization_id_captured_at_idx" ON "analytics_snapshots"("organization_id", "captured_at");

-- CreateIndex
CREATE INDEX "analytics_reports_organization_id_status_idx" ON "analytics_reports"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_reports_organization_id_slug_key" ON "analytics_reports"("organization_id", "slug");
