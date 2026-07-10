import { z } from 'zod';
import { paginationQuerySchema } from '../identity/schemas.js';

export const CRM_PERMISSIONS = [
  'crm:investor:create',
  'crm:investor:read',
  'crm:investor:update',
  'crm:investor:delete',
  'crm:interaction:create',
  'crm:interaction:read',
  'crm:commitment:create',
  'crm:commitment:read',
  'crm:commitment:update',
  'crm:pipeline:read',
] as const;

export type CrmPermission = (typeof CRM_PERMISSIONS)[number];

export const investorTypeSchema = z.enum([
  'individual',
  'family_office',
  'institution',
  'fund',
  'advisor',
  'other',
]);
export type InvestorType = z.infer<typeof investorTypeSchema>;

export const investorStatusSchema = z.enum([
  'prospect',
  'qualified',
  'active',
  'inactive',
  'do_not_contact',
]);
export type InvestorStatus = z.infer<typeof investorStatusSchema>;

export const investorPipelineStageSchema = z.enum([
  'lead',
  'contacted',
  'meeting',
  'diligence',
  'committed',
  'closed',
  'lost',
]);
export type InvestorPipelineStage = z.infer<typeof investorPipelineStageSchema>;

export const interactionChannelSchema = z.enum([
  'email',
  'call',
  'meeting',
  'note',
  'event',
  'other',
]);
export type InteractionChannel = z.infer<typeof interactionChannelSchema>;

export const commitmentStatusSchema = z.enum([
  'soft',
  'hard',
  'funded',
  'cancelled',
]);
export type CommitmentStatus = z.infer<typeof commitmentStatusSchema>;

export const createInvestorSchema = z.object({
  organizationId: z.string().uuid(),
  displayName: z.string().min(1).max(200).trim(),
  investorType: investorTypeSchema.default('individual'),
  email: z.string().email().max(320).optional(),
  phone: z.string().max(40).optional(),
  company: z.string().max(200).optional(),
  countryCode: z.string().length(2).optional(),
  pipelineStage: investorPipelineStageSchema.default('lead'),
  ownerRef: z.string().max(200).optional(),
  tags: z.array(z.string().min(1).max(64)).max(50).default([]),
  metadata: z.record(z.unknown()).default({}),
});
export type CreateInvestorInput = z.infer<typeof createInvestorSchema>;

export const createInteractionSchema = z.object({
  organizationId: z.string().uuid(),
  investorId: z.string().uuid(),
  channel: interactionChannelSchema.default('note'),
  subject: z.string().min(1).max(300).trim(),
  body: z.string().max(8000).optional(),
  occurredAt: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type CreateInteractionInput = z.infer<typeof createInteractionSchema>;

export const createCommitmentSchema = z.object({
  organizationId: z.string().uuid(),
  investorId: z.string().uuid(),
  portfolioId: z.string().uuid().optional(),
  label: z.string().min(1).max(200).trim(),
  amountMinor: z.string().regex(/^\d+$/),
  currencyCode: z.string().length(3).default('USD'),
  status: commitmentStatusSchema.default('soft'),
  committedAt: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type CreateCommitmentInput = z.infer<typeof createCommitmentSchema>;

export const listInvestorQuerySchema = paginationQuerySchema.extend({
  status: investorStatusSchema.optional(),
  pipelineStage: investorPipelineStageSchema.optional(),
  q: z.string().max(200).optional(),
});

export const CRM_KAFKA_TOPICS = {
  INVESTOR_CREATED: 'gain.crm.investor.created',
  INVESTOR_UPDATED: 'gain.crm.investor.updated',
  INTERACTION_CREATED: 'gain.crm.interaction.created',
  COMMITMENT_CREATED: 'gain.crm.commitment.created',
  COMMITMENT_UPDATED: 'gain.crm.commitment.updated',
} as const;
