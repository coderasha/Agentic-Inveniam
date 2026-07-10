-- Digital Twin Engine

CREATE TYPE "TwinStatus" AS ENUM ('draft', 'active', 'suspended', 'archived');
CREATE TYPE "TwinAssetClass" AS ENUM ('real_estate', 'private_equity', 'private_credit', 'infrastructure', 'fund', 'collectible', 'operating_company', 'other');
CREATE TYPE "TwinLifecycleStage" AS ENUM ('origination', 'diligence', 'under_management', 'exit', 'retired');
CREATE TYPE "TwinAttributeDataType" AS ENUM ('string', 'number', 'boolean', 'datetime', 'json', 'money', 'percentage');
CREATE TYPE "TwinRelationshipType" AS ENUM ('parent_of', 'child_of', 'related_to', 'collateral_for', 'owned_by', 'managed_by', 'depends_on');
CREATE TYPE "TwinSignalSeverity" AS ENUM ('info', 'warning', 'critical');
CREATE TYPE "TwinInsightKind" AS ENUM ('summary', 'risk', 'valuation_driver', 'anomaly', 'recommendation');

CREATE TABLE "digital_twins" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "description" VARCHAR(4000),
    "asset_class" "TwinAssetClass" NOT NULL,
    "lifecycle_stage" "TwinLifecycleStage" NOT NULL DEFAULT 'origination',
    "status" "TwinStatus" NOT NULL DEFAULT 'draft',
    "external_reference" VARCHAR(200),
    "currency_code" CHAR(3) NOT NULL DEFAULT 'USD',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "completeness_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "published_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    CONSTRAINT "digital_twins_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "digital_twins_organization_id_slug_key" ON "digital_twins"("organization_id", "slug");
CREATE INDEX "digital_twins_organization_id_status_idx" ON "digital_twins"("organization_id", "status");
CREATE INDEX "digital_twins_organization_id_asset_class_idx" ON "digital_twins"("organization_id", "asset_class");
CREATE INDEX "digital_twins_lifecycle_stage_idx" ON "digital_twins"("lifecycle_stage");
CREATE INDEX "digital_twins_deleted_at_idx" ON "digital_twins"("deleted_at");
CREATE INDEX "digital_twins_created_at_idx" ON "digital_twins"("created_at");

CREATE TABLE "twin_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "twin_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changed_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "twin_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "twin_versions_twin_id_version_key" ON "twin_versions"("twin_id", "version");
CREATE INDEX "twin_versions_twin_id_created_at_idx" ON "twin_versions"("twin_id", "created_at");
ALTER TABLE "twin_versions" ADD CONSTRAINT "twin_versions_twin_id_fkey" FOREIGN KEY ("twin_id") REFERENCES "digital_twins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "twin_attributes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "twin_id" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "data_type" "TwinAttributeDataType" NOT NULL,
    "value" JSONB NOT NULL,
    "unit" VARCHAR(32),
    "source" VARCHAR(100),
    "confidence" DOUBLE PRECISION,
    "effective_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    CONSTRAINT "twin_attributes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "twin_attributes_twin_id_key_key" ON "twin_attributes"("twin_id", "key");
CREATE INDEX "twin_attributes_twin_id_deleted_at_idx" ON "twin_attributes"("twin_id", "deleted_at");
ALTER TABLE "twin_attributes" ADD CONSTRAINT "twin_attributes_twin_id_fkey" FOREIGN KEY ("twin_id") REFERENCES "digital_twins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "twin_relationships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "from_twin_id" UUID NOT NULL,
    "to_twin_id" UUID NOT NULL,
    "relationship_type" "TwinRelationshipType" NOT NULL,
    "label" VARCHAR(200),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    CONSTRAINT "twin_relationships_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "twin_relationships_from_twin_id_to_twin_id_relationship_type_key" ON "twin_relationships"("from_twin_id", "to_twin_id", "relationship_type");
CREATE INDEX "twin_relationships_organization_id_idx" ON "twin_relationships"("organization_id");
CREATE INDEX "twin_relationships_to_twin_id_idx" ON "twin_relationships"("to_twin_id");
ALTER TABLE "twin_relationships" ADD CONSTRAINT "twin_relationships_from_twin_id_fkey" FOREIGN KEY ("from_twin_id") REFERENCES "digital_twins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "twin_relationships" ADD CONSTRAINT "twin_relationships_to_twin_id_fkey" FOREIGN KEY ("to_twin_id") REFERENCES "digital_twins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "twin_signals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "twin_id" UUID NOT NULL,
    "signal_type" VARCHAR(100) NOT NULL,
    "severity" "TwinSignalSeverity" NOT NULL DEFAULT 'info',
    "title" VARCHAR(300) NOT NULL,
    "payload" JSONB NOT NULL,
    "source" VARCHAR(100),
    "observed_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "twin_signals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "twin_signals_twin_id_observed_at_idx" ON "twin_signals"("twin_id", "observed_at");
CREATE INDEX "twin_signals_twin_id_severity_idx" ON "twin_signals"("twin_id", "severity");
CREATE INDEX "twin_signals_signal_type_idx" ON "twin_signals"("signal_type");
ALTER TABLE "twin_signals" ADD CONSTRAINT "twin_signals_twin_id_fkey" FOREIGN KEY ("twin_id") REFERENCES "digital_twins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "twin_insights" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "twin_id" UUID NOT NULL,
    "kind" "TwinInsightKind" NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "summary" VARCHAR(4000) NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "model" VARCHAR(100),
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "generated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "twin_insights_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "twin_insights_twin_id_kind_generated_at_idx" ON "twin_insights"("twin_id", "kind", "generated_at");
ALTER TABLE "twin_insights" ADD CONSTRAINT "twin_insights_twin_id_fkey" FOREIGN KEY ("twin_id") REFERENCES "digital_twins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
