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

export default function UsersPage() {
  const organizationId = useIdentityStore((s) => s.organizationId);
  const query = useQuery({
    queryKey: ['users', organizationId],
    queryFn: () =>
      identityApi.listUsers(
        organizationId
          ? `?page=1&pageSize=50&organizationId=${organizationId}`
          : '?page=1&pageSize=50',
        organizationId ?? undefined,
      ),
    enabled: true,
  });

  return (
    <div>
      <PageHeader
        title="Users"
        description="People with access to the selected organization context."
      />
      {!organizationId ? (
        <EmptyState
          title="Select an organization"
          description="Choose an organization first to scope user memberships."
        />
      ) : null}
      {organizationId && query.isLoading ? (
        <LoadingState label="Loading users…" />
      ) : null}
      {organizationId && query.isError ? (
        <ErrorState
          message={
            query.error instanceof Error
              ? query.error.message
              : 'Failed to load users'
          }
          onRetry={() => query.refetch()}
        />
      ) : null}
      {organizationId && query.data && query.data.data.length === 0 ? (
        <EmptyState
          title="No users found"
          description="Invite teammates to collaborate on private assets."
        />
      ) : null}
      {organizationId && query.data && query.data.data.length > 0 ? (
        <DataTable
          columns={['Name', 'Email', 'Status', 'Locale']}
          rows={query.data.data.map((user) => [
            <span key={`${user.id}-name`}>
              {user.displayName ?? `${user.firstName} ${user.lastName}`}
            </span>,
            user.email,
            <span key={`${user.id}-status`} className="capitalize">
              {user.status}
            </span>,
            user.locale,
          ])}
        />
      ) : null}
    </div>
  );
}
