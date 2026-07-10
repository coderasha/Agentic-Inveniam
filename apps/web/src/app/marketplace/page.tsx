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

export default function MarketplacePage() {
  const organizationId = useIdentityStore((s) => s.organizationId);
  const qc = useQueryClient();
  const [title, setTitle] = useState('Office Tower Interest');
  const [sellerRef, setSellerRef] = useState('seller');
  const [subjectId, setSubjectId] = useState('00000000-0000-4000-8000-000000000001');
  const [priceMinor, setPriceMinor] = useState('1000000');
  const [quantity, setQuantity] = useState('10');
  const [listingId, setListingId] = useState('');
  const [buyerRef, setBuyerRef] = useState('buyer-1');
  const [orderQty, setOrderQty] = useState('2');
  const [orderPrice, setOrderPrice] = useState('1000000');

  const listingsQuery = useQuery({
    queryKey: ['marketplace-listings', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => platformApi.listMarketplaceListings(organizationId!),
  });
  const ordersQuery = useQuery({
    queryKey: ['marketplace-orders', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => platformApi.listMarketplaceOrders(organizationId!),
  });
  const tradesQuery = useQuery({
    queryKey: ['marketplace-trades', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => platformApi.listMarketplaceTrades(organizationId!),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      platformApi.createMarketplaceListing(organizationId!, {
        title,
        sellerRef,
        subjectType: 'custom',
        subjectId,
        priceMinor,
        quantity,
        currencyCode: 'USD',
      }),
    onSuccess: async (row) => {
      setListingId(String(row.id));
      await qc.invalidateQueries({ queryKey: ['marketplace-listings', organizationId] });
    },
  });

  const orderMutation = useMutation({
    mutationFn: () =>
      platformApi.placeMarketplaceOrder(organizationId!, {
        listingId,
        buyerRef,
        orderType: 'limit',
        priceMinor: orderPrice,
        quantity: orderQty,
      }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['marketplace-listings', organizationId] }),
        qc.invalidateQueries({ queryKey: ['marketplace-orders', organizationId] }),
        qc.invalidateQueries({ queryKey: ['marketplace-trades', organizationId] }),
      ]);
    },
  });

  if (!organizationId) {
    return (
      <div>
        <PageHeader
          title="Marketplace"
          description="Private-asset listings with limit/market buy orders and deterministic matching."
        />
        <EmptyState
          title="Select an organization"
          description="Marketplace activity is organization-scoped."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketplace"
        description="Ask listings + buy orders. Fills settle in-ledger with a settlement receipt — not a public exchange or custody rail."
      />

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-md border border-[var(--gain-border)] p-4 space-y-3">
          <div className="font-medium">Create listing</div>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
          <Input value={sellerRef} onChange={(e) => setSellerRef(e.target.value)} placeholder="Seller ref" />
          <Input value={subjectId} onChange={(e) => setSubjectId(e.target.value)} placeholder="Subject UUID" />
          <Input value={priceMinor} onChange={(e) => setPriceMinor(e.target.value)} placeholder="Price (minor units)" />
          <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Quantity" />
          <Button
            disabled={!title || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            List
          </Button>
        </div>
        <div className="rounded-md border border-[var(--gain-border)] p-4 space-y-3">
          <div className="font-medium">Place buy order</div>
          <Input value={listingId} onChange={(e) => setListingId(e.target.value)} placeholder="Listing UUID" />
          <Input value={buyerRef} onChange={(e) => setBuyerRef(e.target.value)} placeholder="Buyer ref" />
          <Input value={orderPrice} onChange={(e) => setOrderPrice(e.target.value)} placeholder="Limit price (minor)" />
          <Input value={orderQty} onChange={(e) => setOrderQty(e.target.value)} placeholder="Quantity" />
          <Button
            disabled={!listingId || orderMutation.isPending}
            onClick={() => orderMutation.mutate()}
          >
            Buy
          </Button>
        </div>
      </div>

      {listingsQuery.isLoading ? <LoadingState /> : null}
      {listingsQuery.isError ? <ErrorState message="Failed to load marketplace." /> : null}

      {listingsQuery.data && listingsQuery.data.items.length === 0 ? (
        <EmptyState
          title="No listings"
          description="Create an ask listing, then place a limit buy at or above the ask to fill."
        />
      ) : null}

      {listingsQuery.data && listingsQuery.data.items.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">Listings</h2>
          <DataTable
            columns={['Title', 'Price', 'Remaining', 'Status', 'Id']}
            rows={listingsQuery.data.items.map((row) => [
              String(row.title),
              String(row.priceMinor),
              String(row.quantityRemaining),
              String(row.status),
              <button
                key={String(row.id)}
                type="button"
                className="text-[var(--gain-accent)] underline"
                onClick={() => setListingId(String(row.id))}
              >
                {String(row.id).slice(0, 8)}…
              </button>,
            ])}
          />
        </div>
      ) : null}

      {ordersQuery.data && ordersQuery.data.items.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">Orders</h2>
          <DataTable
            columns={['Buyer', 'Qty', 'Filled', 'Status']}
            rows={ordersQuery.data.items.map((row) => [
              String(row.buyerRef),
              String(row.quantity),
              String(row.filledQuantity),
              String(row.status),
            ])}
          />
        </div>
      ) : null}

      {tradesQuery.data && tradesQuery.data.items.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">Trades</h2>
          <DataTable
            columns={['Buyer', 'Seller', 'Qty', 'Price', 'Notional']}
            rows={tradesQuery.data.items.map((row) => [
              String(row.buyerRef),
              String(row.sellerRef),
              String(row.quantity),
              String(row.priceMinor),
              String(row.notionalMinor),
            ])}
          />
        </div>
      ) : null}
    </div>
  );
}
