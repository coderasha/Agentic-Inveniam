export type GraphDirection = 'out' | 'in' | 'both';

export interface TraversableEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  relationshipType: string;
}

export interface NeighborhoodResult {
  nodeIds: string[];
  edgeIds: string[];
  depthByNodeId: Record<string, number>;
}

/** BFS neighborhood expansion over an in-memory edge list (unit-testable). */
export function expandNeighborhood(
  rootNodeId: string,
  edges: TraversableEdge[],
  depth: number,
  direction: GraphDirection = 'both',
): NeighborhoodResult {
  const maxDepth = Math.max(1, Math.min(5, depth));
  const adjacency = new Map<string, Array<{ edgeId: string; neighborId: string }>>();

  const push = (from: string, to: string, edgeId: string) => {
    const list = adjacency.get(from) ?? [];
    list.push({ edgeId, neighborId: to });
    adjacency.set(from, list);
  };

  for (const edge of edges) {
    if (direction === 'out' || direction === 'both') {
      push(edge.fromNodeId, edge.toNodeId, edge.id);
    }
    if (direction === 'in' || direction === 'both') {
      push(edge.toNodeId, edge.fromNodeId, edge.id);
    }
  }

  const depthByNodeId: Record<string, number> = { [rootNodeId]: 0 };
  const edgeIds = new Set<string>();
  const queue: string[] = [rootNodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDepth = depthByNodeId[current] ?? 0;
    if (currentDepth >= maxDepth) continue;
    for (const hop of adjacency.get(current) ?? []) {
      edgeIds.add(hop.edgeId);
      if (depthByNodeId[hop.neighborId] === undefined) {
        depthByNodeId[hop.neighborId] = currentDepth + 1;
        queue.push(hop.neighborId);
      }
    }
  }

  return {
    nodeIds: Object.keys(depthByNodeId),
    edgeIds: [...edgeIds],
    depthByNodeId,
  };
}
