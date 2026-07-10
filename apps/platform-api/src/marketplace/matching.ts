export interface MatchListingState {
  priceMinor: bigint;
  quantityRemaining: bigint;
  status: 'open' | 'partially_filled' | 'filled' | 'cancelled' | 'expired' | 'draft';
  sellerRef: string;
  expiresAt?: string | null;
}

export interface MatchOrderInput {
  orderType: 'limit' | 'market';
  priceMinor: bigint | null;
  quantity: bigint;
  buyerRef: string;
}

export interface MatchFill {
  quantity: bigint;
  priceMinor: bigint;
  notionalMinor: bigint;
}

export interface MatchResult {
  accepted: boolean;
  reason?: string;
  fill: MatchFill | null;
  listingQuantityRemaining: bigint;
  listingStatus: MatchListingState['status'];
  orderFilledQuantity: bigint;
  orderStatus: 'open' | 'partially_filled' | 'filled' | 'cancelled' | 'rejected';
}

/** Deterministic listing×order matcher (price-time: listing ask is firm). */
export function matchOrderAgainstListing(
  listing: MatchListingState,
  order: MatchOrderInput,
  nowIso = new Date().toISOString(),
): MatchResult {
  if (listing.status === 'cancelled' || listing.status === 'filled' || listing.status === 'draft') {
    return reject(`listing is ${listing.status}`);
  }
  if (listing.status === 'expired' || (listing.expiresAt && listing.expiresAt <= nowIso)) {
    return reject('listing is expired');
  }
  if (listing.quantityRemaining <= 0n) {
    return reject('listing has no remaining quantity');
  }
  if (order.quantity <= 0n) {
    return reject('order quantity must be positive');
  }
  if (order.buyerRef === listing.sellerRef) {
    return reject('buyer cannot be the seller');
  }

  if (order.orderType === 'limit') {
    if (order.priceMinor === null) return reject('limit orders require priceMinor');
    if (order.priceMinor < listing.priceMinor) {
      return {
        accepted: true,
        fill: null,
        listingQuantityRemaining: listing.quantityRemaining,
        listingStatus: listing.status === 'partially_filled' ? 'partially_filled' : 'open',
        orderFilledQuantity: 0n,
        orderStatus: 'open',
        reason: 'limit price below ask — resting order',
      };
    }
  }

  const fillQty = order.quantity < listing.quantityRemaining
    ? order.quantity
    : listing.quantityRemaining;
  const price = listing.priceMinor;
  const remaining = listing.quantityRemaining - fillQty;

  return {
    accepted: true,
    fill: {
      quantity: fillQty,
      priceMinor: price,
      notionalMinor: price * fillQty,
    },
    listingQuantityRemaining: remaining,
    listingStatus: remaining === 0n ? 'filled' : 'partially_filled',
    orderFilledQuantity: fillQty,
    orderStatus: fillQty === order.quantity ? 'filled' : 'partially_filled',
  };
}

function reject(reason: string): MatchResult {
  return {
    accepted: false,
    reason,
    fill: null,
    listingQuantityRemaining: 0n,
    listingStatus: 'cancelled',
    orderFilledQuantity: 0n,
    orderStatus: 'rejected',
  };
}
