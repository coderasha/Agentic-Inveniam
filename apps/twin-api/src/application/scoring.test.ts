import { describe, expect, it } from 'vitest';
import type { DigitalTwin, TwinAttribute, TwinSignal } from '../domain/twin/models';
import { NodeCryptoService } from '../infrastructure/adapters';
import { analyzeTwin, calculateCompletenessScore } from './scoring';

const twin: DigitalTwin = {
  id: '00000000-0000-0000-0000-000000000001',
  organizationId: '00000000-0000-0000-0000-000000000002',
  name: 'Asset A', slug: 'asset-a', description: 'Operating asset',
  assetClass: 'infrastructure', lifecycleStage: 'under_management', status: 'active',
  externalReference: 'ERP-1', currencyCode: 'USD', tags: ['core'], metadata: {},
  completenessScore: 100, publishedAt: new Date('2026-01-01'), version: 1,
  createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'), deletedAt: null,
};

describe('calculateCompletenessScore', () => {
  it('reaches 100 when all weighted criteria are met', () => {
    expect(calculateCompletenessScore({
      description: 'x', externalReference: 'ref', attributeCount: 3,
      tags: ['tag'], status: 'active',
    })).toBe(100);
  });
  it('scores partial twins from the specified weights', () => {
    expect(calculateCompletenessScore({
      description: 'x', attributeCount: 2, tags: [], status: 'draft',
    })).toBe(40);
  });
});

describe('analyzeTwin', () => {
  it('generates a deterministic risk insight for material signals', () => {
    const signal = (severity: 'warning' | 'critical'): TwinSignal => ({
      id: severity, twinId: twin.id, signalType: 'monitoring', severity,
      title: severity, payload: {}, source: 'test', observedAt: new Date('2026-07-01'),
      createdAt: new Date('2026-07-01'),
    });
    const result = analyzeTwin(twin, [], [signal('critical'), signal('warning')]);
    expect(result.kind).toBe('risk');
    expect(result.evidence.riskScore).toBe(42);
    expect(result.summary).toContain('1 critical and 1 warning');
  });
  it('generates a summary when no risk threshold is reached', () => {
    const attribute = { confidence: 0.9 } as TwinAttribute;
    expect(analyzeTwin(twin, [attribute], []).kind).toBe('summary');
  });
});

describe('NodeCryptoService', () => {
  it('hashes consistently with SHA-256', () => {
    const crypto = new NodeCryptoService();
    expect(crypto.hash('gain')).toBe(crypto.hash('gain'));
    expect(crypto.hash('gain')).toHaveLength(64);
  });
});
