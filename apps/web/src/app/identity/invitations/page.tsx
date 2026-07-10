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

export default function InvitationsPage() {
  const organizationId = useIdentityStore((s) => s.organizationId);
  const query = useQuery({
    queryKey: ['invitations', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () =>
      identityApi.listInvitations(
        `?page=1&pageSize=50&organizationId=${organizationId}`,
        organizationId ?? undefined,
      ),
  });

  return (
    <div>
      <PageHeader
        title="Invitations"
        description="Invite collaborators with role-scoped access."
      />
      {!organizationId ? (
        <EmptyState
          title="Select an organization"
          description="Invitations are scoped to an organization."
        />
      ) : null}
      {organizationId && query.isLoading ? (
        <LoadingState label="Loading invitations…" />
      ) : null}
      {organizationId && query.isError ? (
        <ErrorState
          message={
            query.error instanceof Error
              ? query.error.message
              : 'Failed to load invitations'
          }
          onRetry={() => query.refetch()}
        />
      ) : null}
      {organizationId && query.data && query.data.data.length === 0 ? (
        <EmptyState
          title="No invitations"
          description="Create an invitation to onboard a new member."
        />
      ) : null}
      {organizationId && query.data && query.data.data.length > 0 ? (
        <DataTable
          columns={['Email', 'Status', 'Expires', 'Roles']}
          rows={query.data.data.map((invite) => [
            invite.email,
            <span key={`${invite.id}-status`} className="capitalize">
              {invite.status}
            </span>,
            new Date(invite.expiresAt).toLocaleString(),
            String(invite.roleIds.length),
          ])}
        />
      ) : null}
    </div>
  );
}
