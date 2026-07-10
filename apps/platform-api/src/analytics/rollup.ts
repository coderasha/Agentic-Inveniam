export type OverviewCounts = {
  assets: number;
  documents: number;
  portfolios: number;
  investors: number;
  marketplaceListings: number;
  marketplaceTrades: number;
  complianceChecks: number;
  complianceChecksPassed: number;
  complianceChecksFailed: number;
  complianceFindingsOpen: number;
  trustScores: number;
  valuationRuns: number;
  valuationRunsCompleted: number;
  aiAgents: number;
  aiAgentRuns: number;
  aiAgentRunsCompleted: number;
  aiMarketplaceInstalls: number;
  workflows: number;
  provenanceRecords: number;
  graphNodes: number;
};

export type DerivedKpis = {
  compliancePassRate: number | null;
  complianceFailRate: number | null;
  valuationCompletionRate: number | null;
  aiRunCompletionRate: number | null;
  marketplaceFillIntensity: number | null;
  openFindingsPerCheck: number | null;
};

function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Number((numerator / denominator).toFixed(6));
}

/** Deterministic KPI derivation from raw overview counts. */
export function deriveAnalyticsKpis(counts: OverviewCounts): DerivedKpis {
  return {
    compliancePassRate: rate(counts.complianceChecksPassed, counts.complianceChecks),
    complianceFailRate: rate(counts.complianceChecksFailed, counts.complianceChecks),
    valuationCompletionRate: rate(counts.valuationRunsCompleted, counts.valuationRuns),
    aiRunCompletionRate: rate(counts.aiAgentRunsCompleted, counts.aiAgentRuns),
    marketplaceFillIntensity: rate(counts.marketplaceTrades, counts.marketplaceListings),
    openFindingsPerCheck: rate(counts.complianceFindingsOpen, counts.complianceChecks),
  };
}

export type SeriesPoint = { day: string; count: number };

/** Fill missing day buckets with zeros between from/to (exclusive end). */
export function fillDailySeries(
  points: SeriesPoint[],
  fromIso: string,
  toIso: string,
): SeriesPoint[] {
  const map = new Map(points.map((p) => [p.day, p.count]));
  const start = new Date(fromIso);
  const end = new Date(toIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return [];
  }
  const cursor = new Date(Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate(),
  ));
  const endDay = new Date(Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth(),
    end.getUTCDate(),
  ));
  const filled: SeriesPoint[] = [];
  while (cursor < endDay) {
    const day = cursor.toISOString().slice(0, 10);
    filled.push({ day, count: map.get(day) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return filled;
}

export function deltaMetrics(
  current: Record<string, number>,
  previous: Record<string, number>,
): Record<string, number | null> {
  const keys = new Set([...Object.keys(current), ...Object.keys(previous)]);
  const out: Record<string, number | null> = {};
  for (const key of keys) {
    const a = current[key];
    const b = previous[key];
    if (typeof a !== 'number' || typeof b !== 'number') {
      out[key] = null;
      continue;
    }
    out[key] = a - b;
  }
  return out;
}
