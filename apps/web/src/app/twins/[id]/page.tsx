'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { twinApi } from '@/lib/twin-api';
import { useIdentityStore } from '@/stores/identity-store';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/components/ui/states';
import { Button } from '@/components/ui/button';

export default function TwinDetailPage() {
  const params = useParams<{ id: string }>();
  const twinId = params.id;
  const organizationId = useIdentityStore((s) => s.organizationId);
  const queryClient = useQueryClient();

  const twinQuery = useQuery({
    queryKey: ['twin', organizationId, twinId],
    enabled: Boolean(organizationId && twinId),
    queryFn: () => twinApi.get(organizationId!, twinId),
  });

  const attrsQuery = useQuery({
    queryKey: ['twin-attrs', organizationId, twinId],
    enabled: Boolean(organizationId && twinId),
    queryFn: () => twinApi.listAttributes(organizationId!, twinId),
  });

  const insightsQuery = useQuery({
    queryKey: ['twin-insights', organizationId, twinId],
    enabled: Boolean(organizationId && twinId),
    queryFn: () => twinApi.listInsights(organizationId!, twinId),
  });

  const publishMutation = useMutation({
    mutationFn: () => twinApi.publish(organizationId!, twinId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['twin', organizationId, twinId] });
    },
  });

  const insightMutation = useMutation({
    mutationFn: () => twinApi.generateInsight(organizationId!, twinId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['twin-insights', organizationId, twinId],
      });
    },
  });

  if (!organizationId) {
    return (
      <EmptyState
        title="Select an organization"
        description="Organization context is required to view a twin."
      />
    );
  }

  if (twinQuery.isLoading) return <LoadingState label="Loading twin…" />;
  if (twinQuery.isError) {
    return (
      <ErrorState
        message={
          twinQuery.error instanceof Error
            ? twinQuery.error.message
            : 'Failed to load twin'
        }
        onRetry={() => twinQuery.refetch()}
      />
    );
  }

  const twin = twinQuery.data!;

  return (
    <div>
      <PageHeader
        title={twin.name}
        description={`${twin.assetClass.replaceAll('_', ' ')} · ${twin.lifecycleStage.replaceAll('_', ' ')}`}
        action={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => insightMutation.mutate()}
              disabled={insightMutation.isPending}
            >
              Generate insight
            </Button>
            <Button
              onClick={() => publishMutation.mutate()}
              disabled={publishMutation.isPending || twin.status === 'active'}
            >
              {twin.status === 'active' ? 'Published' : 'Publish'}
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <div className="rounded-lg border border-[var(--gain-border)] bg-[rgba(18,26,43,0.7)] p-4">
          <div className="text-xs text-[var(--gain-text-muted)]">Status</div>
          <div className="mt-1 capitalize">{twin.status}</div>
        </div>
        <div className="rounded-lg border border-[var(--gain-border)] bg-[rgba(18,26,43,0.7)] p-4">
          <div className="text-xs text-[var(--gain-text-muted)]">Completeness</div>
          <div className="mt-1">{Math.round(twin.completenessScore)}%</div>
        </div>
        <div className="rounded-lg border border-[var(--gain-border)] bg-[rgba(18,26,43,0.7)] p-4">
          <div className="text-xs text-[var(--gain-text-muted)]">Currency</div>
          <div className="mt-1">{twin.currencyCode}</div>
        </div>
      </div>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-3">Attributes</h2>
        {attrsQuery.isLoading ? <LoadingState label="Loading attributes…" /> : null}
        {attrsQuery.data && Array.isArray(attrsQuery.data) && attrsQuery.data.length === 0 ? (
          <EmptyState
            title="No attributes yet"
            description="Add structured facts to improve twin completeness and insights."
          />
        ) : null}
        {attrsQuery.data && Array.isArray(attrsQuery.data) && attrsQuery.data.length > 0 ? (
          <ul className="space-y-2">
            {(attrsQuery.data as Array<{ id: string; key: string; label: string; value: unknown }>).map(
              (attr) => (
                <li
                  key={attr.id}
                  className="rounded-md border border-[var(--gain-border)] px-3 py-2 text-sm flex justify-between gap-4"
                >
                  <span>
                    <span className="font-medium">{attr.label}</span>
                    <span className="text-[var(--gain-text-muted)]"> · {attr.key}</span>
                  </span>
                  <code className="text-xs">{JSON.stringify(attr.value)}</code>
                </li>
              ),
            )}
          </ul>
        ) : null}
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">AI insights</h2>
        {insightsQuery.isLoading ? <LoadingState label="Loading insights…" /> : null}
        {insightsQuery.data &&
        Array.isArray(insightsQuery.data) &&
        insightsQuery.data.length === 0 ? (
          <EmptyState
            title="No insights yet"
            description="Generate a deterministic risk/summary insight from current twin state."
          />
        ) : null}
        {insightsQuery.data &&
        Array.isArray(insightsQuery.data) &&
        insightsQuery.data.length > 0 ? (
          <ul className="space-y-3">
            {(
              insightsQuery.data as Array<{
                id: string;
                kind: string;
                title: string;
                summary: string;
                confidence: number;
              }>
            ).map((insight) => (
              <li
                key={insight.id}
                className="rounded-lg border border-[var(--gain-border)] bg-[rgba(18,26,43,0.7)] p-4"
              >
                <div className="text-xs uppercase tracking-wide text-[var(--gain-text-muted)]">
                  {insight.kind} · {(insight.confidence * 100).toFixed(0)}% confidence
                </div>
                <div className="mt-1 font-medium">{insight.title}</div>
                <p className="mt-2 text-sm text-[var(--gain-text-muted)]">{insight.summary}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
