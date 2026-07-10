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

export default function AuditPage() {
  const organizationId = useIdentityStore((s) => s.organizationId);
  const query = useQuery({
    queryKey: ['audit', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () =>
      identityApi.listAuditLogs(
        `?page=1&pageSize=50&organizationId=${organizationId}`,
        organizationId ?? undefined,
      ),
  });

  return (
    <div>
      <PageHeader
        title="Audit trail"
        description="Immutable record of identity and access mutations."
      />
      {!organizationId ? (
        <EmptyState
          title="Select an organization"
          description="Audit events are filtered by organization context."
        />
      ) : null}
      {organizationId && query.isLoading ? (
        <LoadingState label="Loading audit logs…" />
      ) : null}
      {organizationId && query.isError ? (
        <ErrorState
          message={
            query.error instanceof Error
              ? query.error.message
              : 'Failed to load audit logs'
          }
          onRetry={() => query.refetch()}
        />
      ) : null}
      {organizationId && query.data && query.data.data.length === 0 ? (
        <EmptyState
          title="No audit events"
          description="Actions will appear here as the organization is used."
        />
      ) : null}
      {organizationId && query.data && query.data.data.length > 0 ? (
        <DataTable
          columns={['When', 'Action', 'Resource', 'Actor', 'Correlation']}
          rows={query.data.data.map((log) => [
            new Date(log.createdAt).toLocaleString(),
            log.action,
            `${log.resourceType}${log.resourceId ? `:${log.resourceId.slice(0, 8)}` : ''}`,
            log.actorType,
            <code key={`${log.id}-corr`} className="text-xs">
              {log.correlationId.slice(0, 8)}
            </code>,
          ])}
        />
      ) : null}
    </div>
  );
}
