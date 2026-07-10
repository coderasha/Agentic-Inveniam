'use client';

import Link from 'next/link';
import { EmptyState, PageHeader } from '@/components/ui/states';
import { useIdentityStore } from '@/stores/identity-store';

export default function TwinGraphPage() {
  const organizationId = useIdentityStore((s) => s.organizationId);

  return (
    <div>
      <PageHeader
        title="Twin relationships"
        description="Typed twin↔twin edges live in the Twin Engine. The Knowledge Graph projects them into the org-wide graph."
        action={
          organizationId ? (
            <Link
              href="/graph"
              className="inline-flex h-9 items-center rounded-md bg-[var(--gain-accent)] px-3 text-sm font-medium text-white"
            >
              Open Knowledge Graph
            </Link>
          ) : undefined
        }
      />
      {!organizationId ? (
        <EmptyState
          title="Select an organization"
          description="Relationship views are scoped to an organization."
        />
      ) : (
        <EmptyState
          title="Manage edges on a twin, explore in Knowledge Graph"
          description="Create parent_of / owned_by / collateral_for links from a twin detail page, then sync the Knowledge Graph to visualize cross-domain connections."
        />
      )}
    </div>
  );
}
