import { describe, expect, it } from 'vitest';
import { expandNeighborhood } from './traversal';

describe('expandNeighborhood', () => {
  const edges = [
    { id: 'e1', fromNodeId: 'a', toNodeId: 'b', relationshipType: 'owns' },
    { id: 'e2', fromNodeId: 'b', toNodeId: 'c', relationshipType: 'depends_on' },
    { id: 'e3', fromNodeId: 'a', toNodeId: 'd', relationshipType: 'related_to' },
    { id: 'e4', fromNodeId: 'x', toNodeId: 'y', relationshipType: 'isolated' },
  ];

  it('returns only the root at depth 0 effectively when depth is 1 for direct neighbors', () => {
    const result = expandNeighborhood('a', edges, 1, 'out');
    expect(result.nodeIds.sort()).toEqual(['a', 'b', 'd']);
    expect(result.edgeIds.sort()).toEqual(['e1', 'e3']);
    expect(result.depthByNodeId.b).toBe(1);
  });

  it('walks two hops outbound', () => {
    const result = expandNeighborhood('a', edges, 2, 'out');
    expect(result.nodeIds.sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(result.depthByNodeId.c).toBe(2);
    expect(result.edgeIds).toContain('e2');
  });

  it('supports inbound direction', () => {
    const result = expandNeighborhood('c', edges, 2, 'in');
    expect(result.nodeIds.sort()).toEqual(['a', 'b', 'c']);
  });

  it('does not leak disconnected components', () => {
    const result = expandNeighborhood('a', edges, 5, 'both');
    expect(result.nodeIds).not.toContain('x');
    expect(result.nodeIds).not.toContain('y');
  });
});
