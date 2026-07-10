import { createHash } from 'node:crypto';

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Deterministic chain hash: H(previousHash|contentHash|subjectType|subjectId|capturedAtIso). */
export function computeChainHash(input: {
  previousHash: string | null;
  contentHash: string;
  subjectType: string;
  subjectId: string;
  capturedAtIso: string;
}): string {
  const prev = input.previousHash ?? 'genesis';
  return sha256Hex(
    `${prev}|${input.contentHash}|${input.subjectType}|${input.subjectId}|${input.capturedAtIso}`,
  );
}

export interface ChainNode {
  id: string;
  previousRecordId: string | null;
  previousHash: string | null;
  contentHash: string;
  chainHash: string;
  subjectType: string;
  subjectId: string;
  capturedAt: string;
}

export function verifyChainIntegrity(nodesOldestFirst: ChainNode[]): {
  valid: boolean;
  brokenAtId?: string;
  reason?: string;
} {
  for (let i = 0; i < nodesOldestFirst.length; i += 1) {
    const node = nodesOldestFirst[i]!;
    const expectedPrev = i === 0 ? null : nodesOldestFirst[i - 1]!.id;
    if ((node.previousRecordId ?? null) !== expectedPrev) {
      return {
        valid: false,
        brokenAtId: node.id,
        reason: 'previousRecordId does not match chain order',
      };
    }
    const expectedPrevHash = i === 0 ? null : nodesOldestFirst[i - 1]!.chainHash;
    if ((node.previousHash ?? null) !== expectedPrevHash) {
      return {
        valid: false,
        brokenAtId: node.id,
        reason: 'previousHash does not match prior chainHash',
      };
    }
    const expected = computeChainHash({
      previousHash: node.previousHash,
      contentHash: node.contentHash,
      subjectType: node.subjectType,
      subjectId: node.subjectId,
      capturedAtIso: node.capturedAt,
    });
    if (expected !== node.chainHash) {
      return {
        valid: false,
        brokenAtId: node.id,
        reason: 'chainHash mismatch',
      };
    }
  }
  return { valid: true };
}

export function walkLineageIds(
  rootId: string,
  links: Array<{ fromRecordId: string; toRecordId: string }>,
  direction: 'ancestors' | 'descendants' | 'both',
  maxDepth = 8,
): string[] {
  const outbound = new Map<string, string[]>();
  const inbound = new Map<string, string[]>();
  for (const link of links) {
    const out = outbound.get(link.fromRecordId) ?? [];
    out.push(link.toRecordId);
    outbound.set(link.fromRecordId, out);
    const inn = inbound.get(link.toRecordId) ?? [];
    inn.push(link.fromRecordId);
    inbound.set(link.toRecordId, inn);
  }

  const seen = new Set<string>([rootId]);
  const queue: Array<{ id: string; depth: number }> = [{ id: rootId, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= maxDepth) continue;
    const nextIds: string[] = [];
    if (direction === 'descendants' || direction === 'both') {
      nextIds.push(...(outbound.get(current.id) ?? []));
    }
    if (direction === 'ancestors' || direction === 'both') {
      nextIds.push(...(inbound.get(current.id) ?? []));
    }
    for (const id of nextIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      queue.push({ id, depth: current.depth + 1 });
    }
  }

  return [...seen];
}
