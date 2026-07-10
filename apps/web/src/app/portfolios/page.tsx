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

export default function PortfoliosPage() {
  const organizationId = useIdentityStore((s) => s.organizationId);
  const qc = useQueryClient();
  const [name, setName] = useState('Core Private Assets');
  const [slug, setSlug] = useState('core-private-assets');
  const [portfolioId, setPortfolioId] = useState('');
  const [label, setLabel] = useState('Building A');
  const [subjectId, setSubjectId] = useState('00000000-0000-4000-8000-000000000001');
  const [costBasis, setCostBasis] = useState('1000000');
  const [marketValue, setMarketValue] = useState('1200000');

  const listQuery = useQuery({
    queryKey: ['portfolios', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => platformApi.listPortfolios(organizationId!),
  });

  const detailQuery = useQuery({
    queryKey: ['portfolio', organizationId, portfolioId],
    enabled: Boolean(organizationId && portfolioId),
    queryFn: () => platformApi.getPortfolio(organizationId!, portfolioId),
  });

  const navQuery = useQuery({
    queryKey: ['portfolio-nav', organizationId, portfolioId],
    enabled: Boolean(organizationId && portfolioId),
    queryFn: () => platformApi.getPortfolioNav(organizationId!, portfolioId),
  });

  const snapshotsQuery = useQuery({
    queryKey: ['portfolio-snapshots', organizationId, portfolioId],
    enabled: Boolean(organizationId && portfolioId),
    queryFn: () => platformApi.listPortfolioSnapshots(organizationId!, portfolioId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      platformApi.createPortfolio(organizationId!, { name, slug, baseCurrency: 'USD' }),
    onSuccess: async (row) => {
      setPortfolioId(String(row.id));
      await qc.invalidateQueries({ queryKey: ['portfolios', organizationId] });
    },
  });

  const positionMutation = useMutation({
    mutationFn: () =>
      platformApi.upsertPortfolioPosition(organizationId!, portfolioId, {
        subjectType: 'custom',
        subjectId,
        label,
        quantity: '1',
        costBasisMinor: costBasis,
        marketValueMinor: marketValue,
      }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['portfolio', organizationId, portfolioId] }),
        qc.invalidateQueries({ queryKey: ['portfolio-nav', organizationId, portfolioId] }),
      ]);
    },
  });

  const snapshotMutation = useMutation({
    mutationFn: () => platformApi.createPortfolioSnapshot(organizationId!, portfolioId),
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: ['portfolio-snapshots', organizationId, portfolioId],
      });
    },
  });

  if (!organizationId) {
    return (
      <div>
        <PageHeader
          title="Portfolio OS"
          description="Portfolios, positions, NAV aggregation, and point-in-time snapshots."
        />
        <EmptyState
          title="Select an organization"
          description="Portfolios are organization-scoped."
        />
      </div>
    );
  }

  const positions = (detailQuery.data?.positions as Array<Record<string, unknown>> | undefined) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Portfolio OS"
        description="NAV uses marked market values (or latest asset valuation / cost basis). Not a full PMS with cash ledgers or FX."
      />

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-md border border-[var(--gain-border)] p-4 space-y-3">
          <div className="font-medium">Create portfolio</div>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="slug" />
          <Button
            disabled={!name || !slug || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Create
          </Button>
        </div>
        <div className="rounded-md border border-[var(--gain-border)] p-4 space-y-3">
          <div className="font-medium">Add / update position</div>
          <Input value={portfolioId} onChange={(e) => setPortfolioId(e.target.value)} placeholder="Portfolio UUID" />
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" />
          <Input value={subjectId} onChange={(e) => setSubjectId(e.target.value)} placeholder="Subject UUID" />
          <Input value={costBasis} onChange={(e) => setCostBasis(e.target.value)} placeholder="Cost basis (minor)" />
          <Input value={marketValue} onChange={(e) => setMarketValue(e.target.value)} placeholder="Market value (minor)" />
          <div className="flex gap-2">
            <Button
              disabled={!portfolioId || positionMutation.isPending}
              onClick={() => positionMutation.mutate()}
            >
              Upsert position
            </Button>
            <Button
              variant="secondary"
              disabled={!portfolioId || snapshotMutation.isPending}
              onClick={() => snapshotMutation.mutate()}
            >
              Snapshot NAV
            </Button>
          </div>
        </div>
      </div>

      {listQuery.isLoading ? <LoadingState /> : null}
      {listQuery.isError ? <ErrorState message="Failed to load portfolios." /> : null}

      {listQuery.data && listQuery.data.items.length === 0 ? (
        <EmptyState
          title="No portfolios"
          description="Create a portfolio, add positions with marks, then snapshot NAV."
        />
      ) : null}

      {listQuery.data && listQuery.data.items.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">Portfolios</h2>
          <DataTable
            columns={['Name', 'Currency', 'Status', 'Id']}
            rows={listQuery.data.items.map((row) => [
              String(row.name),
              String(row.baseCurrency),
              String(row.status),
              <button
                key={String(row.id)}
                type="button"
                className="text-[var(--gain-accent)] underline"
                onClick={() => setPortfolioId(String(row.id))}
              >
                {String(row.id).slice(0, 8)}…
              </button>,
            ])}
          />
        </div>
      ) : null}

      {navQuery.data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="rounded-md border border-[var(--gain-border)] px-3 py-2">
            <div className="text-[var(--gain-text-muted)]">NAV</div>
            <div className="text-xl font-semibold">{String(navQuery.data.navMinor)}</div>
          </div>
          <div className="rounded-md border border-[var(--gain-border)] px-3 py-2">
            <div className="text-[var(--gain-text-muted)]">Cost</div>
            <div className="text-xl font-semibold">{String(navQuery.data.costBasisMinor)}</div>
          </div>
          <div className="rounded-md border border-[var(--gain-border)] px-3 py-2">
            <div className="text-[var(--gain-text-muted)]">Unrealized P&amp;L</div>
            <div className="text-xl font-semibold">{String(navQuery.data.unrealizedPnlMinor)}</div>
          </div>
          <div className="rounded-md border border-[var(--gain-border)] px-3 py-2">
            <div className="text-[var(--gain-text-muted)]">Positions</div>
            <div className="text-xl font-semibold">{String(navQuery.data.positionCount)}</div>
          </div>
        </div>
      ) : null}

      {positions.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">Positions</h2>
          <DataTable
            columns={['Label', 'Type', 'Qty', 'Cost', 'Mark']}
            rows={positions.map((row) => [
              String(row.label),
              String(row.subjectType),
              String(row.quantity),
              String(row.costBasisMinor),
              String(row.marketValueMinor),
            ])}
          />
        </div>
      ) : null}

      {snapshotsQuery.data && snapshotsQuery.data.items.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">Snapshots</h2>
          <DataTable
            columns={['As of', 'NAV', 'P&L', 'Positions']}
            rows={snapshotsQuery.data.items.map((row) => [
              String(row.asOfDate).slice(0, 10),
              String(row.navMinor),
              String(row.unrealizedPnlMinor),
              String(row.positionCount),
            ])}
          />
        </div>
      ) : null}
    </div>
  );
}
