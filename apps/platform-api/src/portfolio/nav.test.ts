import { describe, expect, it } from 'vitest';
import { computePortfolioNav, resolveMarketValueMinor } from './nav';

describe('portfolio NAV', () => {
  it('aggregates NAV, cost, and weights', () => {
    const result = computePortfolioNav([
      {
        id: '1',
        label: 'A',
        subjectType: 'asset',
        quantity: 1,
        costBasisMinor: 100_00n,
        marketValueMinor: 120_00n,
      },
      {
        id: '2',
        label: 'B',
        subjectType: 'twin',
        quantity: 1,
        costBasisMinor: 80_00n,
        marketValueMinor: 80_00n,
      },
    ]);
    expect(result.navMinor).toBe(200_00n);
    expect(result.costBasisMinor).toBe(180_00n);
    expect(result.unrealizedPnlMinor).toBe(20_00n);
    expect(result.weights[0]?.weight).toBeCloseTo(0.6, 5);
    expect(result.weights[1]?.weight).toBeCloseTo(0.4, 5);
  });

  it('resolves market value precedence', () => {
    expect(
      resolveMarketValueMinor({
        marketValueMinor: 50n,
        costBasisMinor: 10n,
        latestAssetValuationMinor: 40n,
      }),
    ).toBe(50n);
    expect(
      resolveMarketValueMinor({
        marketValueMinor: null,
        costBasisMinor: 10n,
        latestAssetValuationMinor: 40n,
      }),
    ).toBe(40n);
    expect(
      resolveMarketValueMinor({
        marketValueMinor: null,
        costBasisMinor: 10n,
        latestAssetValuationMinor: null,
      }),
    ).toBe(10n);
  });
});
