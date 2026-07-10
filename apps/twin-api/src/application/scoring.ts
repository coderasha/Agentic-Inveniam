import type { DigitalTwin, InsightKind, TwinAttribute, TwinSignal } from '../domain/twin/models';

export interface CompletenessInput {
  description?: string | null;
  externalReference?: string | null;
  attributeCount: number;
  tags?: string[];
  status: string;
}

export function calculateCompletenessScore(input: CompletenessInput): number {
  let score = 0;
  if (input.description?.trim()) score += 20;
  if (input.externalReference?.trim()) score += 15;
  score += Math.min(30, input.attributeCount * 10);
  if ((input.tags?.length ?? 0) > 0) score += 15;
  if (input.status === 'active') score += 20;
  return Math.min(100, score);
}

export interface InsightHeuristic {
  kind: InsightKind;
  title: string;
  summary: string;
  confidence: number;
  evidence: Record<string, unknown>;
}

export function analyzeTwin(
  twin: DigitalTwin,
  attributes: TwinAttribute[],
  signals: TwinSignal[],
): InsightHeuristic {
  const critical = signals.filter((s) => s.severity === 'critical').length;
  const warnings = signals.filter((s) => s.severity === 'warning').length;
  const lowConfidence = attributes.filter((a) => a.confidence !== null && a.confidence < 0.6).length;
  const missingCore = [twin.description, twin.externalReference].filter((v) => !v?.trim()).length;
  const riskScore = Math.min(100, critical * 30 + warnings * 12 + lowConfidence * 8 + missingCore * 10);
  const kind: InsightKind = riskScore >= 25 ? 'risk' : 'summary';
  const confidence = Math.min(0.95, 0.55 + Math.min(attributes.length, 8) * 0.04 + Math.min(signals.length, 4) * 0.02);
  const title = kind === 'risk' ? `${twin.name} risk assessment` : `${twin.name} operating summary`;
  const summary = kind === 'risk'
    ? `Risk score ${riskScore}/100: ${critical} critical and ${warnings} warning signals, ${lowConfidence} low-confidence attributes, and ${missingCore} missing core fields.`
    : `Twin is ${twin.status} with completeness ${Math.round(twin.completenessScore)}%, ${attributes.length} attributes, and ${signals.length} recent signals; no material rule-based risk threshold was reached.`;
  return {
    kind, title, summary, confidence: Number(confidence.toFixed(2)),
    evidence: {
      riskScore, criticalSignals: critical, warningSignals: warnings,
      lowConfidenceAttributes: lowConfidence, analyzedSignalCount: signals.length,
      missingCoreFields: missingCore,
    },
  };
}
