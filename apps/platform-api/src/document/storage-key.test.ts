import { describe, expect, it } from 'vitest';
import { buildStorageKey } from './document.module';

describe('buildStorageKey', () => {
  it('builds the canonical organization-scoped version key', () => {
    const orgId = '11111111-1111-4111-8111-111111111111';
    const documentId = '22222222-2222-4222-8222-222222222222';
    const checksum = 'a'.repeat(64);
    expect(buildStorageKey(orgId, documentId, 3, checksum))
      .toBe(`org/${orgId}/documents/${documentId}/v3/${checksum}`);
  });

  it('rejects traversal and malformed checksums', () => {
    expect(() => buildStorageKey('../org', '22222222-2222-4222-8222-222222222222', 1, 'a'.repeat(64)))
      .toThrow();
    expect(() => buildStorageKey(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      1,
      'not-a-checksum',
    )).toThrow();
  });
});
