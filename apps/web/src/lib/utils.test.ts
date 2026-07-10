import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';

describe('API key hashing contract', () => {
  it('hashes secrets with sha256 hex', () => {
    const raw = 'gain_abcd.secret';
    const hash = createHash('sha256').update(raw).digest('hex');
    expect(hash).toHaveLength(64);
  });
});
