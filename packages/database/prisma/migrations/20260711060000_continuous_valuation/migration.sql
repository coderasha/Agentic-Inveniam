-- CreateEnum
CREATE TYPE "ValuationMethodology" AS ENUM ('income', 'market_comps', 'cost', 'nav', 'dcf', 'hybrid', 'manual', 'external');

-- CreateEnum
CREATE TYPE "ValuationModelStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "ValuationRunStatus" AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "ValuationSubjectType" AS ENUM ('asset', 'twin', 'portfolio', 'custom');

-- CreateTable
CREATE TABLE "valuation_models" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000),
    "methodology" "ValuationMethodology" NOT NULL,
    "status" "ValuationModelStatus" NOT NULL DEFAULT 'draft',
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "valuation_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "valuation_runs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "model_id" UUID NOT NULL,
    "subject_type" "ValuationSubjectType" NOT NULL,
    "subject_id" UUID NOT NULL,
    "status" "ValuationRunStatus" NOT NULL DEFAULT 'queued',
    "as_of_date" DATE NOT NULL,
    "currency_code" CHAR(3) NOT NULL DEFAULT 'USD',
    "inputs" JSONB NOT NULL DEFAULT '{}',
    "outputs" JSONB,
    "amount_minor" BIGINT,
    "confidence" DOUBLE PRECISION,
    "error_message" VARCHAR(2000),
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "valuation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "valuation_models_organization_id_status_idx" ON "valuation_models"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "valuation_models_organization_id_slug_key" ON "valuation_models"("organization_id", "slug");

-- CreateIndex
CREATE INDEX "valuation_runs_organization_id_status_created_at_idx" ON "valuation_runs"("organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "valuation_runs_organization_id_subject_type_subject_id_idx" ON "valuation_runs"("organization_id", "subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "valuation_runs_model_id_created_at_idx" ON "valuation_runs"("model_id", "created_at");

-- AddForeignKey
ALTER TABLE "valuation_runs" ADD CONSTRAINT "valuation_runs_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "valuation_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;
