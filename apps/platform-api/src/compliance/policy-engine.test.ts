import { describe, expect, it } from 'vitest';
import { evaluateCompliancePolicy } from './policy-engine';

describe('compliance policy engine', () => {
  it('passes when all rules are satisfied', () => {
    const result = evaluateCompliancePolicy(
      [
        {
          id: 'r1',
          type: 'required_field',
          severity: 'high',
          message: 'name required',
          field: 'name',
        },
        {
          id: 'r2',
          type: 'min_trust_score',
          severity: 'medium',
          message: 'trust too low',
          field: 'trustScore',
          value: 0.7,
        },
      ],
      { name: 'Asset A', trustScore: 0.9 },
    );
    expect(result.status).toBe('passed');
    expect(result.findings).toHaveLength(0);
  });

  it('fails on high severity findings and warns on medium-only', () => {
    const failed = evaluateCompliancePolicy(
      [
        {
          id: 'r1',
          type: 'forbidden_status',
          severity: 'high',
          message: 'cannot be draft',
          field: 'status',
          value: 'draft',
        },
      ],
      { status: 'draft' },
    );
    expect(failed.status).toBe('failed');

    const warned = evaluateCompliancePolicy(
      [
        {
          id: 'r2',
          type: 'required_tag',
          severity: 'medium',
          message: 'kyc tag required',
          field: 'tags',
          value: 'kyc_complete',
        },
      ],
      { tags: ['prospect'] },
    );
    expect(warned.status).toBe('warning');
    expect(warned.findings).toHaveLength(1);
  });

  it('checks provenance verified count', () => {
    const result = evaluateCompliancePolicy(
      [
        {
          id: 'r3',
          type: 'min_provenance_verified',
          severity: 'critical',
          message: 'need verified provenance',
          value: 2,
        },
      ],
      { verifiedProvenanceCount: 1 },
    );
    expect(result.status).toBe('failed');
    expect(result.findings[0]?.details).toMatchObject({ count: 1, min: 2 });
  });
});
