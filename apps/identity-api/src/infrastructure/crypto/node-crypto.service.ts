import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { CryptoPort } from '../../domain/identity/ports/infrastructure.ports';

@Injectable()
export class NodeCryptoService implements CryptoPort {
  hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  generateInvitationToken(): { raw: string; hash: string } {
    const raw = randomBytes(32).toString('base64url');
    return { raw, hash: this.hashToken(raw) };
  }

  generateApiKey(): { raw: string; prefix: string; hash: string } {
    const secret = randomBytes(32).toString('base64url');
    const prefix = `gain_${randomBytes(4).toString('hex')}`;
    const raw = `${prefix}.${secret}`;
    return { raw, prefix, hash: this.hashToken(raw) };
  }

  timingSafeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }
}
