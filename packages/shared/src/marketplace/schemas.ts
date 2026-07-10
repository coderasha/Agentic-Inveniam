import { z } from 'zod';
import { paginationQuerySchema } from '../identity/schemas.js';

export const MARKETPLACE_PERMISSIONS = [
  'marketplace:listing:create',
  'marketplace:listing:read',
  'marketplace:listing:update',
  'marketplace:listing:cancel',
  'marketplace:order:create',
  'marketplace:order:read',
  'marketplace:order:cancel',
  'marketplace:trade:read',
] as const;

export type MarketplacePermission = (typeof MARKETPLACE_PERMISSIONS)[number];

export const marketplaceSubjectTypeSchema = z.enum([
  'asset',
  'token_instrument',
  'twin',
  'custom',
]);
export type MarketplaceSubjectType = z.infer<typeof marketplaceSubjectTypeSchema>;

export const marketplaceListingStatusSchema = z.enum([
  'draft',
  'open',
  'partially_filled',
  'filled',
  'cancelled',
  'expired',
]);
export type MarketplaceListingStatus = z.infer<typeof marketplaceListingStatusSchema>;

export const marketplaceOrderStatusSchema = z.enum([
  'open',
  'partially_filled',
  'filled',
  'cancelled',
  'rejected',
]);
export type MarketplaceOrderStatus = z.infer<typeof marketplaceOrderStatusSchema>;

export const marketplaceOrderTypeSchema = z.enum(['limit', 'market']);
export type MarketplaceOrderType = z.infer<typeof marketplaceOrderTypeSchema>;

export const marketplaceTradeStatusSchema = z.enum([
  'settled',
  'pending',
  'failed',
]);
export type MarketplaceTradeStatus = z.infer<typeof marketplaceTradeStatusSchema>;

export const createMarketplaceListingSchema = z.object({
  organizationId: z.string().uuid(),
  subjectType: marketplaceSubjectTypeSchema,
  subjectId: z.string().uuid(),
  title: z.string().min(1).max(300).trim(),
  description: z.string().max(4000).optional(),
  sellerRef: z.string().min(1).max(200),
  currencyCode: z.string().length(3).default('USD'),
  priceMinor: z.string().regex(/^\d+$/),
  quantity: z.string().regex(/^\d+$/),
  expiresAt: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type CreateMarketplaceListingInput = z.infer<typeof createMarketplaceListingSchema>;

export const createMarketplaceOrderSchema = z.object({
  organizationId: z.string().uuid(),
  listingId: z.string().uuid(),
  buyerRef: z.string().min(1).max(200),
  orderType: marketplaceOrderTypeSchema.default('limit'),
  priceMinor: z.string().regex(/^\d+$/).optional(),
  quantity: z.string().regex(/^\d+$/),
  metadata: z.record(z.unknown()).default({}),
});
export type CreateMarketplaceOrderInput = z.infer<typeof createMarketplaceOrderSchema>;

export const listMarketplaceQuerySchema = paginationQuerySchema.extend({
  status: marketplaceListingStatusSchema.optional(),
  subjectType: marketplaceSubjectTypeSchema.optional(),
  subjectId: z.string().uuid().optional(),
});

export const MARKETPLACE_KAFKA_TOPICS = {
  LISTING_CREATED: 'gain.marketplace.listing.created',
  LISTING_CANCELLED: 'gain.marketplace.listing.cancelled',
  ORDER_PLACED: 'gain.marketplace.order.placed',
  ORDER_CANCELLED: 'gain.marketplace.order.cancelled',
  TRADE_EXECUTED: 'gain.marketplace.trade.executed',
} as const;
