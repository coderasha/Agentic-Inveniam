'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { platformApi } from '@/lib/platform-api';
import { useIdentityStore } from '@/stores/identity-store';
import {
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/components/ui/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function TokenizationPage() {
  const organizationId = useIdentityStore((s) => s.organizationId);
  const qc = useQueryClient();
  const [name, setName] = useState('Building Share Token');
  const [symbol, setSymbol] = useState('BLDG');
  const [subjectId, setSubjectId] = useState('00000000-0000-4000-8000-000000000001');
  const [instrumentId, setInstrumentId] = useState('');
  const [mintTo, setMintTo] = useState('issuer');
  const [mintAmount, setMintAmount] = useState('1000');
  const [fromHolder, setFromHolder] = useState('issuer');
  const [toHolder, setToHolder] = useState('investor-1');
  const [transferAmount, setTransferAmount] = useState('100');

  const instrumentsQuery = useQuery({
    queryKey: ['token-instruments', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => platformApi.listTokenInstruments(organizationId!),
  });

  const holdingsQuery = useQuery({
    queryKey: ['token-holdings', organizationId, instrumentId],
    enabled: Boolean(organizationId && instrumentId),
    queryFn: () => platformApi.listTokenHoldings(organizationId!, instrumentId),
  });

  const ledgerQuery = useQuery({
    queryKey: ['token-ledger', organizationId, instrumentId],
    enabled: Boolean(organizationId && instrumentId),
    queryFn: () => platformApi.listTokenLedger(organizationId!, instrumentId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      platformApi.createTokenInstrument(organizationId!, {
        name,
        symbol,
        subjectType: 'custom',
        subjectId,
        network: 'offchain',
        decimals: 0,
        totalSupplyCap: '1000000',
      }),
    onSuccess: async (row) => {
      setInstrumentId(String(row.id));
      await qc.invalidateQueries({ queryKey: ['token-instruments', organizationId] });
    },
  });

  const mintMutation = useMutation({
    mutationFn: () =>
      platformApi.mintTokens(organizationId!, instrumentId, {
        toHolderRef: mintTo,
        amount: mintAmount,
      }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['token-holdings', organizationId, instrumentId] }),
        qc.invalidateQueries({ queryKey: ['token-ledger', organizationId, instrumentId] }),
        qc.invalidateQueries({ queryKey: ['token-instruments', organizationId] }),
      ]);
    },
  });

  const transferMutation = useMutation({
    mutationFn: () =>
      platformApi.transferTokens(organizationId!, instrumentId, {
        fromHolderRef: fromHolder,
        toHolderRef: toHolder,
        amount: transferAmount,
      }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['token-holdings', organizationId, instrumentId] }),
        qc.invalidateQueries({ queryKey: ['token-ledger', organizationId, instrumentId] }),
      ]);
    },
  });

  if (!organizationId) {
    return (
      <div>
        <PageHeader
          title="Tokenization"
          description="Off-chain token ledger with mint, burn, transfer, freeze, and hash-chained receipts."
        />
        <EmptyState
          title="Select an organization"
          description="Token instruments are organization-scoped."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tokenization"
        description="Real ledger semantics today on network=offchain. polygon_amoy / fabric_dev create pending settlements until chain connectors exist — no fake on-chain success."
      />

      <div className="grid md:grid-cols-3 gap-4">
        <div className="rounded-md border border-[var(--gain-border)] p-4 space-y-3">
          <div className="font-medium">Create instrument</div>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="SYMBOL" />
          <Input value={subjectId} onChange={(e) => setSubjectId(e.target.value)} placeholder="Subject UUID" />
          <Button
            disabled={!name || !symbol || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Create
          </Button>
        </div>
        <div className="rounded-md border border-[var(--gain-border)] p-4 space-y-3">
          <div className="font-medium">Mint</div>
          <Input value={instrumentId} onChange={(e) => setInstrumentId(e.target.value)} placeholder="Instrument UUID" />
          <Input value={mintTo} onChange={(e) => setMintTo(e.target.value)} placeholder="To holder" />
          <Input value={mintAmount} onChange={(e) => setMintAmount(e.target.value)} placeholder="Amount" />
          <Button
            disabled={!instrumentId || mintMutation.isPending}
            onClick={() => mintMutation.mutate()}
          >
            Mint
          </Button>
        </div>
        <div className="rounded-md border border-[var(--gain-border)] p-4 space-y-3">
          <div className="font-medium">Transfer</div>
          <Input value={fromHolder} onChange={(e) => setFromHolder(e.target.value)} placeholder="From" />
          <Input value={toHolder} onChange={(e) => setToHolder(e.target.value)} placeholder="To" />
          <Input value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} placeholder="Amount" />
          <Button
            disabled={!instrumentId || transferMutation.isPending}
            onClick={() => transferMutation.mutate()}
          >
            Transfer
          </Button>
        </div>
      </div>

      {instrumentsQuery.isLoading ? <LoadingState /> : null}
      {instrumentsQuery.isError ? <ErrorState message="Failed to load instruments." /> : null}

      {instrumentsQuery.data && instrumentsQuery.data.items.length === 0 ? (
        <EmptyState
          title="No token instruments"
          description="Create an off-chain instrument, mint to an issuer, then transfer."
        />
      ) : null}

      {instrumentsQuery.data && instrumentsQuery.data.items.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">Instruments</h2>
          <DataTable
            columns={['Symbol', 'Network', 'Supply', 'Status', 'Id']}
            rows={instrumentsQuery.data.items.map((row) => [
              String(row.symbol),
              String(row.network),
              String(row.totalSupply),
              String(row.status),
              <button
                key={String(row.id)}
                type="button"
                className="text-[var(--gain-accent)] underline"
                onClick={() => setInstrumentId(String(row.id))}
              >
                {String(row.id).slice(0, 8)}…
              </button>,
            ])}
          />
        </div>
      ) : null}

      {instrumentId && holdingsQuery.data ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">Holdings</h2>
          <DataTable
            columns={['Holder', 'Balance', 'Frozen']}
            rows={holdingsQuery.data.items.map((row) => [
              String(row.holderRef),
              String(row.balance),
              String(row.frozen),
            ])}
          />
        </div>
      ) : null}

      {instrumentId && ledgerQuery.data ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">Ledger</h2>
          <DataTable
            columns={['Type', 'Amount', 'Settlement', 'Tx']}
            rows={ledgerQuery.data.items.map((row) => [
              String(row.entryType),
              String(row.amount),
              String(row.settlementStatus),
              `${String(row.txHash).slice(0, 12)}…`,
            ])}
          />
        </div>
      ) : null}
    </div>
  );
}
