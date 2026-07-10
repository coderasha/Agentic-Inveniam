-- CreateEnum
CREATE TYPE "AiMarketplaceListingStatus" AS ENUM ('draft', 'published', 'unpublished', 'archived');

-- CreateEnum
CREATE TYPE "AiMarketplacePricingModel" AS ENUM ('free', 'per_run', 'monthly');

-- CreateEnum
CREATE TYPE "AiMarketplaceCategory" AS ENUM ('diligence', 'valuation', 'compliance', 'portfolio', 'trust', 'general');

-- CreateEnum
CREATE TYPE "AiMarketplaceInstallStatus" AS ENUM ('active', 'suspended', 'cancelled');

-- CreateTable
CREATE TABLE "ai_marketplace_listings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "source_agent_id" UUID,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "summary" VARCHAR(500) NOT NULL,
    "description" VARCHAR(4000),
    "category" "AiMarketplaceCategory" NOT NULL DEFAULT 'general',
    "status" "AiMarketplaceListingStatus" NOT NULL DEFAULT 'draft',
    "pricing_model" "AiMarketplacePricingModel" NOT NULL DEFAULT 'free',
    "price_minor" BIGINT NOT NULL DEFAULT 0,
    "currency_code" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "included_runs" INTEGER NOT NULL DEFAULT 0,
    "system_prompt" VARCHAR(8000) NOT NULL,
    "provider" "AiProvider" NOT NULL DEFAULT 'heuristic',
    "model" VARCHAR(100) NOT NULL DEFAULT 'gain-heuristic-v1',
    "tools" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "published_at" TIMESTAMPTZ(3),
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "ai_marketplace_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_marketplace_installs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "status" "AiMarketplaceInstallStatus" NOT NULL DEFAULT 'active',
    "pricing_model" "AiMarketplacePricingModel" NOT NULL,
    "price_minor" BIGINT NOT NULL,
    "currency_code" VARCHAR(3) NOT NULL,
    "included_runs" INTEGER NOT NULL,
    "period_start" TIMESTAMPTZ(3) NOT NULL,
    "period_end" TIMESTAMPTZ(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ai_marketplace_installs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_marketplace_usage_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "install_id" UUID NOT NULL,
    "units" INTEGER NOT NULL DEFAULT 1,
    "reference_type" VARCHAR(64),
    "reference_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_marketplace_usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_marketplace_listings_status_category_updated_at_idx" ON "ai_marketplace_listings"("status", "category", "updated_at");

-- CreateIndex
CREATE INDEX "ai_marketplace_listings_organization_id_status_idx" ON "ai_marketplace_listings"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ai_marketplace_listings_organization_id_slug_key" ON "ai_marketplace_listings"("organization_id", "slug");

-- CreateIndex
CREATE INDEX "ai_marketplace_installs_organization_id_status_created_at_idx" ON "ai_marketplace_installs"("organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "ai_marketplace_installs_listing_id_idx" ON "ai_marketplace_installs"("listing_id");

-- CreateIndex
CREATE INDEX "ai_marketplace_installs_agent_id_idx" ON "ai_marketplace_installs"("agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_marketplace_installs_organization_id_listing_id_key" ON "ai_marketplace_installs"("organization_id", "listing_id");

-- CreateIndex
CREATE INDEX "ai_marketplace_usage_events_install_id_created_at_idx" ON "ai_marketplace_usage_events"("install_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_marketplace_usage_events_organization_id_created_at_idx" ON "ai_marketplace_usage_events"("organization_id", "created_at");

-- AddForeignKey
ALTER TABLE "ai_marketplace_installs" ADD CONSTRAINT "ai_marketplace_installs_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "ai_marketplace_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_marketplace_usage_events" ADD CONSTRAINT "ai_marketplace_usage_events_install_id_fkey" FOREIGN KEY ("install_id") REFERENCES "ai_marketplace_installs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
