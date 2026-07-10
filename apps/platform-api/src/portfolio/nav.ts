export interface PositionNavInput {
  id: string;
  label: string;
  subjectType: string;
  quantity: number;
  costBasisMinor: bigint;
  marketValueMinor: bigint;
}

export interface PortfolioNavResult {
  navMinor: bigint;
  costBasisMinor: bigint;
  unrealizedPnlMinor: bigint;
  positionCount: number;
  weights: Array<{
    positionId: string;
    label: string;
    subjectType: string;
    marketValueMinor: bigint;
    weight: number;
  }>;
}

/** Deterministic NAV aggregation from marked positions. */
export function computePortfolioNav(positions: PositionNavInput[]): PortfolioNavResult {
  const active = positions.filter((p) => p.quantity !== 0 || p.marketValueMinor !== 0n);
  let nav = 0n;
  let cost = 0n;
  for (const position of active) {
    nav += position.marketValueMinor;
    cost += position.costBasisMinor;
  }
  const weights = active.map((position) => ({
    positionId: position.id,
    label: position.label,
    subjectType: position.subjectType,
    marketValueMinor: position.marketValueMinor,
    weight: nav === 0n ? 0 : Number(position.marketValueMinor) / Number(nav),
  }));
  return {
    navMinor: nav,
    costBasisMinor: cost,
    unrealizedPnlMinor: nav - cost,
    positionCount: active.length,
    weights,
  };
}

/** Resolve market value: explicit mark wins, else cost basis, else 0. */
export function resolveMarketValueMinor(input: {
  marketValueMinor?: bigint | null;
  costBasisMinor: bigint;
  latestAssetValuationMinor?: bigint | null;
}): bigint {
  if (input.marketValueMinor != null) return input.marketValueMinor;
  if (input.latestAssetValuationMinor != null) return input.latestAssetValuationMinor;
  return input.costBasisMinor;
}
