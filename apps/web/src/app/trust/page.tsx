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

export default function TrustPage() {
  const organizationId = useIdentityStore((s) => s.organizationId);
  const qc = useQueryClient();
  const [subjectType, setSubjectType] = useState('document');
  const [subjectId, setSubjectId] = useState('');
  const [statement, setStatement] = useState('');
  const [confidence, setConfidence] = useState('0.85');
  const [scoreSubjectType, setScoreSubjectType] = useState('document');
  const [scoreSubjectId, setScoreSubjectId] = useState('');
  const [lastScore, setLastScore] = useState<Record<string, unknown> | null>(null);

  const attestationsQuery = useQuery({
    queryKey: ['trust-attestations', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => platformApi.listAttestations(organizationId!),
  });

  const scoresQuery = useQuery({
    queryKey: ['trust-scores', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => platformApi.listTrustScores(organizationId!),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      platformApi.createAttestation(organizationId!, {
        subjectType,
        subjectId,
        kind: 'data_quality',
        statement,
        confidence: Number(confidence) || 0.7,
        weight: 1,
      }),
    onSuccess: async () => {
      setStatement('');
      await qc.invalidateQueries({ queryKey: ['trust-attestations', organizationId] });
    },
  });

  const computeMutation = useMutation({
    mutationFn: () =>
      platformApi.computeTrustScore(organizationId!, scoreSubjectType, scoreSubjectId),
    onSuccess: async (score) => {
      setLastScore(score);
      await qc.invalidateQueries({ queryKey: ['trust-scores', organizationId] });
    },
  });

  const anchorMutation = useMutation({
    mutationFn: async () => {
      const payloadHash = await sha256Hex(`${scoreSubjectType}:${scoreSubjectId}:${Date.now()}`);
      return platformApi.createTrustAnchor(organizationId!, {
        subjectType: scoreSubjectType,
        subjectId: scoreSubjectId,
        payloadHash,
        network: 'offchain',
      });
    },
  });

  if (!organizationId) {
    return (
      <div>
        <PageHeader
          title="Trust Engine"
          description="Attestations, deterministic trust scores, and off-chain hash anchors."
        />
        <EmptyState
          title="Select an organization"
          description="Trust data is organization-scoped."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trust Engine"
        description="Scores combine active attestations, verified provenance, and anchor status. On-chain connectors are not wired yet — offchain anchors issue a deterministic receipt."
      />

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-md border border-[var(--gain-border)] p-4 space-y-3">
          <div className="font-medium">Create attestation</div>
          <Input value={subjectType} onChange={(e) => setSubjectType(e.target.value)} placeholder="Subject type" />
          <Input value={subjectId} onChange={(e) => setSubjectId(e.target.value)} placeholder="Subject UUID" />
          <Input value={statement} onChange={(e) => setStatement(e.target.value)} placeholder="Statement" />
          <Input value={confidence} onChange={(e) => setConfidence(e.target.value)} placeholder="Confidence 0-1" />
          <Button
            disabled={!subjectId || !statement || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Attest
          </Button>
        </div>
        <div className="rounded-md border border-[var(--gain-border)] p-4 space-y-3">
          <div className="font-medium">Compute trust score</div>
          <Input value={scoreSubjectType} onChange={(e) => setScoreSubjectType(e.target.value)} placeholder="Subject type" />
          <Input value={scoreSubjectId} onChange={(e) => setScoreSubjectId(e.target.value)} placeholder="Subject UUID" />
          <div className="flex gap-2">
            <Button
              disabled={!scoreSubjectId || computeMutation.isPending}
              onClick={() => computeMutation.mutate()}
            >
              Compute
            </Button>
            <Button
              variant="secondary"
              disabled={!scoreSubjectId || anchorMutation.isPending}
              onClick={() => anchorMutation.mutate()}
            >
              Anchor offchain
            </Button>
          </div>
          {lastScore ? (
            <div className="text-sm text-[var(--gain-text-muted)]">
              Grade {String(lastScore.grade)} · score {String(lastScore.score)}
            </div>
          ) : null}
        </div>
      </div>

      {attestationsQuery.isLoading || scoresQuery.isLoading ? <LoadingState /> : null}
      {attestationsQuery.isError || scoresQuery.isError ? (
        <ErrorState message="Failed to load trust data." />
      ) : null}

      {scoresQuery.data && scoresQuery.data.items.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">Scores</h2>
          <DataTable
            columns={['Subject', 'Grade', 'Score', 'Attestations', 'Provenance']}
            rows={scoresQuery.data.items.map((row) => [
              `${String(row.subjectType)} · ${String(row.subjectId).slice(0, 8)}…`,
              String(row.grade),
              String(row.score),
              String(row.attestationCount),
              String(row.provenanceCount),
            ])}
          />
        </div>
      ) : null}

      {attestationsQuery.data && attestationsQuery.data.items.length === 0 ? (
        <EmptyState
          title="No attestations yet"
          description="Create an attestation for a document, twin, or asset subject."
        />
      ) : null}

      {attestationsQuery.data && attestationsQuery.data.items.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">Attestations</h2>
          <DataTable
            columns={['Subject', 'Kind', 'Status', 'Confidence', 'Statement']}
            rows={attestationsQuery.data.items.map((row) => [
              `${String(row.subjectType)} · ${String(row.subjectId).slice(0, 8)}…`,
              String(row.kind),
              String(row.status),
              String(row.confidence),
              String(row.statement).slice(0, 48),
            ])}
          />
        </div>
      ) : null}
    </div>
  );
}
