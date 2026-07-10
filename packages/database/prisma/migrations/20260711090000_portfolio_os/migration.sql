-- CreateEnum
CREATE TYPE "PortfolioStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "PortfolioPositionSubjectType" AS ENUM ('asset', 'twin', 'token_instrument', 'custom');

-- CreateTable
CREATE TABLE "portfolios" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000),
    "status" "PortfolioStatus" NOT NULL DEFAULT 'active',
    "base_currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "portfolios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_positions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "subject_type" "PortfolioPositionSubjectType" NOT NULL,
    "subject_id" UUID NOT NULL,
    "label" VARCHAR(300) NOT NULL,
    "quantity" DECIMAL(24,8) NOT NULL,
    "cost_basis_minor" BIGINT NOT NULL DEFAULT 0,
    "market_value_minor" BIGINT NOT NULL DEFAULT 0,
    "weight_hint" DOUBLE PRECISION,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "portfolio_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_snapshots" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "as_of_date" DATE NOT NULL,
    "base_currency" CHAR(3) NOT NULL,
    "nav_minor" BIGINT NOT NULL,
    "cost_basis_minor" BIGINT NOT NULL,
    "unrealized_pnl_minor" BIGINT NOT NULL,
    "position_count" INTEGER NOT NULL,
    "breakdown" JSONB NOT NULL DEFAULT '{}',
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portfolios_organization_id_status_idx" ON "portfolios"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "portfolios_organization_id_slug_key" ON "portfolios"("organization_id", "slug");

-- CreateIndex
CREATE INDEX "portfolio_positions_organization_id_portfolio_id_idx" ON "portfolio_positions"("organization_id", "portfolio_id");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_positions_portfolio_id_subject_type_subject_id_key" ON "portfolio_positions"("portfolio_id", "subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "portfolio_snapshots_portfolio_id_as_of_date_idx" ON "portfolio_snapshots"("portfolio_id", "as_of_date");

-- CreateIndex
CREATE INDEX "portfolio_snapshots_organization_id_as_of_date_idx" ON "portfolio_snapshots"("organization_id", "as_of_date");

-- AddForeignKey
ALTER TABLE "portfolio_positions" ADD CONSTRAINT "portfolio_positions_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_snapshots" ADD CONSTRAINT "portfolio_snapshots_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
