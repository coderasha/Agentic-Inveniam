'use client';

import { useQuery } from '@tanstack/react-query';
import { identityApi } from '@/lib/identity-api';
import { useIdentityStore } from '@/stores/identity-store';
import {
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/components/ui/states';
import { Button } from '@/components/ui/button';

export default function OrganizationsPage() {
  const setOrganizationId = useIdentityStore((s) => s.setOrganizationId);
  const organizationId = useIdentityStore((s) => s.organizationId);

  const query = useQuery({
    queryKey: ['organizations'],
    queryFn: () => identityApi.listOrganizations('?page=1&pageSize=50'),
  });

  return (
    <div>
      <PageHeader
        title="Organizations"
        description="Tenant boundaries for assets, people, and policy."
        action={<Button disabled>Create organization</Button>}
      />

      {query.isLoading ? <LoadingState label="Loading organizations…" /> : null}
      {query.isError ? (
        <ErrorState
          message={
            query.error instanceof Error
              ? query.error.message
              : 'Failed to load organizations'
          }
          onRetry={() => query.refetch()}
        />
      ) : null}
      {query.data && query.data.data.length === 0 ? (
        <EmptyState
          title="No organizations yet"
          description="Create the first organization to establish a trust boundary."
        />
      ) : null}
      {query.data && query.data.data.length > 0 ? (
        <DataTable
          columns={['Name', 'Slug', 'Status', 'Country', 'Actions']}
          rows={query.data.data.map((org) => [
            <div key={`${org.id}-name`}>
              <div className="font-medium">{org.name}</div>
              <div className="text-xs text-[var(--gain-text-muted)]">
                {org.legalName ?? '—'}
              </div>
            </div>,
            <code
              key={`${org.id}-slug`}
              className="font-[var(--font-gain-mono)] text-xs"
            >
              {org.slug}
            </code>,
            <span key={`${org.id}-status`} className="capitalize">
              {org.status.replaceAll('_', ' ')}
            </span>,
            org.countryCode ?? '—',
            <Button
              key={`${org.id}-select`}
              variant={organizationId === org.id ? 'primary' : 'secondary'}
              onClick={() => setOrganizationId(org.id)}
            >
              {organizationId === org.id ? 'Selected' : 'Select'}
            </Button>,
          ])}
        />
      ) : null}
    </div>
  );
}
