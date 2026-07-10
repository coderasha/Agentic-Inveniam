import { describe, expect, it } from 'vitest';
import {
  applyLedgerOp,
  computeLedgerTxHash,
  settleLedgerEntry,
} from './ledger';

describe('tokenization ledger', () => {
  it('mints and transfers with balance checks', () => {
    const minted = applyLedgerOp([], 0n, {
      type: 'mint',
      toHolderRef: 'issuer',
      amount: 1000n,
    }, 5000n);
    expect(minted.totalSupply).toBe(1000n);
    expect(minted.holdings.find((h) => h.holderRef === 'issuer')?.balance).toBe(1000n);

    const transferred = applyLedgerOp(minted.holdings, minted.totalSupply, {
      type: 'transfer',
      fromHolderRef: 'issuer',
      toHolderRef: 'investor-1',
      amount: 250n,
    });
    expect(transferred.holdings.find((h) => h.holderRef === 'issuer')?.balance).toBe(750n);
    expect(transferred.holdings.find((h) => h.holderRef === 'investor-1')?.balance).toBe(250n);
  });

  it('rejects overdraft and cap breach', () => {
    expect(() =>
      applyLedgerOp([], 0n, { type: 'mint', toHolderRef: 'a', amount: 10n }, 5n),
    ).toThrow(/totalSupplyCap/);

    const minted = applyLedgerOp([], 0n, {
      type: 'mint',
      toHolderRef: 'a',
      amount: 10n,
    });
    expect(() =>
      applyLedgerOp(minted.holdings, minted.totalSupply, {
        type: 'transfer',
        fromHolderRef: 'a',
        toHolderRef: 'b',
        amount: 11n,
      }),
    ).toThrow(/insufficient/);
  });

  it('blocks transfers from frozen holdings', () => {
    const minted = applyLedgerOp([], 0n, {
      type: 'mint',
      toHolderRef: 'a',
      amount: 10n,
    });
    const frozen = applyLedgerOp(minted.holdings, minted.totalSupply, {
      type: 'freeze',
      fromHolderRef: 'a',
      amount: 1n,
    });
    expect(() =>
      applyLedgerOp(frozen.holdings, frozen.totalSupply, {
        type: 'transfer',
        fromHolderRef: 'a',
        toHolderRef: 'b',
        amount: 1n,
      }),
    ).toThrow(/frozen/);
  });

  it('computes stable tx hashes and settles offchain immediately', () => {
    const hash = computeLedgerTxHash({
      instrumentId: '11111111-1111-1111-1111-111111111111',
      entryType: 'mint',
      fromHolderRef: null,
      toHolderRef: 'issuer',
      amount: 100n,
      previousTxHash: null,
      occurredAtIso: '2026-07-11T00:00:00.000Z',
    });
    expect(hash).toHaveLength(64);
    expect(settleLedgerEntry('offchain', hash).status).toBe('settled');
    expect(settleLedgerEntry('polygon_amoy', hash).status).toBe('pending');
  });
});
