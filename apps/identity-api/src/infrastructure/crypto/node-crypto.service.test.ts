import { describe, expect, it } from 'vitest';
import { NodeCryptoService } from './node-crypto.service';

describe('NodeCryptoService', () => {
  const crypto = new NodeCryptoService();

  it('generates invitation tokens with matching hashes', () => {
    const { raw, hash } = crypto.generateInvitationToken();
    expect(raw.length).toBeGreaterThan(20);
    expect(crypto.hashToken(raw)).toBe(hash);
  });

  it('generates API keys with gain_ prefix', () => {
    const { raw, prefix, hash } = crypto.generateApiKey();
    expect(prefix.startsWith('gain_')).toBe(true);
    expect(raw.startsWith(prefix)).toBe(true);
    expect(crypto.hashToken(raw)).toBe(hash);
  });

  it('compares hashes in constant time', () => {
    const a = crypto.hashToken('alpha');
    const b = crypto.hashToken('alpha');
    const c = crypto.hashToken('beta');
    expect(crypto.timingSafeEqual(a, b)).toBe(true);
    expect(crypto.timingSafeEqual(a, c)).toBe(false);
  });
});
