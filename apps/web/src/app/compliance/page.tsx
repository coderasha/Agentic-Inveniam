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

export default function CompliancePage() {
  const organizationId = useIdentityStore((s) => s.organizationId);
  const qc = useQueryClient();
  const [name, setName] = useState('Asset readiness');
  const [slug, setSlug] = useState('asset-readiness');
  const [policyId, setPolicyId] = useState('');
  const [subjectId, setSubjectId] = useState('00000000-0000-4000-8000-000000000001');
  const [subjectName, setSubjectName] = useState('');
  const [trustScore, setTrustScore] = useState('0.5');
  const [checkId, setCheckId] = useState('');

  const policiesQuery = useQuery({
    queryKey: ['compliance-policies', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => platformApi.listCompliancePolicies(organizationId!),
  });
  const checksQuery = useQuery({
    queryKey: ['compliance-checks', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => platformApi.listComplianceChecks(organizationId!),
  });
  const findingsQuery = useQuery({
    queryKey: ['compliance-findings', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => platformApi.listComplianceFindings(organizationId!),
  });
  const casesQuery = useQuery({
    queryKey: ['compliance-cases', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => platformApi.listComplianceCases(organizationId!),
  });

  const createPolicyMutation = useMutation({
    mutationFn: () =>
      platformApi.createCompliancePolicy(organizationId!, {
        name,
        slug,
        subjectType: 'asset',
        rules: [
          {
            id: 'name-required',
            type: 'required_field',
            severity: 'high',
            message: 'Asset name is required',
            field: 'name',
          },
          {
            id: 'min-trust',
            type: 'min_trust_score',
            severity: 'medium',
            message: 'Trust score below threshold',
            field: 'trustScore',
            value: 0.7,
          },
          {
            id: 'no-draft',
            type: 'forbidden_status',
            severity: 'high',
            message: 'Draft assets cannot pass readiness',
            field: 'status',
            value: 'draft',
          },
        ],
      }),
    onSuccess: async (row) => {
      setPolicyId(String(row.id));
      await qc.invalidateQueries({ queryKey: ['compliance-policies', organizationId] });
    },
  });

  const runCheckMutation = useMutation({
    mutationFn: () =>
      platformApi.runComplianceCheck(organizationId!, {
        policyId,
        subjectType: 'asset',
        subjectId,
        subjectSnapshot: {
          name: subjectName,
          trustScore: Number(trustScore),
          status: subjectName ? 'active' : 'draft',
          tags: [],
          verifiedProvenanceCount: 0,
        },
      }),
    onSuccess: async (row) => {
      setCheckId(String(row.id));
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['compliance-checks', organizationId] }),
        qc.invalidateQueries({ queryKey: ['compliance-findings', organizationId] }),
      ]);
    },
  });

  const caseMutation = useMutation({
    mutationFn: () =>
      platformApi.createComplianceCase(organizationId!, {
        checkId,
        title: `Remediate check ${checkId.slice(0, 8)}`,
        assigneeRef: 'compliance-officer',
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['compliance-cases', organizationId] });
    },
  });

  if (!organizationId) {
    return (
      <div>
        <PageHeader
          title="Compliance"
          description="Policies, deterministic checks, findings, and remediation cases."
        />
        <EmptyState
          title="Select an organization"
          description="Compliance data is organization-scoped."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compliance"
        description="Rule engine evaluates subject snapshots. Not a full RegTech suite (no regulator filing, screening lists, or automated evidence collection)."
      />

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-md border border-[var(--gain-border)] p-4 space-y-3">
          <div className="font-medium">Create policy</div>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="slug" />
          <Button
            disabled={!name || !slug || createPolicyMutation.isPending}
            onClick={() => createPolicyMutation.mutate()}
          >
            Create asset readiness policy
          </Button>
        </div>
        <div className="rounded-md border border-[var(--gain-border)] p-4 space-y-3">
          <div className="font-medium">Run check</div>
          <Input value={policyId} onChange={(e) => setPolicyId(e.target.value)} placeholder="Policy UUID" />
          <Input value={subjectId} onChange={(e) => setSubjectId(e.target.value)} placeholder="Subject UUID" />
          <Input value={subjectName} onChange={(e) => setSubjectName(e.target.value)} placeholder="Subject name (empty fails required_field)" />
          <Input value={trustScore} onChange={(e) => setTrustScore(e.target.value)} placeholder="Trust score" />
          <div className="flex gap-2">
            <Button
              disabled={!policyId || runCheckMutation.isPending}
              onClick={() => runCheckMutation.mutate()}
            >
              Run check
            </Button>
            <Button
              variant="secondary"
              disabled={!checkId || caseMutation.isPending}
              onClick={() => caseMutation.mutate()}
            >
              Open case
            </Button>
          </div>
        </div>
      </div>

      {policiesQuery.isLoading ? <LoadingState /> : null}
      {policiesQuery.isError ? <ErrorState message="Failed to load compliance data." /> : null}

      {policiesQuery.data && policiesQuery.data.items.length === 0 ? (
        <EmptyState
          title="No policies"
          description="Create a policy, run a check against a subject snapshot, then open a remediation case if needed."
        />
      ) : null}

      {policiesQuery.data && policiesQuery.data.items.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">Policies</h2>
          <DataTable
            columns={['Name', 'Subject', 'Status', 'Id']}
            rows={policiesQuery.data.items.map((row) => [
              String(row.name),
              String(row.subjectType),
              String(row.status),
              <button
                key={String(row.id)}
                type="button"
                className="text-[var(--gain-accent)] underline"
                onClick={() => setPolicyId(String(row.id))}
              >
                {String(row.id).slice(0, 8)}…
              </button>,
            ])}
          />
        </div>
      ) : null}

      {checksQuery.data && checksQuery.data.items.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">Checks</h2>
          <DataTable
            columns={['Status', 'Summary', 'Id']}
            rows={checksQuery.data.items.map((row) => [
              String(row.status),
              String(row.summary),
              <button
                key={String(row.id)}
                type="button"
                className="text-[var(--gain-accent)] underline"
                onClick={() => setCheckId(String(row.id))}
              >
                {String(row.id).slice(0, 8)}…
              </button>,
            ])}
          />
        </div>
      ) : null}

      {findingsQuery.data && findingsQuery.data.items.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">Findings</h2>
          <DataTable
            columns={['Severity', 'Status', 'Message']}
            rows={findingsQuery.data.items.map((row) => [
              String(row.severity),
              String(row.status),
              String(row.message),
            ])}
          />
        </div>
      ) : null}

      {casesQuery.data && casesQuery.data.items.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">Cases</h2>
          <DataTable
            columns={['Title', 'Status', 'Assignee']}
            rows={casesQuery.data.items.map((row) => [
              String(row.title),
              String(row.status),
              String(row.assigneeRef ?? '—'),
            ])}
          />
        </div>
      ) : null}
    </div>
  );
}
