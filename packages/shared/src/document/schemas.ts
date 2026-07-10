import { z } from 'zod';
import { paginationQuerySchema } from '../identity/schemas.js';

export const DOCUMENT_PERMISSIONS = [
  'document:create',
  'document:read',
  'document:update',
  'document:delete',
  'document:download',
  'document:version:manage',
  'document:link:manage',
  'document:audit:read',
] as const;

export type DocumentPermission = (typeof DOCUMENT_PERMISSIONS)[number];

export const documentStatusSchema = z.enum([
  'draft',
  'uploaded',
  'processing',
  'ready',
  'quarantined',
  'archived',
]);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;

export const documentScanStatusSchema = z.enum([
  'pending',
  'clean',
  'infected',
  'skipped',
]);
export type DocumentScanStatus = z.infer<typeof documentScanStatusSchema>;

export const documentSensitivitySchema = z.enum([
  'public',
  'internal',
  'confidential',
  'restricted',
]);
export type DocumentSensitivity = z.infer<typeof documentSensitivitySchema>;

export const documentLinkTargetTypeSchema = z.enum([
  'organization',
  'twin',
  'asset',
  'user',
  'workflow',
]);
export type DocumentLinkTargetType = z.infer<typeof documentLinkTargetTypeSchema>;

export const createDocumentSchema = z.object({
  organizationId: z.string().uuid(),
  title: z.string().min(1).max(300).trim(),
  description: z.string().max(4000).optional(),
  category: z.string().min(1).max(100).default('general'),
  sensitivity: documentSensitivitySchema.default('internal'),
  tags: z.array(z.string().min(1).max(64)).max(50).default([]),
  mimeType: z.string().min(3).max(200),
  fileName: z.string().min(1).max(500),
  byteSize: z.number().int().positive().max(5 * 1024 * 1024 * 1024),
  checksumSha256: z
    .string()
    .length(64)
    .regex(/^[a-f0-9]{64}$/, 'SHA-256 hex digest required'),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

export const updateDocumentSchema = z.object({
  title: z.string().min(1).max(300).trim().optional(),
  description: z.string().max(4000).optional().nullable(),
  category: z.string().min(1).max(100).optional(),
  sensitivity: documentSensitivitySchema.optional(),
  tags: z.array(z.string().min(1).max(64)).max(50).optional(),
  status: documentStatusSchema.optional(),
  version: z.number().int().min(1),
});

export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;

export const documentResponseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  category: z.string(),
  sensitivity: documentSensitivitySchema,
  status: documentStatusSchema,
  scanStatus: documentScanStatusSchema,
  tags: z.array(z.string()),
  mimeType: z.string(),
  fileName: z.string(),
  byteSize: z.number().int(),
  checksumSha256: z.string(),
  storageKey: z.string(),
  currentVersion: z.number().int(),
  metadata: z.record(z.unknown()),
  version: z.number().int(),
  createdByUserId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});

export type DocumentResponse = z.infer<typeof documentResponseSchema>;

export const documentListQuerySchema = paginationQuerySchema.and(
  z.object({
    organizationId: z.string().uuid(),
    status: documentStatusSchema.optional(),
    category: z.string().optional(),
    sensitivity: documentSensitivitySchema.optional(),
    tag: z.string().optional(),
  }),
);

export const createDocumentVersionSchema = z.object({
  fileName: z.string().min(1).max(500),
  mimeType: z.string().min(3).max(200),
  byteSize: z.number().int().positive().max(5 * 1024 * 1024 * 1024),
  checksumSha256: z
    .string()
    .length(64)
    .regex(/^[a-f0-9]{64}$/),
  changeSummary: z.string().max(1000).optional(),
});

export type CreateDocumentVersionInput = z.infer<
  typeof createDocumentVersionSchema
>;

export const documentVersionResponseSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  versionNumber: z.number().int(),
  fileName: z.string(),
  mimeType: z.string(),
  byteSize: z.number().int(),
  checksumSha256: z.string(),
  storageKey: z.string(),
  changeSummary: z.string().nullable(),
  createdByUserId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});

export type DocumentVersionResponse = z.infer<
  typeof documentVersionResponseSchema
>;

export const createDocumentLinkSchema = z.object({
  targetType: documentLinkTargetTypeSchema,
  targetId: z.string().uuid(),
  relationship: z.string().min(1).max(100).default('attached_to'),
});

export type CreateDocumentLinkInput = z.infer<typeof createDocumentLinkSchema>;

export const documentLinkResponseSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  organizationId: z.string().uuid(),
  targetType: documentLinkTargetTypeSchema,
  targetId: z.string().uuid(),
  relationship: z.string(),
  createdAt: z.string().datetime(),
});

export type DocumentLinkResponse = z.infer<typeof documentLinkResponseSchema>;

export const documentUploadSessionResponseSchema = z.object({
  documentId: z.string().uuid(),
  uploadUrl: z.string().url(),
  storageKey: z.string(),
  expiresAt: z.string().datetime(),
  headers: z.record(z.string()),
});

export type DocumentUploadSessionResponse = z.infer<
  typeof documentUploadSessionResponseSchema
>;

export const DOCUMENT_KAFKA_TOPICS = {
  DOCUMENT_CREATED: 'gain.document.created',
  DOCUMENT_UPDATED: 'gain.document.updated',
  DOCUMENT_UPLOADED: 'gain.document.uploaded',
  DOCUMENT_VERSIONED: 'gain.document.versioned',
  DOCUMENT_DELETED: 'gain.document.deleted',
  DOCUMENT_LINKED: 'gain.document.linked',
} as const;
