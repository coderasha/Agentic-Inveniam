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

export default function ProvenancePage() {
  const organizationId = useIdentityStore((s) => s.organizationId);
  const qc = useQueryClient();
  const [subjectType, setSubjectType] = useState('document');
  const [subjectId, setSubjectId] = useState('');
  const [summary, setSummary] = useState('');
  const [payload, setPayload] = useState('');
  const [chainSubjectType, setChainSubjectType] = useState('document');
  const [chainSubjectId, setChainSubjectId] = useState('');
  const [chainResult, setChainResult] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['provenance', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => platformApi.listProvenance(organizationId!),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const contentHash = await sha256Hex(payload || summary || subjectId);
      return platformApi.createProvenance(organizationId!, {
        subjectType,
        subjectId,
        sourceType: 'manual',
        contentHash,
        summary: summary || undefined,
        confidence: 0.8,
      });
    },
    onSuccess: async () => {
      setSummary('');
      setPayload('');
      await qc.invalidateQueries({ queryKey: ['provenance', organizationId] });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (id: string) => platformApi.verifyProvenance(organizationId!, id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['provenance', organizationId] });
    },
  });

  const checkChain = async () => {
    if (!organizationId || !chainSubjectId) return;
    const result = await platformApi.verifySubjectChain(
      organizationId,
      chainSubjectType,
      chainSubjectId,
    );
    setChainResult(
      result.valid
        ? `Chain intact (${result.recordCount} records)`
        : `Broken at ${result.brokenAtId ?? 'unknown'}: ${result.reason ?? 'invalid'}`,
    );
  };

  if (!organizationId) {
    return (
      <div>
        <PageHeader
          title="Data Provenance"
          description="Hash-chained lineage for twins, documents, assets, and graph entities."
        />
        <EmptyState
          title="Select an organization"
          description="Provenance records are organization-scoped."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Provenance"
        description="Record content hashes, verify subject chains, and mark attestations. Trust Engine will consume these records next."
      />

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-md border border-[var(--gain-border)] p-4 space-y-3">
          <div className="font-medium">Record provenance</div>
          <Input
            placeholder="Subject type (document, twin, asset…)"
            value={subjectType}
            onChange={(e) => setSubjectType(e.target.value)}
          />
          <Input
            placeholder="Subject UUID"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          />
          <Input
            placeholder="Summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
          <Input
            placeholder="Payload to hash (optional)"
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
          />
          <Button
            disabled={!subjectId || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Create record
          </Button>
        </div>
        <div className="rounded-md border border-[var(--gain-border)] p-4 space-y-3">
          <div className="font-medium">Verify subject chain</div>
          <Input
            placeholder="Subject type"
            value={chainSubjectType}
            onChange={(e) => setChainSubjectType(e.target.value)}
          />
          <Input
            placeholder="Subject UUID"
            value={chainSubjectId}
            onChange={(e) => setChainSubjectId(e.target.value)}
          />
          <Button disabled={!chainSubjectId} onClick={() => void checkChain()}>
            Check integrity
          </Button>
          {chainResult ? (
            <div className="text-sm text-[var(--gain-text-muted)]">{chainResult}</div>
          ) : null}
        </div>
      </div>

      {query.isLoading ? <LoadingState /> : null}
      {query.isError ? <ErrorState message="Failed to load provenance records." /> : null}
      {query.data && query.data.items.length === 0 ? (
        <EmptyState
          title="No provenance records"
          description="Create a record for a document, twin, or asset subject id."
        />
      ) : null}
      {query.data && query.data.items.length > 0 ? (
        <DataTable
          columns={['Subject', 'Status', 'Hash', 'Captured', '']}
          rows={query.data.items.map((row) => [
            `${String(row.subjectType)} · ${String(row.subjectId).slice(0, 8)}…`,
            String(row.status),
            `${String(row.contentHash).slice(0, 12)}…`,
            new Date(String(row.capturedAt)).toLocaleString(),
            row.status === 'recorded' ? (
              <Button
                key={String(row.id)}
                variant="secondary"
                onClick={() => verifyMutation.mutate(String(row.id))}
              >
                Verify
              </Button>
            ) : (
              '—'
            ),
          ])}
        />
      ) : null}
    </div>
  );
}
