import { z } from 'zod';
import { paginationQuerySchema } from '../identity/schemas.js';

export const PROVENANCE_PERMISSIONS = [
  'provenance:record:create',
  'provenance:record:read',
  'provenance:record:verify',
  'provenance:record:revoke',
  'provenance:link:create',
  'provenance:link:read',
  'provenance:lineage:read',
] as const;

export type ProvenancePermission = (typeof PROVENANCE_PERMISSIONS)[number];

export const provenanceSubjectTypeSchema = z.enum([
  'twin',
  'twin_attribute',
  'document',
  'document_version',
  'asset',
  'asset_valuation',
  'graph_node',
  'graph_edge',
  'claim',
  'custom',
]);
export type ProvenanceSubjectType = z.infer<typeof provenanceSubjectTypeSchema>;

export const provenanceSourceTypeSchema = z.enum([
  'upload',
  'api',
  'sensor',
  'inference',
  'manual',
  'sync',
  'external',
]);
export type ProvenanceSourceType = z.infer<typeof provenanceSourceTypeSchema>;

export const provenanceStatusSchema = z.enum([
  'recorded',
  'verified',
  'disputed',
  'revoked',
]);
export type ProvenanceStatus = z.infer<typeof provenanceStatusSchema>;

export const provenanceLinkRelationSchema = z.enum([
  'derived_from',
  'supersedes',
  'corroborates',
  'contradicts',
  'extracted_from',
  'attests',
]);
export type ProvenanceLinkRelation = z.infer<typeof provenanceLinkRelationSchema>;

export const createProvenanceRecordSchema = z.object({
  organizationId: z.string().uuid(),
  subjectType: provenanceSubjectTypeSchema,
  subjectId: z.string().uuid(),
  sourceType: provenanceSourceTypeSchema.default('manual'),
  sourceRef: z.string().max(500).optional(),
  contentHash: z
    .string()
    .length(64)
    .regex(/^[a-f0-9]{64}$/, 'SHA-256 hex digest required'),
  previousRecordId: z.string().uuid().optional(),
  confidence: z.number().min(0).max(1).optional(),
  capturedAt: z.string().datetime().optional(),
  summary: z.string().max(1000).optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type CreateProvenanceRecordInput = z.infer<typeof createProvenanceRecordSchema>;

export const createProvenanceLinkSchema = z.object({
  organizationId: z.string().uuid(),
  fromRecordId: z.string().uuid(),
  toRecordId: z.string().uuid(),
  relation: provenanceLinkRelationSchema,
  note: z.string().max(1000).optional(),
});
export type CreateProvenanceLinkInput = z.infer<typeof createProvenanceLinkSchema>;

export const listProvenanceQuerySchema = paginationQuerySchema.extend({
  subjectType: provenanceSubjectTypeSchema.optional(),
  subjectId: z.string().uuid().optional(),
  status: provenanceStatusSchema.optional(),
});

export const PROVENANCE_KAFKA_TOPICS = {
  RECORD_CREATED: 'gain.provenance.record.created',
  RECORD_VERIFIED: 'gain.provenance.record.verified',
  RECORD_REVOKED: 'gain.provenance.record.revoked',
  LINK_CREATED: 'gain.provenance.link.created',
} as const;
