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

export default function ApiKeysPage() {
  const organizationId = useIdentityStore((s) => s.organizationId);
  const query = useQuery({
    queryKey: ['api-keys', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () =>
      identityApi.listApiKeys(
        `?page=1&pageSize=50&organizationId=${organizationId}`,
        organizationId ?? undefined,
      ),
  });

  return (
    <div>
      <PageHeader
        title="API Keys"
        description="Machine identities for service-to-service access."
      />
      {!organizationId ? (
        <EmptyState
          title="Select an organization"
          description="API keys belong to an organization."
        />
      ) : null}
      {organizationId && query.isLoading ? (
        <LoadingState label="Loading API keys…" />
      ) : null}
      {organizationId && query.isError ? (
        <ErrorState
          message={
            query.error instanceof Error
              ? query.error.message
              : 'Failed to load API keys'
          }
          onRetry={() => query.refetch()}
        />
      ) : null}
      {organizationId && query.data && query.data.data.length === 0 ? (
        <EmptyState
          title="No API keys"
          description="Create a key for automation and agent workloads."
        />
      ) : null}
      {organizationId && query.data && query.data.data.length > 0 ? (
        <DataTable
          columns={['Name', 'Prefix', 'Status', 'Last used']}
          rows={query.data.data.map((key) => [
            key.name,
            <code key={`${key.id}-prefix`} className="text-xs">
              {key.keyPrefix}
            </code>,
            <span key={`${key.id}-status`} className="capitalize">
              {key.status}
            </span>,
            key.lastUsedAt
              ? new Date(key.lastUsedAt).toLocaleString()
              : 'Never',
          ])}
        />
      ) : null}
    </div>
  );
}
