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

export default function WorkflowsPage() {
  const organizationId = useIdentityStore((s) => s.organizationId);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['workflows', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => platformApi.listWorkflows(organizationId!),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      platformApi.createWorkflow(organizationId!, {
        name,
        slug,
        status: 'active',
        definition: {
          steps: [
            { key: 'collect', name: 'Collect documents' },
            { key: 'review', name: 'Review diligence' },
            { key: 'approve', name: 'Approve' },
          ],
        },
      }),
    onSuccess: async () => {
      setShowCreate(false);
      setName('');
      setSlug('');
      await qc.invalidateQueries({ queryKey: ['workflows', organizationId] });
    },
  });

  return (
    <div>
      <PageHeader
        title="Workflows"
        description="Define multi-step diligence and operations workflows with runnable tasks."
        action={
          <Button disabled={!organizationId} onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? 'Cancel' : 'Create workflow'}
          </Button>
        }
      />
      {!organizationId ? (
        <EmptyState title="Select an organization" description="Workflows are org-scoped." />
      ) : null}
      {organizationId && showCreate ? (
        <form
          className="mb-6 grid gap-3 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" required />
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="slug" required />
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
        <EmptyState title="No workflows" description="Create a diligence workflow definition." />
      ) : null}
      {organizationId && query.data && query.data.items.length > 0 ? (
        <DataTable
          columns={['Name', 'Slug', 'Status']}
          rows={query.data.items.map((w) => [
            String(w.name),
            String(w.slug),
            String(w.status),
          ])}
        />
      ) : null}
    </div>
  );
}
