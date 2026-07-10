import { describe, expect, it } from 'vitest';
import {
  evaluateInstallEntitlement,
  nextMonthlyPeriodEnd,
} from './entitlement';

describe('ai marketplace entitlement', () => {
  const now = '2026-07-11T00:00:00.000Z';

  it('allows free installs without quota', () => {
    const result = evaluateInstallEntitlement(
      {
        status: 'active',
        pricingModel: 'free',
        includedRuns: 0,
        periodStart: '2026-07-01T00:00:00.000Z',
      },
      999,
      5,
      now,
    );
    expect(result.allowed).toBe(true);
    expect(result.billableUnits).toBe(0);
    expect(result.remainingRuns).toBeNull();
  });

  it('enforces per_run included quota and billable units', () => {
    const ok = evaluateInstallEntitlement(
      {
        status: 'active',
        pricingModel: 'per_run',
        includedRuns: 10,
        periodStart: '2026-07-01T00:00:00.000Z',
      },
      8,
      2,
      now,
    );
    expect(ok.allowed).toBe(true);
    expect(ok.remainingRuns).toBe(0);
    expect(ok.billableUnits).toBe(2);

    const blocked = evaluateInstallEntitlement(
      {
        status: 'active',
        pricingModel: 'per_run',
        includedRuns: 10,
        periodStart: '2026-07-01T00:00:00.000Z',
      },
      9,
      2,
      now,
    );
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toMatch(/quota exceeded/);
  });

  it('rejects suspended/cancelled/out-of-period installs', () => {
    expect(
      evaluateInstallEntitlement(
        {
          status: 'suspended',
          pricingModel: 'monthly',
          includedRuns: 100,
          periodStart: '2026-07-01T00:00:00.000Z',
          periodEnd: '2026-08-01T00:00:00.000Z',
        },
        0,
        1,
        now,
      ).allowed,
    ).toBe(false);

    expect(
      evaluateInstallEntitlement(
        {
          status: 'active',
          pricingModel: 'monthly',
          includedRuns: 100,
          periodStart: '2026-06-01T00:00:00.000Z',
          periodEnd: '2026-07-01T00:00:00.000Z',
        },
        0,
        1,
        now,
      ).reason,
    ).toMatch(/period/);
  });

  it('computes next monthly period end', () => {
    expect(nextMonthlyPeriodEnd('2026-07-11T12:00:00.000Z')).toBe(
      '2026-08-11T12:00:00.000Z',
    );
  });
});
