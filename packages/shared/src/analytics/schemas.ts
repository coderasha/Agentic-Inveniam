import { z } from 'zod';
import { paginationQuerySchema } from '../identity/schemas.js';

export const ANALYTICS_PERMISSIONS = [
  'analytics:overview:read',
  'analytics:series:read',
  'analytics:snapshot:create',
  'analytics:snapshot:read',
  'analytics:report:create',
  'analytics:report:read',
  'analytics:report:update',
  'analytics:report:delete',
] as const;

export type AnalyticsPermission = (typeof ANALYTICS_PERMISSIONS)[number];

export const analyticsMetricKeySchema = z.enum([
  'assets',
  'documents',
  'portfolios',
  'investors',
  'marketplace_listings',
  'marketplace_trades',
  'compliance_checks',
  'compliance_findings_open',
  'trust_scores',
  'valuation_runs',
  'ai_agents',
  'ai_agent_runs',
  'ai_marketplace_installs',
  'workflows',
  'provenance_records',
  'graph_nodes',
]);
export type AnalyticsMetricKey = z.infer<typeof analyticsMetricKeySchema>;

export const analyticsReportStatusSchema = z.enum(['active', 'archived']);
export type AnalyticsReportStatus = z.infer<typeof analyticsReportStatusSchema>;

export const analyticsOverviewQuerySchema = z.object({
  organizationId: z.string().uuid(),
});

export const analyticsSeriesQuerySchema = z.object({
  organizationId: z.string().uuid(),
  metric: analyticsMetricKeySchema,
  from: z.string().datetime(),
  to: z.string().datetime(),
  granularity: z.enum(['day']).default('day'),
});
export type AnalyticsSeriesQuery = z.infer<typeof analyticsSeriesQuerySchema>;

export const createAnalyticsSnapshotSchema = z.object({
  organizationId: z.string().uuid(),
  label: z.string().min(1).max(200).trim().default('Overview snapshot'),
  notes: z.string().max(2000).optional(),
});
export type CreateAnalyticsSnapshotInput = z.infer<typeof createAnalyticsSnapshotSchema>;

export const createAnalyticsReportSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(200).trim(),
  slug: z
    .string()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().max(2000).optional(),
  metrics: z.array(analyticsMetricKeySchema).min(1).max(20),
  filters: z.record(z.unknown()).default({}),
});
export type CreateAnalyticsReportInput = z.infer<typeof createAnalyticsReportSchema>;

export const listAnalyticsQuerySchema = paginationQuerySchema.extend({
  status: analyticsReportStatusSchema.optional(),
});

export const ANALYTICS_KAFKA_TOPICS = {
  SNAPSHOT_CREATED: 'gain.analytics.snapshot.created',
  REPORT_CREATED: 'gain.analytics.report.created',
  REPORT_UPDATED: 'gain.analytics.report.updated',
  REPORT_DELETED: 'gain.analytics.report.deleted',
} as const;
