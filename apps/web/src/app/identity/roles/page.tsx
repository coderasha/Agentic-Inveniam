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

export default function RolesPage() {
  const organizationId = useIdentityStore((s) => s.organizationId);
  const query = useQuery({
    queryKey: ['roles', organizationId],
    queryFn: () =>
      identityApi.listRoles(
        organizationId
          ? `?page=1&pageSize=50&organizationId=${organizationId}&includeSystem=true`
          : '?page=1&pageSize=50&includeSystem=true',
        organizationId ?? undefined,
      ),
  });

  return (
    <div>
      <PageHeader
        title="Roles & Permissions"
        description="RBAC roles with fine-grained Identity permissions."
      />
      {query.isLoading ? <LoadingState label="Loading roles…" /> : null}
      {query.isError ? (
        <ErrorState
          message={
            query.error instanceof Error
              ? query.error.message
              : 'Failed to load roles'
          }
          onRetry={() => query.refetch()}
        />
      ) : null}
      {query.data && query.data.data.length === 0 ? (
        <EmptyState
          title="No roles"
          description="System roles should be seeded by the Identity database."
        />
      ) : null}
      {query.data && query.data.data.length > 0 ? (
        <DataTable
          columns={['Role', 'Slug', 'System', 'Permissions']}
          rows={query.data.data.map((role) => [
            <div key={`${role.id}-name`}>
              <div className="font-medium">{role.name}</div>
              <div className="text-xs text-[var(--gain-text-muted)]">
                {role.description ?? '—'}
              </div>
            </div>,
            <code key={`${role.id}-slug`} className="text-xs">
              {role.slug}
            </code>,
            role.isSystem ? 'Yes' : 'No',
            <span key={`${role.id}-perms`} className="text-xs text-[var(--gain-text-muted)]">
              {role.permissions.length} permissions
            </span>,
          ])}
        />
      ) : null}
    </div>
  );
}
