import { describe, expect, it } from 'vitest';
import {
  computeChainHash,
  verifyChainIntegrity,
  walkLineageIds,
} from './chain';

describe('provenance chain', () => {
  it('computes stable chain hashes', () => {
    const a = computeChainHash({
      previousHash: null,
      contentHash: 'a'.repeat(64),
      subjectType: 'document',
      subjectId: '11111111-1111-1111-1111-111111111111',
      capturedAtIso: '2026-07-11T00:00:00.000Z',
    });
    const b = computeChainHash({
      previousHash: null,
      contentHash: 'a'.repeat(64),
      subjectType: 'document',
      subjectId: '11111111-1111-1111-1111-111111111111',
      capturedAtIso: '2026-07-11T00:00:00.000Z',
    });
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('validates an intact chain', () => {
    const capturedAt = '2026-07-11T00:00:00.000Z';
    const firstHash = computeChainHash({
      previousHash: null,
      contentHash: 'b'.repeat(64),
      subjectType: 'twin',
      subjectId: '22222222-2222-2222-2222-222222222222',
      capturedAtIso: capturedAt,
    });
    const secondHash = computeChainHash({
      previousHash: firstHash,
      contentHash: 'c'.repeat(64),
      subjectType: 'twin',
      subjectId: '22222222-2222-2222-2222-222222222222',
      capturedAtIso: capturedAt,
    });
    const result = verifyChainIntegrity([
      {
        id: 'r1',
        previousRecordId: null,
        previousHash: null,
        contentHash: 'b'.repeat(64),
        chainHash: firstHash,
        subjectType: 'twin',
        subjectId: '22222222-2222-2222-2222-222222222222',
        capturedAt,
      },
      {
        id: 'r2',
        previousRecordId: 'r1',
        previousHash: firstHash,
        contentHash: 'c'.repeat(64),
        chainHash: secondHash,
        subjectType: 'twin',
        subjectId: '22222222-2222-2222-2222-222222222222',
        capturedAt,
      },
    ]);
    expect(result.valid).toBe(true);
  });

  it('detects tampered chain hash', () => {
    const capturedAt = '2026-07-11T00:00:00.000Z';
    const firstHash = computeChainHash({
      previousHash: null,
      contentHash: 'd'.repeat(64),
      subjectType: 'asset',
      subjectId: '33333333-3333-3333-3333-333333333333',
      capturedAtIso: capturedAt,
    });
    const result = verifyChainIntegrity([
      {
        id: 'r1',
        previousRecordId: null,
        previousHash: null,
        contentHash: 'd'.repeat(64),
        chainHash: 'e'.repeat(64),
        subjectType: 'asset',
        subjectId: '33333333-3333-3333-3333-333333333333',
        capturedAt,
      },
    ]);
    expect(result.valid).toBe(false);
    expect(result.brokenAtId).toBe('r1');
    expect(firstHash).not.toBe('e'.repeat(64));
  });

  it('walks lineage across links', () => {
    const ids = walkLineageIds(
      'a',
      [
        { fromRecordId: 'a', toRecordId: 'b' },
        { fromRecordId: 'b', toRecordId: 'c' },
        { fromRecordId: 'x', toRecordId: 'y' },
      ],
      'descendants',
      5,
    );
    expect(ids.sort()).toEqual(['a', 'b', 'c']);
  });
});
