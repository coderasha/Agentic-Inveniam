import { z } from 'zod';
import { paginationQuerySchema } from '../identity/schemas.js';

export const AI_MARKETPLACE_PERMISSIONS = [
  'ai_marketplace:listing:create',
  'ai_marketplace:listing:read',
  'ai_marketplace:listing:update',
  'ai_marketplace:listing:publish',
  'ai_marketplace:install:create',
  'ai_marketplace:install:read',
  'ai_marketplace:install:update',
  'ai_marketplace:usage:record',
  'ai_marketplace:usage:read',
] as const;

export type AiMarketplacePermission = (typeof AI_MARKETPLACE_PERMISSIONS)[number];

export const aiMarketplaceListingStatusSchema = z.enum([
  'draft',
  'published',
  'unpublished',
  'archived',
]);
export type AiMarketplaceListingStatus = z.infer<typeof aiMarketplaceListingStatusSchema>;

export const aiMarketplacePricingModelSchema = z.enum([
  'free',
  'per_run',
  'monthly',
]);
export type AiMarketplacePricingModel = z.infer<typeof aiMarketplacePricingModelSchema>;

export const aiMarketplaceCategorySchema = z.enum([
  'diligence',
  'valuation',
  'compliance',
  'portfolio',
  'trust',
  'general',
]);
export type AiMarketplaceCategory = z.infer<typeof aiMarketplaceCategorySchema>;

export const aiMarketplaceInstallStatusSchema = z.enum([
  'active',
  'suspended',
  'cancelled',
]);
export type AiMarketplaceInstallStatus = z.infer<typeof aiMarketplaceInstallStatusSchema>;

export const createAiMarketplaceListingSchema = z.object({
  organizationId: z.string().uuid(),
  sourceAgentId: z.string().uuid().optional(),
  name: z.string().min(1).max(200).trim(),
  slug: z
    .string()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  summary: z.string().min(1).max(500),
  description: z.string().max(4000).optional(),
  category: aiMarketplaceCategorySchema.default('general'),
  pricingModel: aiMarketplacePricingModelSchema.default('free'),
  priceMinor: z.string().regex(/^\d+$/).default('0'),
  currencyCode: z.string().length(3).default('USD'),
  includedRuns: z.number().int().min(0).max(1_000_000).default(0),
  systemPrompt: z.string().min(1).max(8000),
  provider: z.enum(['heuristic', 'openai']).default('heuristic'),
  model: z.string().max(100).default('gain-heuristic-v1'),
  tools: z.array(z.string().min(1).max(64)).max(20).default([]),
  metadata: z.record(z.unknown()).default({}),
});
export type CreateAiMarketplaceListingInput = z.infer<typeof createAiMarketplaceListingSchema>;

export const installAiMarketplaceListingSchema = z.object({
  organizationId: z.string().uuid(),
  listingId: z.string().uuid(),
  agentSlug: z
    .string()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type InstallAiMarketplaceListingInput = z.infer<typeof installAiMarketplaceListingSchema>;

export const recordAiMarketplaceUsageSchema = z.object({
  organizationId: z.string().uuid(),
  installId: z.string().uuid(),
  units: z.number().int().min(1).max(10_000).default(1),
  referenceType: z.string().max(64).optional(),
  referenceId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type RecordAiMarketplaceUsageInput = z.infer<typeof recordAiMarketplaceUsageSchema>;

export const listAiMarketplaceQuerySchema = paginationQuerySchema.extend({
  status: aiMarketplaceListingStatusSchema.optional(),
  category: aiMarketplaceCategorySchema.optional(),
  pricingModel: aiMarketplacePricingModelSchema.optional(),
});

export const AI_MARKETPLACE_KAFKA_TOPICS = {
  LISTING_CREATED: 'gain.ai_marketplace.listing.created',
  LISTING_PUBLISHED: 'gain.ai_marketplace.listing.published',
  LISTING_UNPUBLISHED: 'gain.ai_marketplace.listing.unpublished',
  INSTALL_CREATED: 'gain.ai_marketplace.install.created',
  INSTALL_UPDATED: 'gain.ai_marketplace.install.updated',
  USAGE_RECORDED: 'gain.ai_marketplace.usage.recorded',
} as const;
