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

export default function AiPage() {
  const organizationId = useIdentityStore((s) => s.organizationId);
  const qc = useQueryClient();
  const [name, setName] = useState('Readiness analyst');
  const [slug, setSlug] = useState('readiness-analyst');
  const [systemPrompt, setSystemPrompt] = useState(
    'You help operators assess private-asset readiness across trust, provenance, and compliance.',
  );
  const [agentId, setAgentId] = useState('');
  const [conversationId, setConversationId] = useState('');
  const [message, setMessage] = useState('How does trust scoring work?');
  const [runPrompt, setRunPrompt] = useState('Assess this subject for readiness');
  const [runInput, setRunInput] = useState(
    '{"name":"Tower A","trustScore":0.4,"status":"draft"}',
  );

  const agentsQuery = useQuery({
    queryKey: ['ai-agents', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => platformApi.listAiAgents(organizationId!),
  });
  const conversationsQuery = useQuery({
    queryKey: ['ai-conversations', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => platformApi.listAiConversations(organizationId!),
  });
  const runsQuery = useQuery({
    queryKey: ['ai-runs', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => platformApi.listAiRuns(organizationId!),
  });
  const conversationQuery = useQuery({
    queryKey: ['ai-conversation', organizationId, conversationId],
    enabled: Boolean(organizationId && conversationId),
    queryFn: () => platformApi.getAiConversation(organizationId!, conversationId),
  });

  const createAgentMutation = useMutation({
    mutationFn: () =>
      platformApi.createAiAgent(organizationId!, {
        name,
        slug,
        systemPrompt,
        provider: 'heuristic',
        model: 'gain-heuristic-v1',
        tools: ['extract_fields', 'risk_flags', 'compliance_hint', 'summarize'],
      }),
    onSuccess: (agent) => {
      setAgentId(String(agent.id));
      void qc.invalidateQueries({ queryKey: ['ai-agents', organizationId] });
    },
  });

  const activateAgentMutation = useMutation({
    mutationFn: () => {
      const agent = agentsQuery.data?.items.find((item) => item.id === agentId);
      if (!agent) throw new Error('Select an agent first');
      return platformApi.updateAiAgent(organizationId!, agentId, {
        version: agent.version,
        status: 'active',
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ai-agents', organizationId] }),
  });

  const createConversationMutation = useMutation({
    mutationFn: () =>
      platformApi.createAiConversation(organizationId!, {
        title: 'Operator chat',
        agentId: agentId || undefined,
      }),
    onSuccess: (conversation) => {
      setConversationId(String(conversation.id));
      void qc.invalidateQueries({ queryKey: ['ai-conversations', organizationId] });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: () =>
      platformApi.createAiMessage(organizationId!, {
        conversationId,
        content: message,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai-conversation', organizationId, conversationId] });
      void qc.invalidateQueries({ queryKey: ['ai-conversations', organizationId] });
    },
  });

  const runAgentMutation = useMutation({
    mutationFn: () => {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(runInput) as Record<string, unknown>;
      } catch {
        throw new Error('Run input must be valid JSON');
      }
      return platformApi.runAiAgent(organizationId!, agentId, {
        prompt: runPrompt,
        input: parsed,
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ai-runs', organizationId] }),
  });

  if (!organizationId) {
    return (
      <div>
        <PageHeader
          title="AI Chat & Agents"
          description="Conversations and deterministic agent runs for private-asset operations."
        />
        <EmptyState
          title="Select an organization"
          description="AI data is organization-scoped."
        />
      </div>
    );
  }

  const messages = Array.isArray(conversationQuery.data?.messages)
    ? (conversationQuery.data.messages as Array<Record<string, unknown>>)
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Chat & Agents"
        description="Default provider is heuristic (local, no fake OpenAI success). Set OPENAI_API_KEY on platform-api to enable provider=openai."
      />

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-md border border-[var(--gain-border)] p-4 space-y-3">
          <div className="font-medium">Create agent</div>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="slug" />
          <Input
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="System prompt"
          />
          <Button
            onClick={() => createAgentMutation.mutate()}
            disabled={createAgentMutation.isPending}
          >
            Create agent
          </Button>
          {createAgentMutation.isError && (
            <div className="text-sm text-red-600">{String(createAgentMutation.error)}</div>
          )}
        </div>

        <div className="rounded-md border border-[var(--gain-border)] p-4 space-y-3">
          <div className="font-medium">Chat</div>
          <Input
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            placeholder="Agent id (optional)"
          />
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="secondary"
              onClick={() => activateAgentMutation.mutate()}
              disabled={!agentId || activateAgentMutation.isPending}
            >
              Activate agent
            </Button>
            <Button
              onClick={() => createConversationMutation.mutate()}
              disabled={createConversationMutation.isPending}
            >
              New conversation
            </Button>
          </div>
          <Input
            value={conversationId}
            onChange={(e) => setConversationId(e.target.value)}
            placeholder="Conversation id"
          />
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Message"
          />
          <Button
            onClick={() => sendMessageMutation.mutate()}
            disabled={!conversationId || sendMessageMutation.isPending}
          >
            Send message
          </Button>
          {sendMessageMutation.isError && (
            <div className="text-sm text-red-600">{String(sendMessageMutation.error)}</div>
          )}
        </div>
      </div>

      <div className="rounded-md border border-[var(--gain-border)] p-4 space-y-3">
        <div className="font-medium">Run agent</div>
        <Input
          value={runPrompt}
          onChange={(e) => setRunPrompt(e.target.value)}
          placeholder="Prompt"
        />
        <Input
          value={runInput}
          onChange={(e) => setRunInput(e.target.value)}
          placeholder='Input JSON e.g. {"trustScore":0.4}'
        />
        <Button
          onClick={() => runAgentMutation.mutate()}
          disabled={!agentId || runAgentMutation.isPending}
        >
          Execute run
        </Button>
        {runAgentMutation.isError && (
          <div className="text-sm text-red-600">{String(runAgentMutation.error)}</div>
        )}
        {runAgentMutation.data && (
          <pre className="text-xs overflow-auto max-h-48 bg-[var(--gain-surface)] p-2 rounded">
            {JSON.stringify(runAgentMutation.data, null, 2)}
          </pre>
        )}
      </div>

      {conversationId && (
        <div className="rounded-md border border-[var(--gain-border)] p-4 space-y-2">
          <div className="font-medium">Conversation thread</div>
          {conversationQuery.isLoading && <LoadingState />}
          {conversationQuery.isError && (
            <ErrorState message="Failed to load conversation." />
          )}
          {messages.map((item) => (
            <div key={String(item.id)} className="text-sm border-b border-[var(--gain-border)] py-2">
              <span className="font-mono text-xs uppercase opacity-70">{String(item.role)}</span>
              <div>{String(item.content)}</div>
            </div>
          ))}
          {!conversationQuery.isLoading && messages.length === 0 && (
            <EmptyState title="No messages yet" description="Send a message to start." />
          )}
        </div>
      )}

      {agentsQuery.isLoading || conversationsQuery.isLoading || runsQuery.isLoading ? (
        <LoadingState />
      ) : null}
      {agentsQuery.isError || conversationsQuery.isError || runsQuery.isError ? (
        <ErrorState message="Failed to load AI data." />
      ) : null}

      {agentsQuery.data && agentsQuery.data.items.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">Agents ({agentsQuery.data.total})</h2>
          <DataTable
            columns={['Name', 'Slug', 'Status', 'Provider', 'Id']}
            rows={agentsQuery.data.items.map((item) => [
              String(item.name),
              String(item.slug),
              String(item.status),
              String(item.provider),
              <button
                key={String(item.id)}
                type="button"
                className="text-[var(--gain-accent)] underline"
                onClick={() => setAgentId(String(item.id))}
              >
                {String(item.id).slice(0, 8)}…
              </button>,
            ])}
          />
        </div>
      ) : null}

      {conversationsQuery.data && conversationsQuery.data.items.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">
            Conversations ({conversationsQuery.data.total})
          </h2>
          <DataTable
            columns={['Title', 'Agent', 'Id']}
            rows={conversationsQuery.data.items.map((item) => [
              String(item.title),
              String(item.agentId ?? '—'),
              <button
                key={String(item.id)}
                type="button"
                className="text-[var(--gain-accent)] underline"
                onClick={() => setConversationId(String(item.id))}
              >
                {String(item.id).slice(0, 8)}…
              </button>,
            ])}
          />
        </div>
      ) : null}

      {runsQuery.data && runsQuery.data.items.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">Runs ({runsQuery.data.total})</h2>
          <DataTable
            columns={['Status', 'Provider', 'Agent', 'Id']}
            rows={runsQuery.data.items.map((item) => [
              String(item.status),
              String(item.provider),
              String(item.agentId),
              String(item.id).slice(0, 8) + '…',
            ])}
          />
        </div>
      ) : null}
    </div>
  );
}
