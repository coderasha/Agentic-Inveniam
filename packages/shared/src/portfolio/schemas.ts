import { z } from 'zod';
import { paginationQuerySchema } from '../identity/schemas.js';

export const PORTFOLIO_PERMISSIONS = [
  'portfolio:create',
  'portfolio:read',
  'portfolio:update',
  'portfolio:delete',
  'portfolio:position:manage',
  'portfolio:snapshot:create',
  'portfolio:snapshot:read',
  'portfolio:nav:read',
] as const;

export type PortfolioPermission = (typeof PORTFOLIO_PERMISSIONS)[number];

export const portfolioStatusSchema = z.enum([
  'draft',
  'active',
  'archived',
]);
export type PortfolioStatus = z.infer<typeof portfolioStatusSchema>;

export const portfolioPositionSubjectTypeSchema = z.enum([
  'asset',
  'twin',
  'token_instrument',
  'custom',
]);
export type PortfolioPositionSubjectType = z.infer<typeof portfolioPositionSubjectTypeSchema>;

export const createPortfolioSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(200).trim(),
  slug: z
    .string()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().max(2000).optional(),
  baseCurrency: z.string().length(3).default('USD'),
  metadata: z.record(z.unknown()).default({}),
});
export type CreatePortfolioInput = z.infer<typeof createPortfolioSchema>;

export const upsertPortfolioPositionSchema = z.object({
  subjectType: portfolioPositionSubjectTypeSchema,
  subjectId: z.string().uuid(),
  label: z.string().min(1).max(300).trim(),
  quantity: z.string().regex(/^-?\d+(\.\d+)?$/),
  costBasisMinor: z.string().regex(/^\d+$/).default('0'),
  marketValueMinor: z.string().regex(/^\d+$/).optional(),
  weightHint: z.number().min(0).max(1).optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type UpsertPortfolioPositionInput = z.infer<typeof upsertPortfolioPositionSchema>;

export const listPortfolioQuerySchema = paginationQuerySchema.extend({
  status: portfolioStatusSchema.optional(),
});

export const PORTFOLIO_KAFKA_TOPICS = {
  CREATED: 'gain.portfolio.created',
  UPDATED: 'gain.portfolio.updated',
  POSITION_UPSERTED: 'gain.portfolio.position.upserted',
  SNAPSHOT_CREATED: 'gain.portfolio.snapshot.created',
} as const;
