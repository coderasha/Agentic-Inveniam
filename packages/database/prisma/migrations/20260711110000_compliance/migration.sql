-- CreateEnum
CREATE TYPE "CompliancePolicyStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "ComplianceSubjectType" AS ENUM ('asset', 'twin', 'document', 'investor', 'portfolio', 'token_instrument', 'organization', 'custom');

-- CreateEnum
CREATE TYPE "ComplianceCheckStatus" AS ENUM ('passed', 'failed', 'warning', 'error');

-- CreateEnum
CREATE TYPE "ComplianceFindingSeverity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "ComplianceFindingStatus" AS ENUM ('open', 'accepted', 'remediated', 'waived');

-- CreateEnum
CREATE TYPE "ComplianceCaseStatus" AS ENUM ('open', 'in_progress', 'resolved', 'closed');

-- CreateTable
CREATE TABLE "compliance_policies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000),
    "subject_type" "ComplianceSubjectType" NOT NULL,
    "status" "CompliancePolicyStatus" NOT NULL DEFAULT 'active',
    "rules" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "compliance_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_checks" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "subject_type" "ComplianceSubjectType" NOT NULL,
    "subject_id" UUID NOT NULL,
    "status" "ComplianceCheckStatus" NOT NULL,
    "summary" VARCHAR(1000) NOT NULL,
    "subject_snapshot" JSONB NOT NULL,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compliance_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_findings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "check_id" UUID NOT NULL,
    "rule_id" VARCHAR(64) NOT NULL,
    "severity" "ComplianceFindingSeverity" NOT NULL,
    "status" "ComplianceFindingStatus" NOT NULL DEFAULT 'open',
    "message" VARCHAR(500) NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "compliance_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_cases" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "check_id" UUID NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "status" "ComplianceCaseStatus" NOT NULL DEFAULT 'open',
    "assignee_ref" VARCHAR(200),
    "notes" VARCHAR(4000),
    "due_at" TIMESTAMPTZ(3),
    "resolved_at" TIMESTAMPTZ(3),
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "compliance_cases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "compliance_policies_organization_id_status_subject_type_idx" ON "compliance_policies"("organization_id", "status", "subject_type");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_policies_organization_id_slug_key" ON "compliance_policies"("organization_id", "slug");

-- CreateIndex
CREATE INDEX "compliance_checks_organization_id_status_created_at_idx" ON "compliance_checks"("organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "compliance_checks_policy_id_created_at_idx" ON "compliance_checks"("policy_id", "created_at");

-- CreateIndex
CREATE INDEX "compliance_checks_subject_type_subject_id_idx" ON "compliance_checks"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "compliance_findings_organization_id_status_severity_idx" ON "compliance_findings"("organization_id", "status", "severity");

-- CreateIndex
CREATE INDEX "compliance_findings_check_id_idx" ON "compliance_findings"("check_id");

-- CreateIndex
CREATE INDEX "compliance_cases_organization_id_status_created_at_idx" ON "compliance_cases"("organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "compliance_cases_check_id_idx" ON "compliance_cases"("check_id");

-- AddForeignKey
ALTER TABLE "compliance_checks" ADD CONSTRAINT "compliance_checks_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "compliance_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_findings" ADD CONSTRAINT "compliance_findings_check_id_fkey" FOREIGN KEY ("check_id") REFERENCES "compliance_checks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_cases" ADD CONSTRAINT "compliance_cases_check_id_fkey" FOREIGN KEY ("check_id") REFERENCES "compliance_checks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
