import {
  Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@gain/database';
import {
  ANALYTICS_KAFKA_TOPICS,
  type AnalyticsMetricKey,
  type DomainEvent,
} from '@gain/shared';
import { v4 as uuidv4 } from 'uuid';
import { AuthorizationService, CurrentPrincipal, type Principal } from '../common/auth';
import { ConflictError, NotFoundError, ValidationError } from '../common/errors';
import { OutboxService, PrismaService } from '../infrastructure/services';
import {
  deltaMetrics,
  deriveAnalyticsKpis,
  fillDailySeries,
  type OverviewCounts,
  type SeriesPoint,
} from './rollup';

const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

const METRIC_KEYS: AnalyticsMetricKey[] = [
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
];

const SERIES_TABLE: Record<AnalyticsMetricKey, {
  table: string;
  extraWhere?: string;
  softDelete?: boolean;
}> = {
  assets: { table: 'registered_assets', softDelete: true },
  documents: { table: 'documents', softDelete: true },
  portfolios: { table: 'portfolios', softDelete: true },
  investors: { table: 'investors', softDelete: true },
  marketplace_listings: { table: 'marketplace_listings' },
  marketplace_trades: { table: 'marketplace_trades' },
  compliance_checks: { table: 'compliance_checks' },
  compliance_findings_open: {
    table: 'compliance_findings',
    extraWhere: `AND status = 'open'`,
  },
  trust_scores: { table: 'trust_scores' },
  valuation_runs: { table: 'valuation_runs' },
  ai_agents: { table: 'ai_agents', softDelete: true },
  ai_agent_runs: { table: 'ai_agent_runs' },
  ai_marketplace_installs: { table: 'ai_marketplace_installs' },
  workflows: { table: 'workflow_definitions', softDelete: true },
  provenance_records: { table: 'provenance_records' },
  graph_nodes: { table: 'graph_nodes', softDelete: true },
};

function parseMetrics(raw: unknown): AnalyticsMetricKey[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ValidationError('metrics must be a non-empty array');
  }
  return raw.map((item, index) => {
    if (typeof item !== 'string' || !METRIC_KEYS.includes(item as AnalyticsMetricKey)) {
      throw new ValidationError(`metrics[${index}] is not a supported metric key`);
    }
    return item as AnalyticsMetricKey;
  });
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly db: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  private orgId(p: Principal): string {
    if (!p.organizationId) throw new ValidationError('x-organization-id is required');
    return p.organizationId;
  }

  private async emit(
    p: Principal,
    topic: string,
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const event: DomainEvent = {
      eventId: uuidv4(),
      eventType,
      aggregateType,
      aggregateId,
      occurredAt: new Date().toISOString(),
      correlationId: p.correlationId,
      actorUserId: p.userId,
      organizationId: this.orgId(p),
      payload,
      metadata: {},
    };
    await this.outbox.enqueue(event, topic);
  }

  async collectOverview(organizationId: string): Promise<{
    metrics: OverviewCounts;
    derived: ReturnType<typeof deriveAnalyticsKpis>;
    capturedAt: string;
  }> {
    const [
      assets,
      documents,
      portfolios,
      investors,
      marketplaceListings,
      marketplaceTrades,
      complianceChecks,
      complianceChecksPassed,
      complianceChecksFailed,
      complianceFindingsOpen,
      trustScores,
      valuationRuns,
      valuationRunsCompleted,
      aiAgents,
      aiAgentRuns,
      aiAgentRunsCompleted,
      aiMarketplaceInstalls,
      workflows,
      provenanceRecords,
      graphNodes,
    ] = await Promise.all([
      this.db.registeredAsset.count({ where: { organizationId, deletedAt: null } }),
      this.db.document.count({ where: { organizationId, deletedAt: null } }),
      this.db.portfolio.count({ where: { organizationId, deletedAt: null } }),
      this.db.investor.count({ where: { organizationId, deletedAt: null } }),
      this.db.marketplaceListing.count({ where: { organizationId } }),
      this.db.marketplaceTrade.count({ where: { organizationId } }),
      this.db.complianceCheck.count({ where: { organizationId } }),
      this.db.complianceCheck.count({ where: { organizationId, status: 'passed' } }),
      this.db.complianceCheck.count({ where: { organizationId, status: 'failed' } }),
      this.db.complianceFinding.count({ where: { organizationId, status: 'open' } }),
      this.db.trustScore.count({ where: { organizationId } }),
      this.db.valuationRun.count({ where: { organizationId } }),
      this.db.valuationRun.count({ where: { organizationId, status: 'completed' } }),
      this.db.aiAgent.count({ where: { organizationId, deletedAt: null } }),
      this.db.aiAgentRun.count({ where: { organizationId } }),
      this.db.aiAgentRun.count({ where: { organizationId, status: 'completed' } }),
      this.db.aiMarketplaceInstall.count({ where: { organizationId } }),
      this.db.workflowDefinition.count({ where: { organizationId, deletedAt: null } }),
      this.db.provenanceRecord.count({ where: { organizationId } }),
      this.db.graphNode.count({ where: { organizationId, deletedAt: null } }),
    ]);

    const metrics: OverviewCounts = {
      assets,
      documents,
      portfolios,
      investors,
      marketplaceListings,
      marketplaceTrades,
      complianceChecks,
      complianceChecksPassed,
      complianceChecksFailed,
      complianceFindingsOpen,
      trustScores,
      valuationRuns,
      valuationRunsCompleted,
      aiAgents,
      aiAgentRuns,
      aiAgentRunsCompleted,
      aiMarketplaceInstalls,
      workflows,
      provenanceRecords,
      graphNodes,
    };

    return {
      metrics,
      derived: deriveAnalyticsKpis(metrics),
      capturedAt: new Date().toISOString(),
    };
  }

  async overview(p: Principal) {
    return this.collectOverview(this.orgId(p));
  }

  async series(p: Principal, query: Record<string, string | undefined>) {
    const metric = query.metric as AnalyticsMetricKey | undefined;
    if (!metric || !METRIC_KEYS.includes(metric)) {
      throw new ValidationError(`metric must be one of: ${METRIC_KEYS.join(', ')}`);
    }
    if (!query.from || !query.to) {
      throw new ValidationError('from and to (ISO datetimes) are required');
    }
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
      throw new ValidationError('from/to must be valid ISO datetimes with to > from');
    }
    const maxDays = 93;
    const daySpan = (to.getTime() - from.getTime()) / 86_400_000;
    if (daySpan > maxDays) {
      throw new ValidationError(`series window cannot exceed ${maxDays} days`);
    }

    const cfg = SERIES_TABLE[metric];
    const soft = cfg.softDelete ? 'AND deleted_at IS NULL' : '';
    const extra = cfg.extraWhere ?? '';
    const rows = await this.db.$queryRawUnsafe<Array<{ day: string; count: number }>>(
      `
      SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS count
      FROM ${cfg.table}
      WHERE organization_id = $1::uuid
        AND created_at >= $2::timestamptz
        AND created_at < $3::timestamptz
        ${soft}
        ${extra}
      GROUP BY 1
      ORDER BY 1
      `,
      this.orgId(p),
      from.toISOString(),
      to.toISOString(),
    );

    const points: SeriesPoint[] = rows.map((row) => ({
      day: row.day,
      count: Number(row.count),
    }));

    return {
      metric,
      from: from.toISOString(),
      to: to.toISOString(),
      granularity: 'day',
      points: fillDailySeries(points, from.toISOString(), to.toISOString()),
    };
  }

  async createSnapshot(input: Record<string, unknown>, p: Principal) {
    const overview = await this.collectOverview(this.orgId(p));
    const snapshot = await this.db.analyticsSnapshot.create({
      data: {
        organizationId: this.orgId(p),
        label: typeof input.label === 'string' ? input.label : 'Overview snapshot',
        notes: input.notes as string | undefined,
        capturedAt: new Date(overview.capturedAt),
        metrics: json(overview.metrics),
        derived: json(overview.derived),
        createdByUserId: p.userId,
      },
    });
    await this.emit(
      p, ANALYTICS_KAFKA_TOPICS.SNAPSHOT_CREATED, 'analytics.snapshot.created',
      'analytics_snapshot', snapshot.id, { snapshotId: snapshot.id },
    );
    return snapshot;
  }

  async listSnapshots(p: Principal, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.AnalyticsSnapshotWhereInput = {
      organizationId: this.orgId(p),
    };
    const [items, total] = await this.db.$transaction([
      this.db.analyticsSnapshot.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { capturedAt: 'desc' },
      }),
      this.db.analyticsSnapshot.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getSnapshot(id: string, p: Principal) {
    const snapshot = await this.db.analyticsSnapshot.findFirst({
      where: { id, organizationId: this.orgId(p) },
    });
    if (!snapshot) throw new NotFoundError('AnalyticsSnapshot', id);
    return snapshot;
  }

  async compareSnapshots(currentId: string, previousId: string, p: Principal) {
    const [current, previous] = await Promise.all([
      this.getSnapshot(currentId, p),
      this.getSnapshot(previousId, p),
    ]);
    const currentMetrics = current.metrics as Record<string, number>;
    const previousMetrics = previous.metrics as Record<string, number>;
    return {
      current,
      previous,
      delta: deltaMetrics(currentMetrics, previousMetrics),
    };
  }

  async createReport(input: Record<string, unknown>, p: Principal) {
    if (typeof input.name !== 'string' || typeof input.slug !== 'string') {
      throw new ValidationError('name and slug are required');
    }
    const metrics = parseMetrics(input.metrics);
    const report = await this.db.analyticsReport.create({
      data: {
        organizationId: this.orgId(p),
        name: input.name,
        slug: input.slug,
        description: input.description as string | undefined,
        status: 'active',
        metrics: json(metrics),
        filters: json(input.filters ?? {}),
        createdByUserId: p.userId,
      },
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('Analytics report slug already exists');
      }
      throw error;
    });
    await this.emit(
      p, ANALYTICS_KAFKA_TOPICS.REPORT_CREATED, 'analytics.report.created',
      'analytics_report', report.id, { reportId: report.id, slug: report.slug },
    );
    return report;
  }

  async listReports(p: Principal, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.AnalyticsReportWhereInput = {
      organizationId: this.orgId(p),
      deletedAt: null,
      status: query.status as never,
    };
    const [items, total] = await this.db.$transaction([
      this.db.analyticsReport.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { updatedAt: 'desc' },
      }),
      this.db.analyticsReport.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getReport(id: string, p: Principal) {
    const report = await this.db.analyticsReport.findFirst({
      where: { id, organizationId: this.orgId(p), deletedAt: null },
    });
    if (!report) throw new NotFoundError('AnalyticsReport', id);
    return report;
  }

  async updateReport(id: string, input: Record<string, unknown>, p: Principal) {
    await this.getReport(id, p);
    const version = Number(input.version);
    if (!Number.isInteger(version)) throw new ValidationError('version is required');
    const data: Prisma.AnalyticsReportUpdateManyMutationInput = {
      version: { increment: 1 },
    };
    if (typeof input.name === 'string') data.name = input.name;
    if (typeof input.description === 'string' || input.description === null) {
      data.description = input.description as string | null;
    }
    if (typeof input.status === 'string') data.status = input.status as never;
    if ('metrics' in input) data.metrics = json(parseMetrics(input.metrics));
    if ('filters' in input) data.filters = json(input.filters ?? {});
    const result = await this.db.analyticsReport.updateMany({
      where: { id, organizationId: this.orgId(p), deletedAt: null, version },
      data,
    });
    if (result.count === 0) throw new ConflictError('Analytics report version is stale');
    const report = await this.getReport(id, p);
    await this.emit(
      p, ANALYTICS_KAFKA_TOPICS.REPORT_UPDATED, 'analytics.report.updated',
      'analytics_report', id, { reportId: id },
    );
    return report;
  }

  async deleteReport(id: string, p: Principal) {
    await this.getReport(id, p);
    await this.db.analyticsReport.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'archived' },
    });
    await this.emit(
      p, ANALYTICS_KAFKA_TOPICS.REPORT_DELETED, 'analytics.report.deleted',
      'analytics_report', id, { reportId: id },
    );
    return { id, deleted: true };
  }

  async runReport(id: string, p: Principal) {
    const report = await this.getReport(id, p);
    const overview = await this.collectOverview(this.orgId(p));
    const keys = parseMetrics(report.metrics);
    const selected: Record<string, number> = {};
    for (const key of keys) {
      const camel = metricToCamel(key);
      selected[key] = overview.metrics[camel];
    }
    return {
      report,
      capturedAt: overview.capturedAt,
      metrics: selected,
      derived: overview.derived,
    };
  }
}

function metricToCamel(key: AnalyticsMetricKey): keyof OverviewCounts {
  const map: Record<AnalyticsMetricKey, keyof OverviewCounts> = {
    assets: 'assets',
    documents: 'documents',
    portfolios: 'portfolios',
    investors: 'investors',
    marketplace_listings: 'marketplaceListings',
    marketplace_trades: 'marketplaceTrades',
    compliance_checks: 'complianceChecks',
    compliance_findings_open: 'complianceFindingsOpen',
    trust_scores: 'trustScores',
    valuation_runs: 'valuationRuns',
    ai_agents: 'aiAgents',
    ai_agent_runs: 'aiAgentRuns',
    ai_marketplace_installs: 'aiMarketplaceInstalls',
    workflows: 'workflows',
    provenance_records: 'provenanceRecords',
    graph_nodes: 'graphNodes',
  };
  return map[key];
}

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller({ path: 'analytics', version: '1' })
export class AnalyticsController {
  constructor(
    private readonly service: AnalyticsService,
    private readonly auth: AuthorizationService,
  ) {}

  @Get('overview')
  overview(@CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'analytics:overview:read');
    return this.service.overview(p);
  }

  @Get('series')
  series(
    @Query() query: Record<string, string | undefined>,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'analytics:series:read');
    return this.service.series(p, query);
  }

  @Post('snapshots')
  createSnapshot(@Body() body: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'analytics:snapshot:create');
    return this.service.createSnapshot(body, p);
  }

  @Get('snapshots')
  listSnapshots(
    @Query() query: Record<string, string | undefined>,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'analytics:snapshot:read');
    return this.service.listSnapshots(p, query);
  }

  @Get('snapshots/:id')
  getSnapshot(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'analytics:snapshot:read');
    return this.service.getSnapshot(id, p);
  }

  @Get('snapshots/:currentId/compare/:previousId')
  compareSnapshots(
    @Param('currentId') currentId: string,
    @Param('previousId') previousId: string,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'analytics:snapshot:read');
    return this.service.compareSnapshots(currentId, previousId, p);
  }

  @Post('reports')
  createReport(@Body() body: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'analytics:report:create');
    return this.service.createReport(body, p);
  }

  @Get('reports')
  listReports(
    @Query() query: Record<string, string | undefined>,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'analytics:report:read');
    return this.service.listReports(p, query);
  }

  @Get('reports/:id')
  getReport(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'analytics:report:read');
    return this.service.getReport(id, p);
  }

  @Patch('reports/:id')
  updateReport(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'analytics:report:update');
    return this.service.updateReport(id, body, p);
  }

  @Delete('reports/:id')
  deleteReport(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'analytics:report:delete');
    return this.service.deleteReport(id, p);
  }

  @Post('reports/:id/run')
  runReport(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'analytics:report:read');
    return this.service.runReport(id, p);
  }
}

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
