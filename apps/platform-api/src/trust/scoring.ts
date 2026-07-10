export interface AttestationInput {
  confidence: number;
  weight: number;
  status: 'active' | 'expired' | 'revoked' | 'disputed';
  kind: string;
  expiresAt?: string | null;
}

export interface ProvenanceInput {
  status: 'recorded' | 'verified' | 'disputed' | 'revoked';
  confidence?: number | null;
}

export interface AnchorInput {
  status: 'pending' | 'anchored' | 'failed';
}

export interface TrustScoreResult {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  components: {
    attestationScore: number;
    provenanceScore: number;
    anchorBonus: number;
    activeAttestations: number;
    verifiedProvenance: number;
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function gradeFromScore(score: number): TrustScoreResult['grade'] {
  if (score >= 0.85) return 'A';
  if (score >= 0.7) return 'B';
  if (score >= 0.55) return 'C';
  if (score >= 0.4) return 'D';
  return 'F';
}

/** Deterministic trust score from attestations, provenance, and anchors. */
export function computeTrustScore(input: {
  attestations: AttestationInput[];
  provenance: ProvenanceInput[];
  anchors: AnchorInput[];
  nowIso?: string;
}): TrustScoreResult {
  const now = input.nowIso ? Date.parse(input.nowIso) : Date.now();

  const active = input.attestations.filter((row) => {
    if (row.status !== 'active') return false;
    if (row.expiresAt && Date.parse(row.expiresAt) < now) return false;
    return true;
  });

  let attestationScore = 0.35;
  if (active.length > 0) {
    const weighted = active.reduce((sum, row) => sum + row.confidence * row.weight, 0);
    const weightSum = active.reduce((sum, row) => sum + row.weight, 0) || 1;
    attestationScore = clamp01(weighted / weightSum);
  }

  const verified = input.provenance.filter((row) => row.status === 'verified');
  const disputedOrRevoked = input.provenance.filter(
    (row) => row.status === 'disputed' || row.status === 'revoked',
  ).length;
  let provenanceScore = 0.3;
  if (input.provenance.length > 0) {
    const avgConfidence =
      verified.reduce((sum, row) => sum + (row.confidence ?? 0.7), 0) /
      Math.max(verified.length, 1);
    const coverage = verified.length / input.provenance.length;
    provenanceScore = clamp01(0.4 * coverage + 0.6 * (verified.length ? avgConfidence : 0));
    provenanceScore = clamp01(provenanceScore - disputedOrRevoked * 0.08);
  }

  const anchored = input.anchors.some((row) => row.status === 'anchored');
  const failed = input.anchors.some((row) => row.status === 'failed');
  const anchorBonus = anchored ? 0.08 : failed ? -0.05 : 0;

  const score = clamp01(0.55 * attestationScore + 0.37 * provenanceScore + anchorBonus + 0.08);

  return {
    score: Number(score.toFixed(4)),
    grade: gradeFromScore(score),
    components: {
      attestationScore: Number(attestationScore.toFixed(4)),
      provenanceScore: Number(provenanceScore.toFixed(4)),
      anchorBonus,
      activeAttestations: active.length,
      verifiedProvenance: verified.length,
    },
  };
}
