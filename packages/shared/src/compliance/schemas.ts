import { z } from 'zod';
import { paginationQuerySchema } from '../identity/schemas.js';

export const COMPLIANCE_PERMISSIONS = [
  'compliance:policy:create',
  'compliance:policy:read',
  'compliance:policy:update',
  'compliance:check:create',
  'compliance:check:read',
  'compliance:finding:read',
  'compliance:finding:update',
  'compliance:case:create',
  'compliance:case:read',
  'compliance:case:update',
] as const;

export type CompliancePermission = (typeof COMPLIANCE_PERMISSIONS)[number];

export const compliancePolicyStatusSchema = z.enum([
  'draft',
  'active',
  'archived',
]);
export type CompliancePolicyStatus = z.infer<typeof compliancePolicyStatusSchema>;

export const complianceSubjectTypeSchema = z.enum([
  'asset',
  'twin',
  'document',
  'investor',
  'portfolio',
  'token_instrument',
  'organization',
  'custom',
]);
export type ComplianceSubjectType = z.infer<typeof complianceSubjectTypeSchema>;

export const complianceCheckStatusSchema = z.enum([
  'passed',
  'failed',
  'warning',
  'error',
]);
export type ComplianceCheckStatus = z.infer<typeof complianceCheckStatusSchema>;

export const complianceFindingSeveritySchema = z.enum([
  'low',
  'medium',
  'high',
  'critical',
]);
export type ComplianceFindingSeverity = z.infer<typeof complianceFindingSeveritySchema>;

export const complianceFindingStatusSchema = z.enum([
  'open',
  'accepted',
  'remediated',
  'waived',
]);
export type ComplianceFindingStatus = z.infer<typeof complianceFindingStatusSchema>;

export const complianceCaseStatusSchema = z.enum([
  'open',
  'in_progress',
  'resolved',
  'closed',
]);
export type ComplianceCaseStatus = z.infer<typeof complianceCaseStatusSchema>;

export const complianceRuleTypeSchema = z.enum([
  'required_field',
  'min_trust_score',
  'min_provenance_verified',
  'forbidden_status',
  'required_tag',
]);
export type ComplianceRuleType = z.infer<typeof complianceRuleTypeSchema>;

export const complianceRuleSchema = z.object({
  id: z.string().min(1).max(64),
  type: complianceRuleTypeSchema,
  severity: complianceFindingSeveritySchema.default('medium'),
  message: z.string().min(1).max(500),
  field: z.string().max(100).optional(),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
});
export type ComplianceRule = z.infer<typeof complianceRuleSchema>;

export const createCompliancePolicySchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(200).trim(),
  slug: z
    .string()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().max(2000).optional(),
  subjectType: complianceSubjectTypeSchema,
  rules: z.array(complianceRuleSchema).min(1).max(50),
});
export type CreateCompliancePolicyInput = z.infer<typeof createCompliancePolicySchema>;

export const runComplianceCheckSchema = z.object({
  organizationId: z.string().uuid(),
  policyId: z.string().uuid(),
  subjectType: complianceSubjectTypeSchema,
  subjectId: z.string().uuid(),
  subjectSnapshot: z.record(z.unknown()),
});
export type RunComplianceCheckInput = z.infer<typeof runComplianceCheckSchema>;

export const listComplianceQuerySchema = paginationQuerySchema.extend({
  status: z.string().optional(),
  subjectType: complianceSubjectTypeSchema.optional(),
  subjectId: z.string().uuid().optional(),
  policyId: z.string().uuid().optional(),
});

export const COMPLIANCE_KAFKA_TOPICS = {
  POLICY_CREATED: 'gain.compliance.policy.created',
  CHECK_COMPLETED: 'gain.compliance.check.completed',
  FINDING_UPDATED: 'gain.compliance.finding.updated',
  CASE_CREATED: 'gain.compliance.case.created',
  CASE_UPDATED: 'gain.compliance.case.updated',
} as const;
