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

export default function AssetsPage() {
  const organizationId = useIdentityStore((s) => s.organizationId);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['assets', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => platformApi.listAssets(organizationId!),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      platformApi.createAsset(organizationId!, {
        name,
        slug,
        assetClass: 'real_estate',
        currencyCode: 'USD',
        tags: ['gain'],
      }),
    onSuccess: async () => {
      setShowCreate(false);
      setName('');
      setSlug('');
      await qc.invalidateQueries({ queryKey: ['assets', organizationId] });
    },
  });

  return (
    <div>
      <PageHeader
        title="Asset Registry"
        description="Canonical registry of private assets, optionally linked to digital twins."
        action={
          <Button disabled={!organizationId} onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? 'Cancel' : 'Register asset'}
          </Button>
        }
      />
      {!organizationId ? (
        <EmptyState title="Select an organization" description="Assets are org-scoped." />
      ) : null}
      {organizationId && showCreate ? (
        <form
          className="mb-6 grid gap-3 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          <Input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Input
            placeholder="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
          />
          <Button type="submit" disabled={createMutation.isPending}>
            Create
          </Button>
        </form>
      ) : null}
      {organizationId && query.isLoading ? <LoadingState /> : null}
      {organizationId && query.isError ? (
        <ErrorState
          message={query.error instanceof Error ? query.error.message : 'Failed'}
          onRetry={() => query.refetch()}
        />
      ) : null}
      {organizationId && query.data?.items?.length === 0 ? (
        <EmptyState title="No assets" description="Register the first private asset." />
      ) : null}
      {organizationId && query.data && query.data.items.length > 0 ? (
        <DataTable
          columns={['Name', 'Class', 'Status', 'Currency']}
          rows={query.data.items.map((a) => [
            String(a.name),
            String(a.assetClass),
            String(a.status),
            String(a.currencyCode),
          ])}
        />
      ) : null}
    </div>
  );
}
