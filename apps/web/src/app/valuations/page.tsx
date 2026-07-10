'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
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

export default function ValuationsPage() {
  const organizationId = useIdentityStore((s) => s.organizationId);
  const qc = useQueryClient();
  const [name, setName] = useState('Income Cap Rate');
  const [slug, setSlug] = useState('income-cap-rate');
  const [methodology, setMethodology] = useState('income');
  const [modelId, setModelId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [noi, setNoi] = useState('1000000');
  const [capRate, setCapRate] = useState('0.05');

  const modelsQuery = useQuery({
    queryKey: ['valuation-models', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => platformApi.listValuationModels(organizationId!),
  });

  const runsQuery = useQuery({
    queryKey: ['valuation-runs', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => platformApi.listValuationRuns(organizationId!),
  });

  const createModelMutation = useMutation({
    mutationFn: () =>
      platformApi.createValuationModel(organizationId!, {
        name,
        slug,
        methodology,
        parameters: {},
      }),
    onSuccess: async (model) => {
      setModelId(String(model.id));
      await qc.invalidateQueries({ queryKey: ['valuation-models', organizationId] });
    },
  });

  const runMutation = useMutation({
    mutationFn: () =>
      platformApi.createValuationRun(organizationId!, {
        modelId,
        subjectType: 'custom',
        subjectId: subjectId || '00000000-0000-4000-8000-000000000001',
        asOfDate: new Date().toISOString().slice(0, 10),
        currencyCode: 'USD',
        inputs: {
          noi: Number(noi),
          capRate: Number(capRate),
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['valuation-runs', organizationId] });
    },
  });

  if (!organizationId) {
    return (
      <div>
        <PageHeader
          title="Continuous Valuation"
          description="Reusable valuation models with deterministic engines (income, DCF, comps, NAV, cost, hybrid)."
        />
        <EmptyState
          title="Select an organization"
          description="Valuation models and runs are organization-scoped."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Continuous Valuation"
        description="Models are re-runnable. Runs execute synchronously in-process today — no external market-data feeds or async workers yet."
      />

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-md border border-[var(--gain-border)] p-4 space-y-3">
          <div className="font-medium">Create model</div>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="slug" />
          <Input
            value={methodology}
            onChange={(e) => setMethodology(e.target.value)}
            placeholder="methodology (income, dcf, market_comps…)"
          />
          <Button
            disabled={!name || !slug || createModelMutation.isPending}
            onClick={() => createModelMutation.mutate()}
          >
            Create model
          </Button>
        </div>
        <div className="rounded-md border border-[var(--gain-border)] p-4 space-y-3">
          <div className="font-medium">Run income valuation</div>
          <Input value={modelId} onChange={(e) => setModelId(e.target.value)} placeholder="Model UUID" />
          <Input value={subjectId} onChange={(e) => setSubjectId(e.target.value)} placeholder="Subject UUID (optional)" />
          <Input value={noi} onChange={(e) => setNoi(e.target.value)} placeholder="NOI" />
          <Input value={capRate} onChange={(e) => setCapRate(e.target.value)} placeholder="Cap rate" />
          <Button
            disabled={!modelId || runMutation.isPending}
            onClick={() => runMutation.mutate()}
          >
            Run valuation
          </Button>
        </div>
      </div>

      {modelsQuery.isLoading || runsQuery.isLoading ? <LoadingState /> : null}
      {modelsQuery.isError || runsQuery.isError ? (
        <ErrorState message="Failed to load valuations." />
      ) : null}

      {modelsQuery.data && modelsQuery.data.items.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">Models</h2>
          <DataTable
            columns={['Name', 'Methodology', 'Status', 'Id']}
            rows={modelsQuery.data.items.map((row) => [
              String(row.name),
              String(row.methodology),
              String(row.status),
              String(row.id).slice(0, 8) + '…',
            ])}
          />
        </div>
      ) : null}

      {runsQuery.data && runsQuery.data.items.length === 0 ? (
        <EmptyState
          title="No valuation runs"
          description="Create an income model, then run it with NOI and cap rate."
        />
      ) : null}

      {runsQuery.data && runsQuery.data.items.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">Runs</h2>
          <DataTable
            columns={['Status', 'Amount (minor)', 'Confidence', 'As of', 'Id']}
            rows={runsQuery.data.items.map((row) => [
              String(row.status),
              row.amountMinor == null ? '—' : String(row.amountMinor),
              row.confidence == null ? '—' : String(row.confidence),
              String(row.asOfDate).slice(0, 10),
              String(row.id).slice(0, 8) + '…',
            ])}
          />
        </div>
      ) : null}
    </div>
  );
}
