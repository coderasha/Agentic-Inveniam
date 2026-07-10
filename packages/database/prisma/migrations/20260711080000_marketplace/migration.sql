-- CreateEnum
CREATE TYPE "MarketplaceSubjectType" AS ENUM ('asset', 'token_instrument', 'twin', 'custom');

-- CreateEnum
CREATE TYPE "MarketplaceListingStatus" AS ENUM ('draft', 'open', 'partially_filled', 'filled', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "MarketplaceOrderStatus" AS ENUM ('open', 'partially_filled', 'filled', 'cancelled', 'rejected');

-- CreateEnum
CREATE TYPE "MarketplaceOrderType" AS ENUM ('limit', 'market');

-- CreateEnum
CREATE TYPE "MarketplaceTradeStatus" AS ENUM ('settled', 'pending', 'failed');

-- CreateTable
CREATE TABLE "marketplace_listings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subject_type" "MarketplaceSubjectType" NOT NULL,
    "subject_id" UUID NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "description" VARCHAR(4000),
    "seller_ref" VARCHAR(200) NOT NULL,
    "currency_code" CHAR(3) NOT NULL DEFAULT 'USD',
    "price_minor" BIGINT NOT NULL,
    "quantity" BIGINT NOT NULL,
    "quantity_remaining" BIGINT NOT NULL,
    "status" "MarketplaceListingStatus" NOT NULL DEFAULT 'open',
    "expires_at" TIMESTAMPTZ(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "marketplace_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_orders" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "buyer_ref" VARCHAR(200) NOT NULL,
    "order_type" "MarketplaceOrderType" NOT NULL DEFAULT 'limit',
    "price_minor" BIGINT,
    "quantity" BIGINT NOT NULL,
    "filled_quantity" BIGINT NOT NULL DEFAULT 0,
    "status" "MarketplaceOrderStatus" NOT NULL DEFAULT 'open',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "marketplace_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_trades" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "seller_ref" VARCHAR(200) NOT NULL,
    "buyer_ref" VARCHAR(200) NOT NULL,
    "price_minor" BIGINT NOT NULL,
    "quantity" BIGINT NOT NULL,
    "notional_minor" BIGINT NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "status" "MarketplaceTradeStatus" NOT NULL DEFAULT 'settled',
    "settlement_ref" VARCHAR(200),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketplace_trades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "marketplace_listings_organization_id_status_created_at_idx" ON "marketplace_listings"("organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "marketplace_listings_organization_id_subject_type_subject_id_idx" ON "marketplace_listings"("organization_id", "subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "marketplace_listings_expires_at_idx" ON "marketplace_listings"("expires_at");

-- CreateIndex
CREATE INDEX "marketplace_orders_organization_id_status_created_at_idx" ON "marketplace_orders"("organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "marketplace_orders_listing_id_status_idx" ON "marketplace_orders"("listing_id", "status");

-- CreateIndex
CREATE INDEX "marketplace_trades_organization_id_created_at_idx" ON "marketplace_trades"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "marketplace_trades_listing_id_created_at_idx" ON "marketplace_trades"("listing_id", "created_at");

-- CreateIndex
CREATE INDEX "marketplace_trades_order_id_idx" ON "marketplace_trades"("order_id");

-- AddForeignKey
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "marketplace_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_trades" ADD CONSTRAINT "marketplace_trades_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "marketplace_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_trades" ADD CONSTRAINT "marketplace_trades_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "marketplace_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
