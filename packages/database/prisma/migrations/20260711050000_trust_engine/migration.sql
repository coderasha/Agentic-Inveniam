-- CreateEnum
CREATE TYPE "TrustSubjectType" AS ENUM ('twin', 'document', 'asset', 'graph_node', 'provenance_record', 'organization', 'claim', 'custom');

-- CreateEnum
CREATE TYPE "AttestationKind" AS ENUM ('identity', 'data_quality', 'valuation', 'legal', 'compliance', 'technical', 'custom');

-- CreateEnum
CREATE TYPE "AttestationStatus" AS ENUM ('active', 'expired', 'revoked', 'disputed');

-- CreateEnum
CREATE TYPE "TrustAnchorStatus" AS ENUM ('pending', 'anchored', 'failed');

-- CreateTable
CREATE TABLE "trust_attestations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subject_type" "TrustSubjectType" NOT NULL,
    "subject_id" UUID NOT NULL,
    "kind" "AttestationKind" NOT NULL DEFAULT 'data_quality',
    "status" "AttestationStatus" NOT NULL DEFAULT 'active',
    "statement" VARCHAR(2000) NOT NULL,
    "evidence_hash" CHAR(64),
    "provenance_record_id" UUID,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "expires_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "trust_attestations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trust_scores" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subject_type" "TrustSubjectType" NOT NULL,
    "subject_id" UUID NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "grade" VARCHAR(2) NOT NULL,
    "components" JSONB NOT NULL DEFAULT '{}',
    "attestation_count" INTEGER NOT NULL DEFAULT 0,
    "provenance_count" INTEGER NOT NULL DEFAULT 0,
    "computed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trust_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trust_anchors" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subject_type" "TrustSubjectType" NOT NULL,
    "subject_id" UUID NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "network" VARCHAR(64) NOT NULL DEFAULT 'offchain',
    "status" "TrustAnchorStatus" NOT NULL DEFAULT 'pending',
    "anchor_ref" VARCHAR(500),
    "anchored_at" TIMESTAMPTZ(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "trust_anchors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trust_attestations_organization_id_subject_type_subject_id_idx" ON "trust_attestations"("organization_id", "subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "trust_attestations_organization_id_status_kind_idx" ON "trust_attestations"("organization_id", "status", "kind");

-- CreateIndex
CREATE INDEX "trust_attestations_provenance_record_id_idx" ON "trust_attestations"("provenance_record_id");

-- CreateIndex
CREATE INDEX "trust_scores_organization_id_score_idx" ON "trust_scores"("organization_id", "score");

-- CreateIndex
CREATE UNIQUE INDEX "trust_scores_organization_id_subject_type_subject_id_key" ON "trust_scores"("organization_id", "subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "trust_anchors_organization_id_subject_type_subject_id_idx" ON "trust_anchors"("organization_id", "subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "trust_anchors_payload_hash_idx" ON "trust_anchors"("payload_hash");

-- CreateIndex
CREATE INDEX "trust_anchors_status_network_idx" ON "trust_anchors"("status", "network");
