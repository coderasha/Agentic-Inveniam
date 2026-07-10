import { z } from 'zod';
import { paginationQuerySchema } from '../identity/schemas.js';

export const VALUATION_PERMISSIONS = [
  'valuation:model:create',
  'valuation:model:read',
  'valuation:model:update',
  'valuation:run:create',
  'valuation:run:read',
  'valuation:run:cancel',
] as const;

export type ValuationPermission = (typeof VALUATION_PERMISSIONS)[number];

export const valuationMethodologySchema = z.enum([
  'income',
  'market_comps',
  'cost',
  'nav',
  'dcf',
  'hybrid',
  'manual',
  'external',
]);
export type ValuationMethodology = z.infer<typeof valuationMethodologySchema>;

export const valuationModelStatusSchema = z.enum([
  'draft',
  'active',
  'archived',
]);
export type ValuationModelStatus = z.infer<typeof valuationModelStatusSchema>;

export const valuationRunStatusSchema = z.enum([
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
]);
export type ValuationRunStatus = z.infer<typeof valuationRunStatusSchema>;

export const createValuationModelSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(200).trim(),
  slug: z
    .string()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  methodology: valuationMethodologySchema,
  description: z.string().max(2000).optional(),
  parameters: z.record(z.unknown()).default({}),
});
export type CreateValuationModelInput = z.infer<typeof createValuationModelSchema>;

export const createValuationRunSchema = z.object({
  organizationId: z.string().uuid(),
  modelId: z.string().uuid(),
  subjectType: z.enum(['asset', 'twin', 'portfolio', 'custom']),
  subjectId: z.string().uuid(),
  asOfDate: z.string().datetime().or(z.string().date()),
  currencyCode: z.string().length(3).default('USD'),
  inputs: z.record(z.unknown()).default({}),
});
export type CreateValuationRunInput = z.infer<typeof createValuationRunSchema>;

export const listValuationQuerySchema = paginationQuerySchema.extend({
  status: valuationRunStatusSchema.optional(),
  subjectType: z.string().optional(),
  subjectId: z.string().uuid().optional(),
  modelId: z.string().uuid().optional(),
});

export const VALUATION_KAFKA_TOPICS = {
  MODEL_CREATED: 'gain.valuation.model.created',
  RUN_QUEUED: 'gain.valuation.run.queued',
  RUN_COMPLETED: 'gain.valuation.run.completed',
  RUN_FAILED: 'gain.valuation.run.failed',
} as const;
