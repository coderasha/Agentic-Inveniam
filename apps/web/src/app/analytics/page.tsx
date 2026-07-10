'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { platformApi } from '@/lib/platform-api';
import { useIdentityStore } from '@/stores/identity-store';
import {
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/components/ui/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function AnalyticsPage() {
  const organizationId = useIdentityStore((s) => s.organizationId);
  const qc = useQueryClient();
  const [reportName, setReportName] = useState('Ops pulse');
  const [reportSlug, setReportSlug] = useState('ops-pulse');
  const [reportId, setReportId] = useState('');
  const [metric, setMetric] = useState('assets');
  const range = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - 7 * 86_400_000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, []);

  const overviewQuery = useQuery({
    queryKey: ['analytics-overview', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => platformApi.analyticsOverview(organizationId!),
  });
  const seriesQuery = useQuery({
    queryKey: ['analytics-series', organizationId, metric, range.from, range.to],
    enabled: Boolean(organizationId),
    queryFn: () =>
      platformApi.analyticsSeries(organizationId!, metric, range.from, range.to),
  });
  const snapshotsQuery = useQuery({
    queryKey: ['analytics-snapshots', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => platformApi.listAnalyticsSnapshots(organizationId!),
  });
  const reportsQuery = useQuery({
    queryKey: ['analytics-reports', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => platformApi.listAnalyticsReports(organizationId!),
  });

  const snapshotMutation = useMutation({
    mutationFn: () =>
      platformApi.createAnalyticsSnapshot(organizationId!, {
        label: `Snapshot ${new Date().toISOString().slice(0, 16)}`,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['analytics-snapshots', organizationId] });
    },
  });

  const createReportMutation = useMutation({
    mutationFn: () =>
      platformApi.createAnalyticsReport(organizationId!, {
        name: reportName,
        slug: reportSlug,
        metrics: ['assets', 'documents', 'compliance_checks', 'ai_agent_runs'],
        description: 'Core operating metrics',
      }),
    onSuccess: (report) => {
      setReportId(String(report.id));
      void qc.invalidateQueries({ queryKey: ['analytics-reports', organizationId] });
    },
  });

  const runReportMutation = useMutation({
    mutationFn: () => platformApi.runAnalyticsReport(organizationId!, reportId),
  });

  if (!organizationId) {
    return (
      <div>
        <PageHeader
          title="Analytics"
          description="Org-scoped KPIs, series, snapshots, and saved reports."
        />
        <EmptyState
          title="Select an organization"
          description="Analytics data is organization-scoped."
        />
      </div>
    );
  }

  const metrics = overviewQuery.data?.metrics ?? {};
  const derived = overviewQuery.data?.derived ?? {};

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Live counts across platform domains with derived rates. Not a BI warehouse — no OLAP cubes, scheduled ETL, or cross-tenant benchmarking."
        action={
          <Button
            onClick={() => snapshotMutation.mutate()}
            disabled={snapshotMutation.isPending}
          >
            Capture snapshot
          </Button>
        }
      />

      {overviewQuery.isLoading ? <LoadingState /> : null}
      {overviewQuery.isError ? <ErrorState message="Failed to load overview." /> : null}

      {overviewQuery.data ? (
        <div className="grid md:grid-cols-4 gap-3">
          {Object.entries(metrics).map(([key, value]) => (
            <div
              key={key}
              className="rounded-md border border-[var(--gain-border)] p-3"
            >
              <div className="text-xs uppercase tracking-wide text-[var(--gain-text-muted)]">
                {key}
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
            </div>
          ))}
        </div>
      ) : null}

      {overviewQuery.data ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">Derived KPIs</h2>
          <DataTable
            columns={['KPI', 'Value']}
            rows={Object.entries(derived).map(([key, value]) => [
              key,
              value == null ? '—' : String(value),
            ])}
          />
        </div>
      ) : null}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-md border border-[var(--gain-border)] p-4 space-y-3">
          <div className="font-medium">7-day series</div>
          <Input
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            placeholder="metric key e.g. assets"
          />
          {seriesQuery.isLoading ? <LoadingState /> : null}
          {seriesQuery.isError ? <ErrorState message="Failed to load series." /> : null}
          {seriesQuery.data ? (
            <DataTable
              columns={['Day', 'Count']}
              rows={seriesQuery.data.points.map((point) => [
                point.day,
                String(point.count),
              ])}
            />
          ) : null}
        </div>

        <div className="rounded-md border border-[var(--gain-border)] p-4 space-y-3">
          <div className="font-medium">Saved report</div>
          <Input
            value={reportName}
            onChange={(e) => setReportName(e.target.value)}
            placeholder="Name"
          />
          <Input
            value={reportSlug}
            onChange={(e) => setReportSlug(e.target.value)}
            placeholder="slug"
          />
          <Button
            onClick={() => createReportMutation.mutate()}
            disabled={createReportMutation.isPending}
          >
            Create report
          </Button>
          <Input
            value={reportId}
            onChange={(e) => setReportId(e.target.value)}
            placeholder="Report id"
          />
          <Button
            variant="secondary"
            onClick={() => runReportMutation.mutate()}
            disabled={!reportId || runReportMutation.isPending}
          >
            Run report
          </Button>
          {runReportMutation.data ? (
            <pre className="text-xs overflow-auto max-h-48 bg-[var(--gain-surface)] p-2 rounded">
              {JSON.stringify(runReportMutation.data, null, 2)}
            </pre>
          ) : null}
        </div>
      </div>

      {snapshotsQuery.data && snapshotsQuery.data.items.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">
            Snapshots ({snapshotsQuery.data.total})
          </h2>
          <DataTable
            columns={['Label', 'Captured', 'Id']}
            rows={snapshotsQuery.data.items.map((row) => [
              String(row.label),
              String(row.capturedAt),
              String(row.id).slice(0, 8) + '…',
            ])}
          />
        </div>
      ) : null}

      {reportsQuery.data && reportsQuery.data.items.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">
            Reports ({reportsQuery.data.total})
          </h2>
          <DataTable
            columns={['Name', 'Status', 'Id']}
            rows={reportsQuery.data.items.map((row) => [
              String(row.name),
              String(row.status),
              <button
                key={String(row.id)}
                type="button"
                className="text-[var(--gain-accent)] underline"
                onClick={() => setReportId(String(row.id))}
              >
                {String(row.id).slice(0, 8)}…
              </button>,
            ])}
          />
        </div>
      ) : null}
    </div>
  );
}
