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

export default function AiMarketplacePage() {
  const organizationId = useIdentityStore((s) => s.organizationId);
  const qc = useQueryClient();
  const [name, setName] = useState('Diligence copilot');
  const [slug, setSlug] = useState('diligence-copilot');
  const [summary, setSummary] = useState('Heuristic diligence assistant for private assets');
  const [systemPrompt, setSystemPrompt] = useState(
    'Help operators triage diligence gaps across trust, provenance, and compliance.',
  );
  const [pricingModel, setPricingModel] = useState('per_run');
  const [priceMinor, setPriceMinor] = useState('100');
  const [includedRuns, setIncludedRuns] = useState('10');
  const [listingId, setListingId] = useState('');
  const [installId, setInstallId] = useState('');
  const [agentSlug, setAgentSlug] = useState('diligence-copilot-installed');

  const myListingsQuery = useQuery({
    queryKey: ['ai-marketplace-listings', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => platformApi.listAiMarketplaceListings(organizationId!, false),
  });
  const catalogQuery = useQuery({
    queryKey: ['ai-marketplace-catalog', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => platformApi.listAiMarketplaceListings(organizationId!, true),
  });
  const installsQuery = useQuery({
    queryKey: ['ai-marketplace-installs', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => platformApi.listAiMarketplaceInstalls(organizationId!),
  });
  const usageQuery = useQuery({
    queryKey: ['ai-marketplace-usage', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => platformApi.listAiMarketplaceUsage(organizationId!),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      platformApi.createAiMarketplaceListing(organizationId!, {
        name,
        slug,
        summary,
        systemPrompt,
        category: 'diligence',
        pricingModel,
        priceMinor: pricingModel === 'free' ? '0' : priceMinor,
        includedRuns: Number(includedRuns),
        provider: 'heuristic',
        tools: ['extract_fields', 'risk_flags', 'compliance_hint'],
      }),
    onSuccess: (listing) => {
      setListingId(String(listing.id));
      void qc.invalidateQueries({ queryKey: ['ai-marketplace-listings', organizationId] });
    },
  });

  const publishMutation = useMutation({
    mutationFn: () => platformApi.publishAiMarketplaceListing(organizationId!, listingId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai-marketplace-listings', organizationId] });
      void qc.invalidateQueries({ queryKey: ['ai-marketplace-catalog', organizationId] });
    },
  });

  const installMutation = useMutation({
    mutationFn: () =>
      platformApi.installAiMarketplaceListing(organizationId!, {
        listingId,
        agentSlug,
      }),
    onSuccess: (result) => {
      const install = result.install as Record<string, unknown> | undefined;
      if (install?.id) setInstallId(String(install.id));
      void qc.invalidateQueries({ queryKey: ['ai-marketplace-installs', organizationId] });
      void qc.invalidateQueries({ queryKey: ['ai-agents', organizationId] });
    },
  });

  const usageMutation = useMutation({
    mutationFn: () =>
      platformApi.recordAiMarketplaceUsage(organizationId!, {
        installId,
        units: 1,
        referenceType: 'manual',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai-marketplace-usage', organizationId] });
    },
  });

  if (!organizationId) {
    return (
      <div>
        <PageHeader
          title="AI Marketplace"
          description="Publish, install, and meter AI agents."
        />
        <EmptyState
          title="Select an organization"
          description="AI Marketplace data is organization-scoped."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Marketplace"
        description="Catalog for publishing agent templates, installing them as org agents, and metering usage. No payment rail or settlement — pricing is informational + quota enforcement only."
      />

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-md border border-[var(--gain-border)] p-4 space-y-3">
          <div className="font-medium">Create listing</div>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="slug" />
          <Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Summary" />
          <Input
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="System prompt"
          />
          <Input
            value={pricingModel}
            onChange={(e) => setPricingModel(e.target.value)}
            placeholder="free | per_run | monthly"
          />
          <Input
            value={priceMinor}
            onChange={(e) => setPriceMinor(e.target.value)}
            placeholder="priceMinor"
          />
          <Input
            value={includedRuns}
            onChange={(e) => setIncludedRuns(e.target.value)}
            placeholder="includedRuns"
          />
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            Create draft listing
          </Button>
          {createMutation.isError && (
            <div className="text-sm text-red-600">{String(createMutation.error)}</div>
          )}
        </div>

        <div className="rounded-md border border-[var(--gain-border)] p-4 space-y-3">
          <div className="font-medium">Publish / install / meter</div>
          <Input
            value={listingId}
            onChange={(e) => setListingId(e.target.value)}
            placeholder="Listing id"
          />
          <Input
            value={agentSlug}
            onChange={(e) => setAgentSlug(e.target.value)}
            placeholder="Installed agent slug"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => publishMutation.mutate()}
              disabled={!listingId || publishMutation.isPending}
            >
              Publish
            </Button>
            <Button
              variant="secondary"
              onClick={() => installMutation.mutate()}
              disabled={!listingId || installMutation.isPending}
            >
              Install
            </Button>
          </div>
          <Input
            value={installId}
            onChange={(e) => setInstallId(e.target.value)}
            placeholder="Install id"
          />
          <Button
            onClick={() => usageMutation.mutate()}
            disabled={!installId || usageMutation.isPending}
          >
            Record 1 usage unit
          </Button>
          {usageMutation.data && (
            <pre className="text-xs overflow-auto max-h-40 bg-[var(--gain-surface)] p-2 rounded">
              {JSON.stringify(usageMutation.data, null, 2)}
            </pre>
          )}
          {(publishMutation.isError || installMutation.isError || usageMutation.isError) && (
            <div className="text-sm text-red-600">
              {String(
                publishMutation.error ?? installMutation.error ?? usageMutation.error,
              )}
            </div>
          )}
        </div>
      </div>

      {myListingsQuery.isLoading || catalogQuery.isLoading || installsQuery.isLoading ? (
        <LoadingState />
      ) : null}
      {myListingsQuery.isError || catalogQuery.isError || installsQuery.isError ? (
        <ErrorState message="Failed to load AI Marketplace data." />
      ) : null}

      {myListingsQuery.data && myListingsQuery.data.items.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">My listings ({myListingsQuery.data.total})</h2>
          <DataTable
            columns={['Name', 'Status', 'Pricing', 'Id']}
            rows={myListingsQuery.data.items.map((row) => [
              String(row.name),
              String(row.status),
              `${String(row.pricingModel)} @ ${String(row.priceMinor)}`,
              <button
                key={String(row.id)}
                type="button"
                className="text-[var(--gain-accent)] underline"
                onClick={() => setListingId(String(row.id))}
              >
                {String(row.id).slice(0, 8)}…
              </button>,
            ])}
          />
        </div>
      ) : null}

      {catalogQuery.data && catalogQuery.data.items.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">Published catalog ({catalogQuery.data.total})</h2>
          <DataTable
            columns={['Name', 'Category', 'Pricing', 'Id']}
            rows={catalogQuery.data.items.map((row) => [
              String(row.name),
              String(row.category),
              String(row.pricingModel),
              <button
                key={String(row.id)}
                type="button"
                className="text-[var(--gain-accent)] underline"
                onClick={() => setListingId(String(row.id))}
              >
                {String(row.id).slice(0, 8)}…
              </button>,
            ])}
          />
        </div>
      ) : null}

      {installsQuery.data && installsQuery.data.items.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">Installs ({installsQuery.data.total})</h2>
          <DataTable
            columns={['Status', 'Agent', 'Quota', 'Id']}
            rows={installsQuery.data.items.map((row) => [
              String(row.status),
              String(row.agentId).slice(0, 8) + '…',
              `${String(row.includedRuns)} runs`,
              <button
                key={String(row.id)}
                type="button"
                className="text-[var(--gain-accent)] underline"
                onClick={() => setInstallId(String(row.id))}
              >
                {String(row.id).slice(0, 8)}…
              </button>,
            ])}
          />
        </div>
      ) : null}

      {usageQuery.data && usageQuery.data.items.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">Usage ({usageQuery.data.total})</h2>
          <DataTable
            columns={['Units', 'Install', 'Created']}
            rows={usageQuery.data.items.map((row) => [
              String(row.units),
              String(row.installId).slice(0, 8) + '…',
              String(row.createdAt),
            ])}
          />
        </div>
      ) : null}
    </div>
  );
}
