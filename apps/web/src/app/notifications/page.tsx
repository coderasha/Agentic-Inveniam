'use client';

import { useQuery } from '@tanstack/react-query';
import { platformApi } from '@/lib/platform-api';
import { useIdentityStore } from '@/stores/identity-store';
import {
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/components/ui/states';

export default function NotificationsPage() {
  const organizationId = useIdentityStore((s) => s.organizationId);

  const query = useQuery({
    queryKey: ['notifications', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => platformApi.myNotifications(organizationId!),
  });

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="In-app notification center for the signed-in principal."
      />
      {!organizationId ? (
        <EmptyState
          title="Select an organization"
          description="Notifications are filtered by organization context."
        />
      ) : null}
      {organizationId && query.isLoading ? <LoadingState /> : null}
      {organizationId && query.isError ? (
        <ErrorState
          message={query.error instanceof Error ? query.error.message : 'Failed'}
          onRetry={() => query.refetch()}
        />
      ) : null}
      {organizationId && query.data?.items?.length === 0 ? (
        <EmptyState title="No notifications" description="You are caught up." />
      ) : null}
      {organizationId && query.data && query.data.items.length > 0 ? (
        <DataTable
          columns={['Title', 'Status', 'Created']}
          rows={query.data.items.map((n) => [
            String(n.title),
            String(n.status),
            String(n.createdAt),
          ])}
        />
      ) : null}
    </div>
  );
}
