'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createOrganizationSchema, type CreateOrganizationInput } from '@gain/shared';
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
import { Input } from '@/components/ui/input';

export default function OrganizationsPage() {
  const setOrganizationId = useIdentityStore((s) => s.setOrganizationId);
  const organizationId = useIdentityStore((s) => s.organizationId);
  const [showCreate, setShowCreate] = useState(false);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['organizations'],
    queryFn: () => identityApi.listOrganizations('?page=1&pageSize=50'),
  });

  const form = useForm<CreateOrganizationInput>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: {
      name: '',
      slug: '',
      countryCode: 'US',
      timezone: 'UTC',
    },
  });

  const createMutation = useMutation({
    mutationFn: (body: CreateOrganizationInput) =>
      identityApi.createOrganization(body),
    onSuccess: async (org) => {
      setOrganizationId(org.id);
      setShowCreate(false);
      form.reset({ name: '', slug: '', countryCode: 'US', timezone: 'UTC' });
      await queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });

  return (
    <div>
      <PageHeader
        title="Organizations"
        description="Tenant boundaries for assets, people, and policy."
        action={
          <Button onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? 'Cancel' : 'Create organization'}
          </Button>
        }
      />

      {showCreate ? (
        <form
          className="mb-6 grid gap-3 rounded-lg border border-[var(--gain-border)] bg-[rgba(18,26,43,0.7)] p-4 md:grid-cols-2"
          onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
        >
          <label className="grid gap-1 text-sm">
            <span className="text-[var(--gain-text-muted)]">Name</span>
            <Input {...form.register('name')} placeholder="Acme Capital" />
            {form.formState.errors.name ? (
              <span className="text-xs text-[var(--gain-danger)]">
                {form.formState.errors.name.message}
              </span>
            ) : null}
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-[var(--gain-text-muted)]">Slug</span>
            <Input {...form.register('slug')} placeholder="acme-capital" />
            {form.formState.errors.slug ? (
              <span className="text-xs text-[var(--gain-danger)]">
                {form.formState.errors.slug.message}
              </span>
            ) : null}
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-[var(--gain-text-muted)]">Country</span>
            <Input {...form.register('countryCode')} placeholder="US" maxLength={2} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-[var(--gain-text-muted)]">Timezone</span>
            <Input {...form.register('timezone')} placeholder="UTC" />
          </label>
          {createMutation.isError ? (
            <div className="md:col-span-2 text-sm text-[var(--gain-danger)]">
              {createMutation.error instanceof Error
                ? createMutation.error.message
                : 'Failed to create organization'}
            </div>
          ) : null}
          <div className="md:col-span-2">
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </form>
      ) : null}

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
          actionLabel="Create organization"
          onAction={() => setShowCreate(true)}
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
