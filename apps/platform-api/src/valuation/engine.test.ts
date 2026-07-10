import { describe, expect, it } from 'vitest';
import { executeValuation } from './engine';

describe('valuation engine', () => {
  it('values income approach with NOI / cap rate', () => {
    const result = executeValuation({
      methodology: 'income',
      parameters: {},
      inputs: { noi: 1_000_000, capRate: 0.05 },
    });
    expect(Number(result.amountMinor)).toBe(2_000_000_000);
    expect(result.outputs.valueMajor).toBe(20_000_000);
  });

  it('discounts cash flows for dcf', () => {
    const result = executeValuation({
      methodology: 'dcf',
      parameters: {},
      inputs: {
        cashFlows: [100, 110, 120],
        discountRate: 0.1,
        terminalGrowth: 0.02,
      },
    });
    expect(Number(result.amountMinor)).toBeGreaterThan(0);
    expect(result.outputs.methodology).toBe('dcf');
  });

  it('averages comps for market approach', () => {
    const result = executeValuation({
      methodology: 'market_comps',
      parameters: {},
      inputs: {
        subjectSize: 10,
        comps: [
          { price: 1000, size: 10 },
          { price: 1200, size: 10 },
        ],
      },
    });
    expect(Number(result.amountMinor)).toBe(110_000); // avg 110/unit * 10 = 1100 major
  });

  it('rejects invalid dcf terminal growth', () => {
    expect(() =>
      executeValuation({
        methodology: 'dcf',
        parameters: {},
        inputs: { cashFlows: [1], discountRate: 0.05, terminalGrowth: 0.06 },
      }),
    ).toThrow(/terminalGrowth/);
  });
});
