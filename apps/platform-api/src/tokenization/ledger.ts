import { createHash } from 'node:crypto';

export type LedgerOpType = 'mint' | 'burn' | 'transfer' | 'allocate' | 'freeze' | 'unfreeze';

export interface HoldingState {
  holderRef: string;
  balance: bigint;
  frozen: boolean;
}

export interface LedgerOp {
  type: LedgerOpType;
  fromHolderRef?: string;
  toHolderRef?: string;
  amount: bigint;
  memo?: string;
}

export interface LedgerApplyResult {
  holdings: HoldingState[];
  totalSupply: bigint;
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function computeLedgerTxHash(input: {
  instrumentId: string;
  entryType: string;
  fromHolderRef: string | null;
  toHolderRef: string | null;
  amount: bigint;
  previousTxHash: string | null;
  occurredAtIso: string;
}): string {
  return sha256Hex(
    [
      input.instrumentId,
      input.entryType,
      input.fromHolderRef ?? '',
      input.toHolderRef ?? '',
      input.amount.toString(),
      input.previousTxHash ?? 'genesis',
      input.occurredAtIso,
    ].join('|'),
  );
}

function cloneHoldings(holdings: HoldingState[]): Map<string, HoldingState> {
  return new Map(
    holdings.map((h) => [h.holderRef, { ...h, balance: BigInt(h.balance) }]),
  );
}

function ensureHolder(
  map: Map<string, HoldingState>,
  holderRef: string,
): HoldingState {
  const existing = map.get(holderRef);
  if (existing) return existing;
  const created = { holderRef, balance: 0n, frozen: false };
  map.set(holderRef, created);
  return created;
}

/** Pure ledger mutation — unit-testable without DB. */
export function applyLedgerOp(
  holdings: HoldingState[],
  totalSupply: bigint,
  op: LedgerOp,
  supplyCap: bigint | null = null,
): LedgerApplyResult {
  if (op.amount <= 0n) throw new Error('amount must be positive');
  const map = cloneHoldings(holdings);
  let supply = BigInt(totalSupply);

  switch (op.type) {
    case 'mint':
    case 'allocate': {
      if (!op.toHolderRef) throw new Error('toHolderRef is required');
      const nextSupply = supply + op.amount;
      if (supplyCap !== null && nextSupply > supplyCap) {
        throw new Error('mint would exceed totalSupplyCap');
      }
      const holder = ensureHolder(map, op.toHolderRef);
      if (holder.frozen) throw new Error('destination holding is frozen');
      holder.balance += op.amount;
      supply = nextSupply;
      break;
    }
    case 'burn': {
      if (!op.fromHolderRef) throw new Error('fromHolderRef is required');
      const holder = ensureHolder(map, op.fromHolderRef);
      if (holder.frozen) throw new Error('source holding is frozen');
      if (holder.balance < op.amount) throw new Error('insufficient balance');
      holder.balance -= op.amount;
      supply -= op.amount;
      break;
    }
    case 'transfer': {
      if (!op.fromHolderRef || !op.toHolderRef) {
        throw new Error('fromHolderRef and toHolderRef are required');
      }
      if (op.fromHolderRef === op.toHolderRef) {
        throw new Error('self-transfer is not allowed');
      }
      const from = ensureHolder(map, op.fromHolderRef);
      const to = ensureHolder(map, op.toHolderRef);
      if (from.frozen) throw new Error('source holding is frozen');
      if (to.frozen) throw new Error('destination holding is frozen');
      if (from.balance < op.amount) throw new Error('insufficient balance');
      from.balance -= op.amount;
      to.balance += op.amount;
      break;
    }
    case 'freeze': {
      if (!op.fromHolderRef) throw new Error('fromHolderRef is required for freeze');
      const holder = ensureHolder(map, op.fromHolderRef);
      holder.frozen = true;
      break;
    }
    case 'unfreeze': {
      if (!op.fromHolderRef) throw new Error('fromHolderRef is required for unfreeze');
      const holder = ensureHolder(map, op.fromHolderRef);
      holder.frozen = false;
      break;
    }
    default:
      throw new Error(`unsupported ledger op: ${String(op.type)}`);
  }

  return {
    holdings: [...map.values()],
    totalSupply: supply,
  };
}

export interface SettlementReceipt {
  network: string;
  status: 'settled' | 'pending' | 'failed';
  settlementRef: string | null;
}

/** Off-chain settles immediately. On-chain networks stay pending until a connector exists. */
export function settleLedgerEntry(network: string, txHash: string): SettlementReceipt {
  if (network === 'offchain') {
    return {
      network,
      status: 'settled',
      settlementRef: `offchain:${txHash.slice(0, 24)}`,
    };
  }
  return {
    network,
    status: 'pending',
    settlementRef: null,
  };
}
