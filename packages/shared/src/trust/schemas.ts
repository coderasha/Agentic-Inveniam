import { z } from 'zod';
import { paginationQuerySchema } from '../identity/schemas.js';

export const TRUST_PERMISSIONS = [
  'trust:score:read',
  'trust:score:compute',
  'trust:attestation:create',
  'trust:attestation:read',
  'trust:attestation:revoke',
  'trust:anchor:create',
  'trust:anchor:read',
] as const;

export type TrustPermission = (typeof TRUST_PERMISSIONS)[number];

export const trustSubjectTypeSchema = z.enum([
  'twin',
  'document',
  'asset',
  'graph_node',
  'provenance_record',
  'organization',
  'claim',
  'custom',
]);
export type TrustSubjectType = z.infer<typeof trustSubjectTypeSchema>;

export const attestationKindSchema = z.enum([
  'identity',
  'data_quality',
  'valuation',
  'legal',
  'compliance',
  'technical',
  'custom',
]);
export type AttestationKind = z.infer<typeof attestationKindSchema>;

export const attestationStatusSchema = z.enum([
  'active',
  'expired',
  'revoked',
  'disputed',
]);
export type AttestationStatus = z.infer<typeof attestationStatusSchema>;

export const trustAnchorStatusSchema = z.enum([
  'pending',
  'anchored',
  'failed',
]);
export type TrustAnchorStatus = z.infer<typeof trustAnchorStatusSchema>;

export const createAttestationSchema = z.object({
  organizationId: z.string().uuid(),
  subjectType: trustSubjectTypeSchema,
  subjectId: z.string().uuid(),
  kind: attestationKindSchema.default('data_quality'),
  statement: z.string().min(1).max(2000),
  evidenceHash: z
    .string()
    .length(64)
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  provenanceRecordId: z.string().uuid().optional(),
  confidence: z.number().min(0).max(1).default(0.7),
  weight: z.number().min(0).max(1).default(1),
  expiresAt: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type CreateAttestationInput = z.infer<typeof createAttestationSchema>;

export const createTrustAnchorSchema = z.object({
  organizationId: z.string().uuid(),
  subjectType: trustSubjectTypeSchema,
  subjectId: z.string().uuid(),
  payloadHash: z
    .string()
    .length(64)
    .regex(/^[a-f0-9]{64}$/),
  network: z.string().min(1).max(64).default('offchain'),
  metadata: z.record(z.unknown()).default({}),
});
export type CreateTrustAnchorInput = z.infer<typeof createTrustAnchorSchema>;

export const listTrustQuerySchema = paginationQuerySchema.extend({
  subjectType: trustSubjectTypeSchema.optional(),
  subjectId: z.string().uuid().optional(),
  status: attestationStatusSchema.optional(),
});

export const TRUST_KAFKA_TOPICS = {
  ATTESTATION_CREATED: 'gain.trust.attestation.created',
  ATTESTATION_REVOKED: 'gain.trust.attestation.revoked',
  SCORE_COMPUTED: 'gain.trust.score.computed',
  ANCHOR_CREATED: 'gain.trust.anchor.created',
} as const;
