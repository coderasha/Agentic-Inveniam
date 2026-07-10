import { describe, expect, it } from 'vitest';
import { computeTrustScore, gradeFromScore } from './scoring';

describe('trust scoring', () => {
  it('grades thresholds', () => {
    expect(gradeFromScore(0.9)).toBe('A');
    expect(gradeFromScore(0.72)).toBe('B');
    expect(gradeFromScore(0.56)).toBe('C');
    expect(gradeFromScore(0.45)).toBe('D');
    expect(gradeFromScore(0.2)).toBe('F');
  });

  it('raises score with verified provenance and strong attestations', () => {
    const weak = computeTrustScore({ attestations: [], provenance: [], anchors: [] });
    const strong = computeTrustScore({
      attestations: [
        { confidence: 0.95, weight: 1, status: 'active', kind: 'data_quality' },
        { confidence: 0.9, weight: 1, status: 'active', kind: 'legal' },
      ],
      provenance: [
        { status: 'verified', confidence: 0.95 },
        { status: 'verified', confidence: 0.9 },
      ],
      anchors: [{ status: 'anchored' }],
    });
    expect(strong.score).toBeGreaterThan(weak.score);
    expect(strong.grade).not.toBe('F');
  });

  it('ignores expired and revoked attestations', () => {
    const result = computeTrustScore({
      nowIso: '2026-07-11T00:00:00.000Z',
      attestations: [
        {
          confidence: 0.99,
          weight: 1,
          status: 'active',
          kind: 'legal',
          expiresAt: '2020-01-01T00:00:00.000Z',
        },
        { confidence: 0.99, weight: 1, status: 'revoked', kind: 'legal' },
      ],
      provenance: [],
      anchors: [],
    });
    expect(result.components.activeAttestations).toBe(0);
  });
});
