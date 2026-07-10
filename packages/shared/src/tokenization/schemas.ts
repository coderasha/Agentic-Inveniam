import { z } from 'zod';
import { paginationQuerySchema } from '../identity/schemas.js';

export const TOKENIZATION_PERMISSIONS = [
  'tokenization:instrument:create',
  'tokenization:instrument:read',
  'tokenization:instrument:update',
  'tokenization:mint',
  'tokenization:burn',
  'tokenization:transfer',
  'tokenization:allocate',
  'tokenization:freeze',
  'tokenization:ledger:read',
] as const;

export type TokenizationPermission = (typeof TOKENIZATION_PERMISSIONS)[number];

export const tokenNetworkSchema = z.enum([
  'offchain',
  'polygon_amoy',
  'fabric_dev',
]);
export type TokenNetwork = z.infer<typeof tokenNetworkSchema>;

export const tokenInstrumentStatusSchema = z.enum([
  'draft',
  'active',
  'frozen',
  'retired',
]);
export type TokenInstrumentStatus = z.infer<typeof tokenInstrumentStatusSchema>;

export const tokenSubjectTypeSchema = z.enum([
  'asset',
  'twin',
  'portfolio',
  'custom',
]);
export type TokenSubjectType = z.infer<typeof tokenSubjectTypeSchema>;

export const tokenLedgerEntryTypeSchema = z.enum([
  'mint',
  'burn',
  'transfer',
  'allocate',
  'freeze',
  'unfreeze',
]);
export type TokenLedgerEntryType = z.infer<typeof tokenLedgerEntryTypeSchema>;

export const createTokenInstrumentSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(200).trim(),
  symbol: z
    .string()
    .min(2)
    .max(12)
    .regex(/^[A-Z0-9]+$/),
  subjectType: tokenSubjectTypeSchema,
  subjectId: z.string().uuid(),
  network: tokenNetworkSchema.default('offchain'),
  decimals: z.number().int().min(0).max(18).default(0),
  totalSupplyCap: z.string().regex(/^\d+$/).optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type CreateTokenInstrumentInput = z.infer<typeof createTokenInstrumentSchema>;

export const mintTokensSchema = z.object({
  toHolderRef: z.string().min(1).max(200),
  amount: z.string().regex(/^\d+$/),
  memo: z.string().max(500).optional(),
});
export type MintTokensInput = z.infer<typeof mintTokensSchema>;

export const burnTokensSchema = z.object({
  fromHolderRef: z.string().min(1).max(200),
  amount: z.string().regex(/^\d+$/),
  memo: z.string().max(500).optional(),
});
export type BurnTokensInput = z.infer<typeof burnTokensSchema>;

export const transferTokensSchema = z.object({
  fromHolderRef: z.string().min(1).max(200),
  toHolderRef: z.string().min(1).max(200),
  amount: z.string().regex(/^\d+$/),
  memo: z.string().max(500).optional(),
});
export type TransferTokensInput = z.infer<typeof transferTokensSchema>;

export const listTokenizationQuerySchema = paginationQuerySchema.extend({
  status: tokenInstrumentStatusSchema.optional(),
  subjectType: tokenSubjectTypeSchema.optional(),
  subjectId: z.string().uuid().optional(),
});

export const TOKENIZATION_KAFKA_TOPICS = {
  INSTRUMENT_CREATED: 'gain.tokenization.instrument.created',
  MINTED: 'gain.tokenization.minted',
  BURNED: 'gain.tokenization.burned',
  TRANSFERRED: 'gain.tokenization.transferred',
  FROZEN: 'gain.tokenization.frozen',
} as const;
