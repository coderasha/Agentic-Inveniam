import { describe, expect, it } from 'vitest';
import {
  deltaMetrics,
  deriveAnalyticsKpis,
  fillDailySeries,
  type OverviewCounts,
} from './rollup';

const base: OverviewCounts = {
  assets: 10,
  documents: 5,
  portfolios: 2,
  investors: 8,
  marketplaceListings: 4,
  marketplaceTrades: 2,
  complianceChecks: 10,
  complianceChecksPassed: 7,
  complianceChecksFailed: 2,
  complianceFindingsOpen: 3,
  trustScores: 6,
  valuationRuns: 5,
  valuationRunsCompleted: 4,
  aiAgents: 3,
  aiAgentRuns: 10,
  aiAgentRunsCompleted: 9,
  aiMarketplaceInstalls: 1,
  workflows: 2,
  provenanceRecords: 12,
  graphNodes: 20,
};

describe('analytics rollup', () => {
  it('derives rates from overview counts', () => {
    const derived = deriveAnalyticsKpis(base);
    expect(derived.compliancePassRate).toBe(0.7);
    expect(derived.complianceFailRate).toBe(0.2);
    expect(derived.valuationCompletionRate).toBe(0.8);
    expect(derived.aiRunCompletionRate).toBe(0.9);
    expect(derived.marketplaceFillIntensity).toBe(0.5);
    expect(derived.openFindingsPerCheck).toBe(0.3);
  });

  it('returns null rates when denominator is zero', () => {
    const derived = deriveAnalyticsKpis({ ...base, complianceChecks: 0, marketplaceListings: 0 });
    expect(derived.compliancePassRate).toBeNull();
    expect(derived.marketplaceFillIntensity).toBeNull();
  });

  it('fills missing daily buckets with zeros', () => {
    const filled = fillDailySeries(
      [{ day: '2026-07-02', count: 3 }],
      '2026-07-01T00:00:00.000Z',
      '2026-07-04T00:00:00.000Z',
    );
    expect(filled).toEqual([
      { day: '2026-07-01', count: 0 },
      { day: '2026-07-02', count: 3 },
      { day: '2026-07-03', count: 0 },
    ]);
  });

  it('computes metric deltas between snapshots', () => {
    expect(deltaMetrics({ assets: 12, documents: 5 }, { assets: 10, documents: 5 })).toEqual({
      assets: 2,
      documents: 0,
    });
  });
});
