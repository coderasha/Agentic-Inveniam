-- CreateEnum
CREATE TYPE "ProvenanceSubjectType" AS ENUM ('twin', 'twin_attribute', 'document', 'document_version', 'asset', 'asset_valuation', 'graph_node', 'graph_edge', 'claim', 'custom');

-- CreateEnum
CREATE TYPE "ProvenanceSourceType" AS ENUM ('upload', 'api', 'sensor', 'inference', 'manual', 'sync', 'external');

-- CreateEnum
CREATE TYPE "ProvenanceStatus" AS ENUM ('recorded', 'verified', 'disputed', 'revoked');

-- CreateEnum
CREATE TYPE "ProvenanceLinkRelation" AS ENUM ('derived_from', 'supersedes', 'corroborates', 'contradicts', 'extracted_from', 'attests');

-- CreateTable
CREATE TABLE "provenance_records" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subject_type" "ProvenanceSubjectType" NOT NULL,
    "subject_id" UUID NOT NULL,
    "source_type" "ProvenanceSourceType" NOT NULL DEFAULT 'manual',
    "source_ref" VARCHAR(500),
    "content_hash" CHAR(64) NOT NULL,
    "chain_hash" CHAR(64) NOT NULL,
    "previous_record_id" UUID,
    "previous_hash" CHAR(64),
    "confidence" DOUBLE PRECISION,
    "status" "ProvenanceStatus" NOT NULL DEFAULT 'recorded',
    "summary" VARCHAR(1000),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "captured_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_at" TIMESTAMPTZ(3),
    "verified_by_user_id" UUID,
    "revoked_at" TIMESTAMPTZ(3),
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "provenance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provenance_links" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "from_record_id" UUID NOT NULL,
    "to_record_id" UUID NOT NULL,
    "relation" "ProvenanceLinkRelation" NOT NULL,
    "note" VARCHAR(1000),
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "provenance_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "provenance_records_organization_id_subject_type_subject_id_idx" ON "provenance_records"("organization_id", "subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "provenance_records_organization_id_status_captured_at_idx" ON "provenance_records"("organization_id", "status", "captured_at");

-- CreateIndex
CREATE INDEX "provenance_records_content_hash_idx" ON "provenance_records"("content_hash");

-- CreateIndex
CREATE INDEX "provenance_records_chain_hash_idx" ON "provenance_records"("chain_hash");

-- CreateIndex
CREATE INDEX "provenance_records_previous_record_id_idx" ON "provenance_records"("previous_record_id");

-- CreateIndex
CREATE INDEX "provenance_links_organization_id_relation_idx" ON "provenance_links"("organization_id", "relation");

-- CreateIndex
CREATE UNIQUE INDEX "provenance_links_from_record_id_to_record_id_relation_key" ON "provenance_links"("from_record_id", "to_record_id", "relation");

-- AddForeignKey
ALTER TABLE "provenance_records" ADD CONSTRAINT "provenance_records_previous_record_id_fkey" FOREIGN KEY ("previous_record_id") REFERENCES "provenance_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provenance_links" ADD CONSTRAINT "provenance_links_from_record_id_fkey" FOREIGN KEY ("from_record_id") REFERENCES "provenance_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provenance_links" ADD CONSTRAINT "provenance_links_to_record_id_fkey" FOREIGN KEY ("to_record_id") REFERENCES "provenance_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
