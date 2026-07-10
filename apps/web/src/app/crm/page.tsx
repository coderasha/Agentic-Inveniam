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

export default function CrmPage() {
  const organizationId = useIdentityStore((s) => s.organizationId);
  const qc = useQueryClient();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [investorId, setInvestorId] = useState('');
  const [investorVersion, setInvestorVersion] = useState(1);
  const [stage, setStage] = useState('contacted');
  const [noteSubject, setNoteSubject] = useState('Intro call');
  const [commitmentLabel, setCommitmentLabel] = useState('Fund I soft circle');
  const [commitmentAmount, setCommitmentAmount] = useState('25000000');

  const pipelineQuery = useQuery({
    queryKey: ['crm-pipeline', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => platformApi.crmPipeline(organizationId!),
  });

  const investorsQuery = useQuery({
    queryKey: ['crm-investors', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => platformApi.listInvestors(organizationId!),
  });

  const commitmentsQuery = useQuery({
    queryKey: ['crm-commitments', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => platformApi.listCrmCommitments(organizationId!),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      platformApi.createInvestor(organizationId!, {
        displayName,
        email: email || undefined,
        company: company || undefined,
        investorType: 'individual',
        pipelineStage: 'lead',
      }),
    onSuccess: async (row) => {
      setDisplayName('');
      setEmail('');
      setCompany('');
      setInvestorId(String(row.id));
      setInvestorVersion(Number(row.version) || 1);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['crm-investors', organizationId] }),
        qc.invalidateQueries({ queryKey: ['crm-pipeline', organizationId] }),
      ]);
    },
  });

  const stageMutation = useMutation({
    mutationFn: () =>
      platformApi.updateInvestor(organizationId!, investorId, {
        version: investorVersion,
        pipelineStage: stage,
      }),
    onSuccess: async (row) => {
      setInvestorVersion(Number(row.version) || investorVersion + 1);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['crm-investors', organizationId] }),
        qc.invalidateQueries({ queryKey: ['crm-pipeline', organizationId] }),
      ]);
    },
  });

  const noteMutation = useMutation({
    mutationFn: () =>
      platformApi.createCrmInteraction(organizationId!, {
        investorId,
        channel: 'note',
        subject: noteSubject,
        body: 'Logged from Investor CRM console',
      }),
  });

  const commitmentMutation = useMutation({
    mutationFn: () =>
      platformApi.createCrmCommitment(organizationId!, {
        investorId,
        label: commitmentLabel,
        amountMinor: commitmentAmount,
        status: 'soft',
        currencyCode: 'USD',
      }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['crm-commitments', organizationId] }),
        qc.invalidateQueries({ queryKey: ['crm-pipeline', organizationId] }),
      ]);
    },
  });

  if (!organizationId) {
    return (
      <div>
        <PageHeader
          title="Investor CRM"
          description="Investor profiles, pipeline stages, interactions, and commitments."
        />
        <EmptyState
          title="Select an organization"
          description="CRM data is organization-scoped."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Investor CRM"
        description="Pipeline transitions are validated. Not a full fundraising OS (no LP portal, capital calls, or KYC workflows)."
      />

      {pipelineQuery.data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {Object.entries(pipelineQuery.data.stages).map(([stageName, count]) => (
            <div key={stageName} className="rounded-md border border-[var(--gain-border)] px-3 py-2">
              <div className="text-[var(--gain-text-muted)]">{stageName}</div>
              <div className="text-xl font-semibold">{count}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-md border border-[var(--gain-border)] p-4 space-y-3">
          <div className="font-medium">Create investor</div>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" />
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
          <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" />
          <Button
            disabled={!displayName || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Create
          </Button>
        </div>
        <div className="rounded-md border border-[var(--gain-border)] p-4 space-y-3">
          <div className="font-medium">Advance / log activity</div>
          <Input value={investorId} onChange={(e) => setInvestorId(e.target.value)} placeholder="Investor UUID" />
          <Input
            value={String(investorVersion)}
            onChange={(e) => setInvestorVersion(Number(e.target.value) || 1)}
            placeholder="Version"
          />
          <Input value={stage} onChange={(e) => setStage(e.target.value)} placeholder="pipeline stage" />
          <Input value={noteSubject} onChange={(e) => setNoteSubject(e.target.value)} placeholder="Note subject" />
          <Input value={commitmentLabel} onChange={(e) => setCommitmentLabel(e.target.value)} placeholder="Commitment label" />
          <Input value={commitmentAmount} onChange={(e) => setCommitmentAmount(e.target.value)} placeholder="Amount (minor)" />
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!investorId || stageMutation.isPending}
              onClick={() => stageMutation.mutate()}
            >
              Update stage
            </Button>
            <Button
              variant="secondary"
              disabled={!investorId || noteMutation.isPending}
              onClick={() => noteMutation.mutate()}
            >
              Log note
            </Button>
            <Button
              variant="secondary"
              disabled={!investorId || commitmentMutation.isPending}
              onClick={() => commitmentMutation.mutate()}
            >
              Soft commit
            </Button>
          </div>
        </div>
      </div>

      {investorsQuery.isLoading ? <LoadingState /> : null}
      {investorsQuery.isError ? <ErrorState message="Failed to load investors." /> : null}

      {investorsQuery.data && investorsQuery.data.items.length === 0 ? (
        <EmptyState
          title="No investors"
          description="Create an investor, advance pipeline stage, then log notes or soft commitments."
        />
      ) : null}

      {investorsQuery.data && investorsQuery.data.items.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">Investors</h2>
          <DataTable
            columns={['Name', 'Stage', 'Status', 'Email', 'Id']}
            rows={investorsQuery.data.items.map((row) => [
              String(row.displayName),
              String(row.pipelineStage),
              String(row.status),
              String(row.email ?? '—'),
              <button
                key={String(row.id)}
                type="button"
                className="text-[var(--gain-accent)] underline"
                onClick={() => {
                  setInvestorId(String(row.id));
                  setInvestorVersion(Number(row.version) || 1);
                }}
              >
                {String(row.id).slice(0, 8)}…
              </button>,
            ])}
          />
        </div>
      ) : null}

      {commitmentsQuery.data && commitmentsQuery.data.items.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">Commitments</h2>
          <DataTable
            columns={['Label', 'Amount', 'Status', 'Investor']}
            rows={commitmentsQuery.data.items.map((row) => [
              String(row.label),
              String(row.amountMinor),
              String(row.status),
              String(row.investorId).slice(0, 8) + '…',
            ])}
          />
        </div>
      ) : null}
    </div>
  );
}
