export type ValuationMethodology =
  | 'income'
  | 'market_comps'
  | 'cost'
  | 'nav'
  | 'dcf'
  | 'hybrid'
  | 'manual'
  | 'external';

export interface ValuationEngineInput {
  methodology: ValuationMethodology;
  parameters: Record<string, unknown>;
  inputs: Record<string, unknown>;
}

export interface ValuationEngineResult {
  amountMinor: bigint;
  confidence: number;
  outputs: Record<string, unknown>;
}

function num(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return fallback;
}

function requirePositive(name: string, value: number): number {
  if (!(value > 0)) throw new Error(`${name} must be a positive number`);
  return value;
}

function toMinor(amountMajor: number): bigint {
  return BigInt(Math.round(amountMajor * 100));
}

/** Deterministic valuation engine — no external market data feeds. */
export function executeValuation(input: ValuationEngineInput): ValuationEngineResult {
  const p = { ...input.parameters, ...input.inputs };

  switch (input.methodology) {
    case 'manual':
    case 'external': {
      const amountMinor = num(p.amountMinor, NaN);
      if (!Number.isFinite(amountMinor)) {
        throw new Error('amountMinor is required for manual/external methodology');
      }
      return {
        amountMinor: BigInt(Math.trunc(amountMinor)),
        confidence: Math.min(1, Math.max(0, num(p.confidence, 0.5))),
        outputs: { methodology: input.methodology, source: p.source ?? 'provided' },
      };
    }
    case 'income': {
      const noi = requirePositive('noi', num(p.noi));
      const capRate = requirePositive('capRate', num(p.capRate, num(p.cap_rate)));
      const value = noi / capRate;
      return {
        amountMinor: toMinor(value),
        confidence: Math.min(1, Math.max(0.4, num(p.confidence, 0.7))),
        outputs: { methodology: 'income', noi, capRate, valueMajor: value },
      };
    }
    case 'dcf': {
      const cashFlows = Array.isArray(p.cashFlows) ? p.cashFlows.map((x) => num(x)) : [];
      if (cashFlows.length === 0) throw new Error('cashFlows array is required for dcf');
      const discountRate = requirePositive('discountRate', num(p.discountRate, 0.1));
      const terminalGrowth = num(p.terminalGrowth, 0.02);
      if (terminalGrowth >= discountRate) {
        throw new Error('terminalGrowth must be less than discountRate');
      }
      let pv = 0;
      cashFlows.forEach((cf, index) => {
        pv += cf / (1 + discountRate) ** (index + 1);
      });
      const last = cashFlows[cashFlows.length - 1] ?? 0;
      const terminal = (last * (1 + terminalGrowth)) / (discountRate - terminalGrowth);
      const terminalPv = terminal / (1 + discountRate) ** cashFlows.length;
      const value = pv + terminalPv;
      return {
        amountMinor: toMinor(value),
        confidence: Math.min(1, Math.max(0.45, num(p.confidence, 0.65))),
        outputs: {
          methodology: 'dcf',
          discountRate,
          terminalGrowth,
          presentValueMajor: pv,
          terminalValueMajor: terminal,
          valueMajor: value,
        },
      };
    }
    case 'market_comps': {
      const comps = Array.isArray(p.comps)
        ? p.comps.map((row) => {
          if (row && typeof row === 'object') {
            const item = row as Record<string, unknown>;
            return {
              price: num(item.price),
              size: requirePositive('comp.size', num(item.size, 1)),
            };
          }
          return { price: num(row), size: 1 };
        })
        : [];
      if (comps.length === 0) throw new Error('comps are required for market_comps');
      const subjectSize = requirePositive('subjectSize', num(p.subjectSize, num(p.size, 1)));
      const avgPsf = comps.reduce((sum, c) => sum + c.price / c.size, 0) / comps.length;
      const value = avgPsf * subjectSize;
      return {
        amountMinor: toMinor(value),
        confidence: Math.min(1, Math.max(0.4, 0.5 + Math.min(comps.length, 8) * 0.05)),
        outputs: {
          methodology: 'market_comps',
          avgPricePerUnit: avgPsf,
          subjectSize,
          compCount: comps.length,
          valueMajor: value,
        },
      };
    }
    case 'nav': {
      const assets = num(p.assets, num(p.grossAssets));
      const liabilities = num(p.liabilities, 0);
      if (!(assets >= 0)) throw new Error('assets must be non-negative');
      const value = assets - liabilities;
      return {
        amountMinor: toMinor(value),
        confidence: Math.min(1, Math.max(0.5, num(p.confidence, 0.75))),
        outputs: { methodology: 'nav', assets, liabilities, valueMajor: value },
      };
    }
    case 'cost': {
      const replacementCost = requirePositive('replacementCost', num(p.replacementCost));
      const depreciation = Math.max(0, num(p.depreciation, 0));
      const value = Math.max(0, replacementCost - depreciation);
      return {
        amountMinor: toMinor(value),
        confidence: Math.min(1, Math.max(0.4, num(p.confidence, 0.6))),
        outputs: { methodology: 'cost', replacementCost, depreciation, valueMajor: value },
      };
    }
    case 'hybrid': {
      const weights = (p.weights && typeof p.weights === 'object'
        ? p.weights
        : { income: 0.5, market_comps: 0.5 }) as Record<string, unknown>;
      const parts = Object.entries(weights);
      if (parts.length === 0) throw new Error('weights are required for hybrid');
      let totalWeight = 0;
      let weighted = 0;
      const breakdown: Record<string, number> = {};
      for (const [method, weightRaw] of parts) {
        const weight = num(weightRaw);
        if (weight <= 0) continue;
        const child = executeValuation({
          methodology: method as ValuationMethodology,
          parameters: input.parameters,
          inputs: input.inputs,
        });
        const major = Number(child.amountMinor) / 100;
        weighted += major * weight;
        totalWeight += weight;
        breakdown[method] = major;
      }
      if (totalWeight <= 0) throw new Error('hybrid weights must sum to a positive value');
      const value = weighted / totalWeight;
      return {
        amountMinor: toMinor(value),
        confidence: Math.min(1, Math.max(0.45, num(p.confidence, 0.7))),
        outputs: { methodology: 'hybrid', breakdown, valueMajor: value, totalWeight },
      };
    }
    default:
      throw new Error(`Unsupported methodology: ${String(input.methodology)}`);
  }
}
