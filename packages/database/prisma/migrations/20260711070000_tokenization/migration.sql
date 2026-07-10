-- CreateEnum
CREATE TYPE "TokenNetwork" AS ENUM ('offchain', 'polygon_amoy', 'fabric_dev');

-- CreateEnum
CREATE TYPE "TokenInstrumentStatus" AS ENUM ('draft', 'active', 'frozen', 'retired');

-- CreateEnum
CREATE TYPE "TokenSubjectType" AS ENUM ('asset', 'twin', 'portfolio', 'custom');

-- CreateEnum
CREATE TYPE "TokenLedgerEntryType" AS ENUM ('mint', 'burn', 'transfer', 'allocate', 'freeze', 'unfreeze');

-- CreateEnum
CREATE TYPE "TokenSettlementStatus" AS ENUM ('settled', 'pending', 'failed');

-- CreateTable
CREATE TABLE "token_instruments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "symbol" VARCHAR(12) NOT NULL,
    "subject_type" "TokenSubjectType" NOT NULL,
    "subject_id" UUID NOT NULL,
    "network" "TokenNetwork" NOT NULL DEFAULT 'offchain',
    "status" "TokenInstrumentStatus" NOT NULL DEFAULT 'draft',
    "decimals" INTEGER NOT NULL DEFAULT 0,
    "total_supply" BIGINT NOT NULL DEFAULT 0,
    "total_supply_cap" BIGINT,
    "contract_ref" VARCHAR(200),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "token_instruments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_holdings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "instrument_id" UUID NOT NULL,
    "holder_ref" VARCHAR(200) NOT NULL,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "frozen" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "token_holdings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_ledger_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "instrument_id" UUID NOT NULL,
    "entry_type" "TokenLedgerEntryType" NOT NULL,
    "from_holder_ref" VARCHAR(200),
    "to_holder_ref" VARCHAR(200),
    "amount" BIGINT NOT NULL,
    "tx_hash" CHAR(64) NOT NULL,
    "previous_tx_hash" CHAR(64),
    "settlement_status" "TokenSettlementStatus" NOT NULL DEFAULT 'settled',
    "settlement_ref" VARCHAR(500),
    "memo" VARCHAR(500),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "token_instruments_organization_id_status_idx" ON "token_instruments"("organization_id", "status");

-- CreateIndex
CREATE INDEX "token_instruments_organization_id_subject_type_subject_id_idx" ON "token_instruments"("organization_id", "subject_type", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "token_instruments_organization_id_symbol_key" ON "token_instruments"("organization_id", "symbol");

-- CreateIndex
CREATE INDEX "token_holdings_organization_id_holder_ref_idx" ON "token_holdings"("organization_id", "holder_ref");

-- CreateIndex
CREATE UNIQUE INDEX "token_holdings_instrument_id_holder_ref_key" ON "token_holdings"("instrument_id", "holder_ref");

-- CreateIndex
CREATE INDEX "token_ledger_entries_organization_id_instrument_id_created_at_idx" ON "token_ledger_entries"("organization_id", "instrument_id", "created_at");

-- CreateIndex
CREATE INDEX "token_ledger_entries_entry_type_idx" ON "token_ledger_entries"("entry_type");

-- CreateIndex
CREATE UNIQUE INDEX "token_ledger_entries_instrument_id_tx_hash_key" ON "token_ledger_entries"("instrument_id", "tx_hash");

-- AddForeignKey
ALTER TABLE "token_holdings" ADD CONSTRAINT "token_holdings_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "token_instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_ledger_entries" ADD CONSTRAINT "token_ledger_entries_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "token_instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
