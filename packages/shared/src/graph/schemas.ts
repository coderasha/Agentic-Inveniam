import { z } from 'zod';
import { paginationQuerySchema } from '../identity/schemas.js';

export const GRAPH_PERMISSIONS = [
  'graph:node:create',
  'graph:node:read',
  'graph:node:update',
  'graph:node:delete',
  'graph:edge:create',
  'graph:edge:read',
  'graph:edge:delete',
  'graph:sync',
  'graph:traverse',
] as const;

export type GraphPermission = (typeof GRAPH_PERMISSIONS)[number];

export const graphNodeKindSchema = z.enum([
  'twin',
  'document',
  'asset',
  'organization',
  'user',
  'workflow',
  'claim',
  'external',
  'custom',
]);
export type GraphNodeKind = z.infer<typeof graphNodeKindSchema>;

export const graphEdgeSourceSchema = z.enum([
  'manual',
  'twin_relationship',
  'document_link',
  'asset_twin',
  'inferred',
]);
export type GraphEdgeSource = z.infer<typeof graphEdgeSourceSchema>;

export const createGraphNodeSchema = z.object({
  organizationId: z.string().uuid(),
  kind: graphNodeKindSchema,
  label: z.string().min(1).max(300).trim(),
  externalId: z.string().uuid().optional(),
  properties: z.record(z.unknown()).default({}),
  sourceSystem: z.string().min(1).max(100).default('manual'),
});
export type CreateGraphNodeInput = z.infer<typeof createGraphNodeSchema>;

export const updateGraphNodeSchema = z.object({
  label: z.string().min(1).max(300).trim().optional(),
  properties: z.record(z.unknown()).optional(),
  version: z.number().int().min(1),
});
export type UpdateGraphNodeInput = z.infer<typeof updateGraphNodeSchema>;

export const createGraphEdgeSchema = z.object({
  organizationId: z.string().uuid(),
  fromNodeId: z.string().uuid(),
  toNodeId: z.string().uuid(),
  relationshipType: z.string().min(1).max(100).trim(),
  label: z.string().max(200).optional(),
  weight: z.number().min(0).max(1).optional(),
  properties: z.record(z.unknown()).default({}),
});
export type CreateGraphEdgeInput = z.infer<typeof createGraphEdgeSchema>;

export const graphNodeResponseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  kind: graphNodeKindSchema,
  label: z.string(),
  externalId: z.string().uuid().nullable(),
  properties: z.record(z.unknown()),
  sourceSystem: z.string(),
  version: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const graphEdgeResponseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  fromNodeId: z.string().uuid(),
  toNodeId: z.string().uuid(),
  relationshipType: z.string(),
  label: z.string().nullable(),
  weight: z.number().nullable(),
  properties: z.record(z.unknown()),
  source: graphEdgeSourceSchema,
  sourceRef: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const listGraphNodesQuerySchema = paginationQuerySchema.extend({
  kind: graphNodeKindSchema.optional(),
  q: z.string().max(200).optional(),
});

export const neighborhoodQuerySchema = z.object({
  nodeId: z.string().uuid(),
  depth: z.coerce.number().int().min(1).max(5).default(2),
  direction: z.enum(['out', 'in', 'both']).default('both'),
});

export const GRAPH_KAFKA_TOPICS = {
  NODE_CREATED: 'gain.graph.node.created',
  NODE_UPDATED: 'gain.graph.node.updated',
  EDGE_CREATED: 'gain.graph.edge.created',
  EDGE_DELETED: 'gain.graph.edge.deleted',
  SYNC_COMPLETED: 'gain.graph.sync.completed',
} as const;
