import { z } from 'zod';
import { paginationQuerySchema } from '../identity/schemas.js';

export const TWIN_PERMISSIONS = [
  'twin:create',
  'twin:read',
  'twin:update',
  'twin:delete',
  'twin:publish',
  'twin:attribute:manage',
  'twin:relationship:manage',
  'twin:signal:ingest',
  'twin:insight:read',
  'twin:insight:generate',
  'twin:audit:read',
] as const;

export type TwinPermission = (typeof TWIN_PERMISSIONS)[number];

export const twinPermissionSchema = z.enum(TWIN_PERMISSIONS);

export const twinStatusSchema = z.enum([
  'draft',
  'active',
  'suspended',
  'archived',
]);
export type TwinStatus = z.infer<typeof twinStatusSchema>;

export const twinAssetClassSchema = z.enum([
  'real_estate',
  'private_equity',
  'private_credit',
  'infrastructure',
  'fund',
  'collectible',
  'operating_company',
  'other',
]);
export type TwinAssetClass = z.infer<typeof twinAssetClassSchema>;

export const twinLifecycleStageSchema = z.enum([
  'origination',
  'diligence',
  'under_management',
  'exit',
  'retired',
]);
export type TwinLifecycleStage = z.infer<typeof twinLifecycleStageSchema>;

export const twinAttributeDataTypeSchema = z.enum([
  'string',
  'number',
  'boolean',
  'datetime',
  'json',
  'money',
  'percentage',
]);
export type TwinAttributeDataType = z.infer<typeof twinAttributeDataTypeSchema>;

export const twinRelationshipTypeSchema = z.enum([
  'parent_of',
  'child_of',
  'related_to',
  'collateral_for',
  'owned_by',
  'managed_by',
  'depends_on',
]);
export type TwinRelationshipType = z.infer<typeof twinRelationshipTypeSchema>;

export const twinSignalSeveritySchema = z.enum([
  'info',
  'warning',
  'critical',
]);
export type TwinSignalSeverity = z.infer<typeof twinSignalSeveritySchema>;

export const twinInsightKindSchema = z.enum([
  'summary',
  'risk',
  'valuation_driver',
  'anomaly',
  'recommendation',
]);
export type TwinInsightKind = z.infer<typeof twinInsightKindSchema>;

export const createDigitalTwinSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(2).max(200).trim(),
  slug: z
    .string()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase kebab-case'),
  description: z.string().max(4000).optional(),
  assetClass: twinAssetClassSchema,
  lifecycleStage: twinLifecycleStageSchema.default('origination'),
  externalReference: z.string().max(200).optional(),
  currencyCode: z
    .string()
    .length(3)
    .regex(/^[A-Z]{3}$/, 'ISO 4217 currency code required')
    .default('USD'),
  tags: z.array(z.string().min(1).max(64)).max(50).default([]),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateDigitalTwinInput = z.infer<typeof createDigitalTwinSchema>;

export const updateDigitalTwinSchema = createDigitalTwinSchema
  .omit({ organizationId: true, slug: true })
  .partial()
  .extend({
    status: twinStatusSchema.optional(),
    version: z.number().int().min(1),
  });

export type UpdateDigitalTwinInput = z.infer<typeof updateDigitalTwinSchema>;

export const digitalTwinResponseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  assetClass: twinAssetClassSchema,
  lifecycleStage: twinLifecycleStageSchema,
  status: twinStatusSchema,
  externalReference: z.string().nullable(),
  currencyCode: z.string(),
  tags: z.array(z.string()),
  metadata: z.record(z.unknown()),
  completenessScore: z.number().min(0).max(100),
  publishedAt: z.string().datetime().nullable(),
  version: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});

export type DigitalTwinResponse = z.infer<typeof digitalTwinResponseSchema>;

export const twinListQuerySchema = paginationQuerySchema.and(
  z.object({
    organizationId: z.string().uuid(),
    status: twinStatusSchema.optional(),
    assetClass: twinAssetClassSchema.optional(),
    lifecycleStage: twinLifecycleStageSchema.optional(),
    tag: z.string().max(64).optional(),
  }),
);

export type TwinListQuery = z.infer<typeof twinListQuerySchema>;

export const upsertTwinAttributeSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z][a-z0-9_]*$/, 'Attribute key must be snake_case'),
  label: z.string().min(1).max(200),
  dataType: twinAttributeDataTypeSchema,
  value: z.unknown(),
  unit: z.string().max(32).optional(),
  source: z.string().max(100).optional(),
  confidence: z.number().min(0).max(1).optional(),
  effectiveAt: z.string().datetime().optional(),
});

export type UpsertTwinAttributeInput = z.infer<typeof upsertTwinAttributeSchema>;

export const twinAttributeResponseSchema = z.object({
  id: z.string().uuid(),
  twinId: z.string().uuid(),
  key: z.string(),
  label: z.string(),
  dataType: twinAttributeDataTypeSchema,
  value: z.unknown(),
  unit: z.string().nullable(),
  source: z.string().nullable(),
  confidence: z.number().nullable(),
  effectiveAt: z.string().datetime().nullable(),
  version: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type TwinAttributeResponse = z.infer<typeof twinAttributeResponseSchema>;

export const createTwinRelationshipSchema = z.object({
  fromTwinId: z.string().uuid(),
  toTwinId: z.string().uuid(),
  relationshipType: twinRelationshipTypeSchema,
  label: z.string().max(200).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateTwinRelationshipInput = z.infer<
  typeof createTwinRelationshipSchema
>;

export const twinRelationshipResponseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  fromTwinId: z.string().uuid(),
  toTwinId: z.string().uuid(),
  relationshipType: twinRelationshipTypeSchema,
  label: z.string().nullable(),
  metadata: z.record(z.unknown()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type TwinRelationshipResponse = z.infer<
  typeof twinRelationshipResponseSchema
>;

export const ingestTwinSignalSchema = z.object({
  twinId: z.string().uuid(),
  signalType: z.string().min(1).max(100),
  severity: twinSignalSeveritySchema.default('info'),
  title: z.string().min(1).max(300),
  payload: z.record(z.unknown()),
  observedAt: z.string().datetime().optional(),
  source: z.string().max(100).optional(),
});

export type IngestTwinSignalInput = z.infer<typeof ingestTwinSignalSchema>;

export const twinSignalResponseSchema = z.object({
  id: z.string().uuid(),
  twinId: z.string().uuid(),
  signalType: z.string(),
  severity: twinSignalSeveritySchema,
  title: z.string(),
  payload: z.record(z.unknown()),
  source: z.string().nullable(),
  observedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});

export type TwinSignalResponse = z.infer<typeof twinSignalResponseSchema>;

export const twinInsightResponseSchema = z.object({
  id: z.string().uuid(),
  twinId: z.string().uuid(),
  kind: twinInsightKindSchema,
  title: z.string(),
  summary: z.string(),
  confidence: z.number().min(0).max(1),
  model: z.string().nullable(),
  evidence: z.record(z.unknown()),
  generatedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});

export type TwinInsightResponse = z.infer<typeof twinInsightResponseSchema>;

export const generateTwinInsightSchema = z.object({
  twinId: z.string().uuid(),
  kind: twinInsightKindSchema.default('summary'),
  promptContext: z.string().max(4000).optional(),
});

export type GenerateTwinInsightInput = z.infer<typeof generateTwinInsightSchema>;

export const TWIN_KAFKA_TOPICS = {
  TWIN_CREATED: 'gain.twin.created',
  TWIN_UPDATED: 'gain.twin.updated',
  TWIN_PUBLISHED: 'gain.twin.published',
  TWIN_DELETED: 'gain.twin.deleted',
  TWIN_ATTRIBUTE_UPSERTED: 'gain.twin.attribute.upserted',
  TWIN_RELATIONSHIP_CREATED: 'gain.twin.relationship.created',
  TWIN_SIGNAL_INGESTED: 'gain.twin.signal.ingested',
  TWIN_INSIGHT_GENERATED: 'gain.twin.insight.generated',
} as const;

export type TwinKafkaTopic =
  (typeof TWIN_KAFKA_TOPICS)[keyof typeof TWIN_KAFKA_TOPICS];
