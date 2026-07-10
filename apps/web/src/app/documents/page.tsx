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

async function sha256Hex(text: string): Promise<string> {
  const digest = await window.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export default function DocumentsPage() {
  const organizationId = useIdentityStore((s) => s.organizationId);
  const [title, setTitle] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['documents', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => platformApi.listDocuments(organizationId!),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const fileName = `${title.replace(/\s+/g, '-').toLowerCase() || 'document'}.txt`;
      const placeholder = `GAIN document placeholder for ${title}`;
      const checksum = await sha256Hex(placeholder);
      return platformApi.createDocument(organizationId!, {
        title,
        category: 'general',
        sensitivity: 'internal',
        mimeType: 'text/plain',
        fileName,
        byteSize: new TextEncoder().encode(placeholder).length,
        checksumSha256: checksum,
        tags: ['gain'],
      });
    },
    onSuccess: async () => {
      setTitle('');
      setShowCreate(false);
      await qc.invalidateQueries({ queryKey: ['documents', organizationId] });
    },
  });

  return (
    <div>
      <PageHeader
        title="Documents"
        description="Versioned document metadata with content-addressed storage keys."
        action={
          <Button disabled={!organizationId} onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? 'Cancel' : 'Register document'}
          </Button>
        }
      />
      {!organizationId ? (
        <EmptyState
          title="Select an organization"
          description="Documents are organization-scoped."
        />
      ) : null}
      {organizationId && showCreate ? (
        <form
          className="mb-6 flex gap-3 items-end"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          <label className="grid gap-1 text-sm flex-1">
            <span className="text-[var(--gain-text-muted)]">Title</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating…' : 'Create metadata'}
          </Button>
          {createMutation.isError ? (
            <div className="text-sm text-[var(--gain-danger)]">
              {createMutation.error instanceof Error
                ? createMutation.error.message
                : 'Failed'}
            </div>
          ) : null}
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
        <EmptyState title="No documents" description="Register document metadata to begin." />
      ) : null}
      {organizationId && query.data && query.data.items.length > 0 ? (
        <DataTable
          columns={['Title', 'Status', 'Category', 'Size']}
          rows={query.data.items.map((doc) => [
            String(doc.title),
            String(doc.status),
            String(doc.category),
            String(doc.byteSize),
          ])}
        />
      ) : null}
    </div>
  );
}
