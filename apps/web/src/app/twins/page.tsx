'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { twinApi } from '@/lib/twin-api';
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

export default function TwinsPage() {
  const organizationId = useIdentityStore((s) => s.organizationId);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [assetClass, setAssetClass] = useState('real_estate');
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['twins', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => twinApi.list(organizationId!),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      twinApi.create(organizationId!, {
        name,
        slug,
        assetClass,
        currencyCode: 'USD',
        tags: ['gain'],
      }),
    onSuccess: async () => {
      setShowCreate(false);
      setName('');
      setSlug('');
      await queryClient.invalidateQueries({ queryKey: ['twins', organizationId] });
    },
  });

  return (
    <div>
      <PageHeader
        title="Digital Twins"
        description="AI-native living models for every private asset."
        action={
          <Button
            disabled={!organizationId}
            onClick={() => setShowCreate((v) => !v)}
          >
            {showCreate ? 'Cancel' : 'Create twin'}
          </Button>
        }
      />

      {!organizationId ? (
        <EmptyState
          title="Select an organization"
          description="Choose an organization in Identity first to scope twin operations."
        />
      ) : null}

      {organizationId && showCreate ? (
        <form
          className="mb-6 grid gap-3 rounded-lg border border-[var(--gain-border)] bg-[rgba(18,26,43,0.7)] p-4 md:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          <label className="grid gap-1 text-sm">
            <span className="text-[var(--gain-text-muted)]">Name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-[var(--gain-text-muted)]">Slug</span>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} required />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-[var(--gain-text-muted)]">Asset class</span>
            <select
              className="w-full rounded-md border border-[var(--gain-border)] bg-[var(--gain-bg)] px-3 py-2 text-sm"
              value={assetClass}
              onChange={(e) => setAssetClass(e.target.value)}
            >
              <option value="real_estate">Real estate</option>
              <option value="private_equity">Private equity</option>
              <option value="private_credit">Private credit</option>
              <option value="infrastructure">Infrastructure</option>
              <option value="fund">Fund</option>
              <option value="collectible">Collectible</option>
              <option value="operating_company">Operating company</option>
              <option value="other">Other</option>
            </select>
          </label>
          {createMutation.isError ? (
            <div className="md:col-span-3 text-sm text-[var(--gain-danger)]">
              {createMutation.error instanceof Error
                ? createMutation.error.message
                : 'Failed to create twin'}
            </div>
          ) : null}
          <div className="md:col-span-3">
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </form>
      ) : null}

      {organizationId && query.isLoading ? (
        <LoadingState label="Loading digital twins…" />
      ) : null}
      {organizationId && query.isError ? (
        <ErrorState
          message={
            query.error instanceof Error
              ? query.error.message
              : 'Failed to load twins'
          }
          onRetry={() => query.refetch()}
        />
      ) : null}
      {organizationId && query.data && query.data.data.length === 0 ? (
        <EmptyState
          title="No digital twins yet"
          description="Create the first twin to begin continuous asset intelligence."
          actionLabel="Create twin"
          onAction={() => setShowCreate(true)}
        />
      ) : null}
      {organizationId && query.data && query.data.data.length > 0 ? (
        <DataTable
          columns={['Name', 'Class', 'Status', 'Completeness', 'Actions']}
          rows={query.data.data.map((twin) => [
            <div key={`${twin.id}-name`}>
              <div className="font-medium">{twin.name}</div>
              <div className="text-xs text-[var(--gain-text-muted)]">{twin.slug}</div>
            </div>,
            twin.assetClass.replaceAll('_', ' '),
            <span key={`${twin.id}-status`} className="capitalize">
              {twin.status}
            </span>,
            `${Math.round(twin.completenessScore)}%`,
            <Link
              key={`${twin.id}-open`}
              href={`/twins/${twin.id}`}
              className="text-[var(--gain-accent)] text-sm"
            >
              Open
            </Link>,
          ])}
        />
      ) : null}
    </div>
  );
}
