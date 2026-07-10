export type PricingModel = 'free' | 'per_run' | 'monthly';
export type InstallStatus = 'active' | 'suspended' | 'cancelled';

export interface EntitlementInstall {
  status: InstallStatus;
  pricingModel: PricingModel;
  includedRuns: number;
  periodStart: string;
  periodEnd?: string | null;
}

export interface EntitlementDecision {
  allowed: boolean;
  reason?: string;
  remainingRuns: number | null;
  billableUnits: number;
}

function periodContains(install: EntitlementInstall, atIso: string): boolean {
  if (install.periodStart > atIso) return false;
  if (install.periodEnd && install.periodEnd <= atIso) return false;
  return true;
}

/**
 * Deterministic entitlement check for marketplace installs.
 * free / monthly with includedRuns=0 → unlimited within active period.
 * per_run / monthly with includedRuns>0 → soft quota on period usage.
 */
export function evaluateInstallEntitlement(
  install: EntitlementInstall,
  usedUnitsInPeriod: number,
  requestedUnits: number,
  atIso = new Date().toISOString(),
): EntitlementDecision {
  if (requestedUnits <= 0) {
    return {
      allowed: false,
      reason: 'requested units must be positive',
      remainingRuns: null,
      billableUnits: 0,
    };
  }
  if (install.status === 'cancelled') {
    return {
      allowed: false,
      reason: 'install is cancelled',
      remainingRuns: 0,
      billableUnits: 0,
    };
  }
  if (install.status === 'suspended') {
    return {
      allowed: false,
      reason: 'install is suspended',
      remainingRuns: null,
      billableUnits: 0,
    };
  }
  if (!periodContains(install, atIso)) {
    return {
      allowed: false,
      reason: 'install period is not active',
      remainingRuns: 0,
      billableUnits: 0,
    };
  }

  if (install.pricingModel === 'free') {
    return {
      allowed: true,
      remainingRuns: null,
      billableUnits: 0,
    };
  }

  if (install.includedRuns <= 0) {
    // Unlimited included allotment; per_run still marks units billable for metering.
    return {
      allowed: true,
      remainingRuns: null,
      billableUnits: install.pricingModel === 'per_run' ? requestedUnits : 0,
    };
  }

  const remaining = Math.max(0, install.includedRuns - usedUnitsInPeriod);
  if (requestedUnits > remaining) {
    return {
      allowed: false,
      reason: `quota exceeded (${usedUnitsInPeriod}/${install.includedRuns} used)`,
      remainingRuns: remaining,
      billableUnits: 0,
    };
  }

  return {
    allowed: true,
    remainingRuns: remaining - requestedUnits,
    billableUnits: install.pricingModel === 'per_run' ? requestedUnits : 0,
  };
}

export function nextMonthlyPeriodEnd(periodStartIso: string): string {
  const start = new Date(periodStartIso);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return end.toISOString();
}
