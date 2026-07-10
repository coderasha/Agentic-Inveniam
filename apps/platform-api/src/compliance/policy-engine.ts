export type RuleSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ComplianceRule {
  id: string;
  type:
    | 'required_field'
    | 'min_trust_score'
    | 'min_provenance_verified'
    | 'forbidden_status'
    | 'required_tag';
  severity: RuleSeverity;
  message: string;
  field?: string;
  value?: string | number | boolean;
}

export interface RuleFinding {
  ruleId: string;
  severity: RuleSeverity;
  message: string;
  details: Record<string, unknown>;
}

export interface PolicyEvaluationResult {
  status: 'passed' | 'failed' | 'warning';
  findings: RuleFinding[];
  summary: string;
}

function getPath(snapshot: Record<string, unknown>, field?: string): unknown {
  if (!field) return undefined;
  return field.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, snapshot);
}

function evaluateRule(
  rule: ComplianceRule,
  snapshot: Record<string, unknown>,
): RuleFinding | null {
  switch (rule.type) {
    case 'required_field': {
      const value = getPath(snapshot, rule.field);
      const missing = value === undefined || value === null || value === '';
      return missing
        ? {
          ruleId: rule.id,
          severity: rule.severity,
          message: rule.message,
          details: { field: rule.field, value },
        }
        : null;
    }
    case 'min_trust_score': {
      const score = Number(getPath(snapshot, rule.field ?? 'trustScore') ?? NaN);
      const min = Number(rule.value ?? 0);
      return !(score >= min)
        ? {
          ruleId: rule.id,
          severity: rule.severity,
          message: rule.message,
          details: { score, min },
        }
        : null;
    }
    case 'min_provenance_verified': {
      const count = Number(getPath(snapshot, rule.field ?? 'verifiedProvenanceCount') ?? 0);
      const min = Number(rule.value ?? 1);
      return !(count >= min)
        ? {
          ruleId: rule.id,
          severity: rule.severity,
          message: rule.message,
          details: { count, min },
        }
        : null;
    }
    case 'forbidden_status': {
      const status = String(getPath(snapshot, rule.field ?? 'status') ?? '');
      const forbidden = String(rule.value ?? '');
      return status === forbidden
        ? {
          ruleId: rule.id,
          severity: rule.severity,
          message: rule.message,
          details: { status, forbidden },
        }
        : null;
    }
    case 'required_tag': {
      const tags = getPath(snapshot, rule.field ?? 'tags');
      const required = String(rule.value ?? '');
      const list = Array.isArray(tags) ? tags.map(String) : [];
      return !list.includes(required)
        ? {
          ruleId: rule.id,
          severity: rule.severity,
          message: rule.message,
          details: { tags: list, required },
        }
        : null;
    }
    default:
      return {
        ruleId: rule.id,
        severity: 'high',
        message: `Unknown rule type: ${String((rule as ComplianceRule).type)}`,
        details: {},
      };
  }
}

/** Deterministic policy evaluation against a subject snapshot. */
export function evaluateCompliancePolicy(
  rules: ComplianceRule[],
  snapshot: Record<string, unknown>,
): PolicyEvaluationResult {
  const findings = rules
    .map((rule) => evaluateRule(rule, snapshot))
    .filter((finding): finding is RuleFinding => finding !== null);

  if (findings.length === 0) {
    return { status: 'passed', findings: [], summary: 'All compliance rules passed' };
  }

  const hasCriticalOrHigh = findings.some(
    (f) => f.severity === 'critical' || f.severity === 'high',
  );
  const status = hasCriticalOrHigh ? 'failed' : 'warning';
  return {
    status,
    findings,
    summary: `${findings.length} finding(s); status=${status}`,
  };
}
