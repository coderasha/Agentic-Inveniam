-- CreateEnum
CREATE TYPE "InvestorType" AS ENUM ('individual', 'family_office', 'institution', 'fund', 'advisor', 'other');

-- CreateEnum
CREATE TYPE "InvestorStatus" AS ENUM ('prospect', 'qualified', 'active', 'inactive', 'do_not_contact');

-- CreateEnum
CREATE TYPE "InvestorPipelineStage" AS ENUM ('lead', 'contacted', 'meeting', 'diligence', 'committed', 'closed', 'lost');

-- CreateEnum
CREATE TYPE "InteractionChannel" AS ENUM ('email', 'call', 'meeting', 'note', 'event', 'other');

-- CreateEnum
CREATE TYPE "CommitmentStatus" AS ENUM ('soft', 'hard', 'funded', 'cancelled');

-- CreateTable
CREATE TABLE "investors" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "display_name" VARCHAR(200) NOT NULL,
    "investor_type" "InvestorType" NOT NULL DEFAULT 'individual',
    "status" "InvestorStatus" NOT NULL DEFAULT 'prospect',
    "pipeline_stage" "InvestorPipelineStage" NOT NULL DEFAULT 'lead',
    "email" VARCHAR(320),
    "phone" VARCHAR(40),
    "company" VARCHAR(200),
    "country_code" CHAR(2),
    "owner_ref" VARCHAR(200),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "investors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investor_interactions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "investor_id" UUID NOT NULL,
    "channel" "InteractionChannel" NOT NULL DEFAULT 'note',
    "subject" VARCHAR(300) NOT NULL,
    "body" VARCHAR(8000),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investor_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investor_commitments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "investor_id" UUID NOT NULL,
    "portfolio_id" UUID,
    "label" VARCHAR(200) NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency_code" CHAR(3) NOT NULL DEFAULT 'USD',
    "status" "CommitmentStatus" NOT NULL DEFAULT 'soft',
    "committed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "investor_commitments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "investors_organization_id_status_pipeline_stage_idx" ON "investors"("organization_id", "status", "pipeline_stage");

-- CreateIndex
CREATE INDEX "investors_organization_id_display_name_idx" ON "investors"("organization_id", "display_name");

-- CreateIndex
CREATE INDEX "investors_email_idx" ON "investors"("email");

-- CreateIndex
CREATE INDEX "investor_interactions_organization_id_investor_id_occurred_at_idx" ON "investor_interactions"("organization_id", "investor_id", "occurred_at");

-- CreateIndex
CREATE INDEX "investor_commitments_organization_id_investor_id_status_idx" ON "investor_commitments"("organization_id", "investor_id", "status");

-- CreateIndex
CREATE INDEX "investor_commitments_portfolio_id_idx" ON "investor_commitments"("portfolio_id");

-- AddForeignKey
ALTER TABLE "investor_interactions" ADD CONSTRAINT "investor_interactions_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_commitments" ADD CONSTRAINT "investor_commitments_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
