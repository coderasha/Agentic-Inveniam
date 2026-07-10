'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { platformApi } from '@/lib/platform-api';
import { useIdentityStore } from '@/stores/identity-store';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/components/ui/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type GraphNode = {
  id: string;
  kind: string;
  label: string;
};

type GraphEdge = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  relationshipType: string;
  source?: string;
};

const KIND_COLOR: Record<string, string> = {
  twin: '#3d8bfd',
  document: '#46c2a3',
  asset: '#e0a458',
  organization: '#9b8afb',
  user: '#f07178',
  workflow: '#7ec8e3',
  claim: '#d4a5a5',
  external: '#8b9bb4',
  custom: '#c3c7d1',
};

export default function KnowledgeGraphPage() {
  const organizationId = useIdentityStore((s) => s.organizationId);
  const queryClient = useQueryClient();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState('custom');
  const [fromNodeId, setFromNodeId] = useState('');
  const [toNodeId, setToNodeId] = useState('');
  const [relationshipType, setRelationshipType] = useState('related_to');

  const statsQuery = useQuery({
    queryKey: ['graph-stats', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => platformApi.graphStats(organizationId!),
  });

  const subgraphQuery = useQuery({
    queryKey: ['graph-subgraph', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => platformApi.graphSubgraph(organizationId!),
  });

  const neighborhoodQuery = useQuery({
    queryKey: ['graph-neighborhood', organizationId, selectedNodeId],
    enabled: Boolean(organizationId && selectedNodeId),
    queryFn: () => platformApi.graphNeighborhood(organizationId!, selectedNodeId!, 2),
  });

  const syncMutation = useMutation({
    mutationFn: () => platformApi.graphSync(organizationId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['graph-stats', organizationId] });
      await queryClient.invalidateQueries({ queryKey: ['graph-subgraph', organizationId] });
    },
  });

  const createNodeMutation = useMutation({
    mutationFn: () =>
      platformApi.createGraphNode(organizationId!, { kind, label }),
    onSuccess: async () => {
      setLabel('');
      await queryClient.invalidateQueries({ queryKey: ['graph-subgraph', organizationId] });
      await queryClient.invalidateQueries({ queryKey: ['graph-stats', organizationId] });
    },
  });

  const createEdgeMutation = useMutation({
    mutationFn: () =>
      platformApi.createGraphEdge(organizationId!, {
        fromNodeId,
        toNodeId,
        relationshipType,
      }),
    onSuccess: async () => {
      setFromNodeId('');
      setToNodeId('');
      await queryClient.invalidateQueries({ queryKey: ['graph-subgraph', organizationId] });
      await queryClient.invalidateQueries({ queryKey: ['graph-stats', organizationId] });
    },
  });

  const nodes = (subgraphQuery.data?.nodes ?? []) as GraphNode[];
  const edges = (subgraphQuery.data?.edges ?? []) as GraphEdge[];

  const layout = useMemo(() => {
    const width = 720;
    const height = 420;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.38;
    const positions = new Map<string, { x: number; y: number }>();
    nodes.forEach((node, index) => {
      const angle = (2 * Math.PI * index) / Math.max(nodes.length, 1) - Math.PI / 2;
      positions.set(node.id, {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      });
    });
    return { width, height, positions };
  }, [nodes]);

  const focusEdgeIds = new Set(
    ((neighborhoodQuery.data?.edges ?? []) as GraphEdge[]).map((e) => e.id),
  );
  const focusNodeIds = new Set(
    ((neighborhoodQuery.data?.nodes ?? []) as GraphNode[]).map((n) => n.id),
  );

  if (!organizationId) {
    return (
      <div>
        <PageHeader
          title="Knowledge Graph"
          description="Cross-domain entity graph for twins, documents, assets, and claims."
        />
        <EmptyState
          title="Select an organization"
          description="Graph views are scoped to an organization."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Knowledge Graph"
        description="Postgres-backed heterogeneous graph. Sync projects twin relationships, document links, and asset↔twin bridges."
        action={
          <Button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            {syncMutation.isPending ? 'Syncing…' : 'Sync from domains'}
          </Button>
        }
      />

      {statsQuery.isLoading || subgraphQuery.isLoading ? <LoadingState /> : null}
      {statsQuery.isError || subgraphQuery.isError ? (
        <ErrorState message="Failed to load knowledge graph." />
      ) : null}

      {statsQuery.data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="rounded-md border border-[var(--gain-border)] px-3 py-2">
            <div className="text-[var(--gain-text-muted)]">Nodes</div>
            <div className="text-xl font-semibold">{statsQuery.data.nodeCount}</div>
          </div>
          <div className="rounded-md border border-[var(--gain-border)] px-3 py-2">
            <div className="text-[var(--gain-text-muted)]">Edges</div>
            <div className="text-xl font-semibold">{statsQuery.data.edgeCount}</div>
          </div>
          <div className="rounded-md border border-[var(--gain-border)] px-3 py-2 col-span-2">
            <div className="text-[var(--gain-text-muted)]">By kind</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {Object.entries(statsQuery.data.byKind).map(([k, count]) => (
                <span key={k} className="text-xs text-[var(--gain-text-muted)]">
                  {k}: {count}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {nodes.length === 0 && !subgraphQuery.isLoading ? (
        <EmptyState
          title="Graph is empty"
          description="Run Sync from domains after creating twins, documents, or assets — or add a custom node below."
        />
      ) : (
        <div className="rounded-md border border-[var(--gain-border)] bg-[rgba(12,18,32,0.55)] overflow-hidden">
          <svg
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            className="w-full h-[420px]"
            role="img"
            aria-label="Knowledge graph visualization"
          >
            {edges.map((edge) => {
              const from = layout.positions.get(edge.fromNodeId);
              const to = layout.positions.get(edge.toNodeId);
              if (!from || !to) return null;
              const active = !selectedNodeId || focusEdgeIds.has(edge.id);
              return (
                <g key={edge.id}>
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={active ? 'rgba(61,139,253,0.55)' : 'rgba(120,130,150,0.15)'}
                    strokeWidth={active ? 1.5 : 1}
                  />
                  <text
                    x={(from.x + to.x) / 2}
                    y={(from.y + to.y) / 2 - 4}
                    fill="rgba(180,190,210,0.7)"
                    fontSize="9"
                    textAnchor="middle"
                  >
                    {edge.relationshipType}
                  </text>
                </g>
              );
            })}
            {nodes.map((node) => {
              const pos = layout.positions.get(node.id);
              if (!pos) return null;
              const active = !selectedNodeId || focusNodeIds.has(node.id) || selectedNodeId === node.id;
              return (
                <g
                  key={node.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() =>
                    setSelectedNodeId((current) => (current === node.id ? null : node.id))
                  }
                >
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={selectedNodeId === node.id ? 14 : 11}
                    fill={KIND_COLOR[node.kind] ?? KIND_COLOR.custom}
                    opacity={active ? 1 : 0.25}
                  />
                  <text
                    x={pos.x}
                    y={pos.y + 24}
                    fill="rgba(230,235,245,0.9)"
                    fontSize="10"
                    textAnchor="middle"
                  >
                    {node.label.slice(0, 22)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {selectedNodeId ? (
        <div className="text-sm text-[var(--gain-text-muted)]">
          Neighborhood focus: {selectedNodeId.slice(0, 8)}… depth 2
          {neighborhoodQuery.data
            ? ` · ${neighborhoodQuery.data.nodes.length} nodes · ${neighborhoodQuery.data.edges.length} edges`
            : null}
        </div>
      ) : null}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-md border border-[var(--gain-border)] p-4 space-y-3">
          <div className="font-medium">Add custom node</div>
          <Input
            placeholder="Label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <Input
            placeholder="Kind (custom, claim, external…)"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          />
          <Button
            disabled={!label || createNodeMutation.isPending}
            onClick={() => createNodeMutation.mutate()}
          >
            Create node
          </Button>
        </div>
        <div className="rounded-md border border-[var(--gain-border)] p-4 space-y-3">
          <div className="font-medium">Add manual edge</div>
          <Input
            placeholder="From node id"
            value={fromNodeId}
            onChange={(e) => setFromNodeId(e.target.value)}
          />
          <Input
            placeholder="To node id"
            value={toNodeId}
            onChange={(e) => setToNodeId(e.target.value)}
          />
          <Input
            placeholder="Relationship type"
            value={relationshipType}
            onChange={(e) => setRelationshipType(e.target.value)}
          />
          <Button
            disabled={!fromNodeId || !toNodeId || createEdgeMutation.isPending}
            onClick={() => createEdgeMutation.mutate()}
          >
            Create edge
          </Button>
        </div>
      </div>
    </div>
  );
}
