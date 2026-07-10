'use client';

import { EmptyState, PageHeader } from '@/components/ui/states';
import { useIdentityStore } from '@/stores/identity-store';

export default function TwinGraphPage() {
  const organizationId = useIdentityStore((s) => s.organizationId);

  return (
    <div>
      <PageHeader
        title="Twin relationships"
        description="Graph of ownership, collateral, and dependency links between twins."
      />
      {!organizationId ? (
        <EmptyState
          title="Select an organization"
          description="Relationship views are scoped to an organization."
        />
      ) : (
        <EmptyState
          title="Open a twin to manage relationships"
          description="Create relationship edges from a twin detail via the Twin API (parent_of, owned_by, collateral_for, and more)."
        />
      )}
    </div>
  );
}
