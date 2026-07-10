import { describe, expect, it } from 'vitest';
import { matchOrderAgainstListing } from './matching';

describe('marketplace matching', () => {
  const listing = {
    priceMinor: 100_00n,
    quantityRemaining: 10n,
    status: 'open' as const,
    sellerRef: 'seller',
    expiresAt: null,
  };

  it('fills market orders at ask', () => {
    const result = matchOrderAgainstListing(listing, {
      orderType: 'market',
      priceMinor: null,
      quantity: 4n,
      buyerRef: 'buyer',
    });
    expect(result.accepted).toBe(true);
    expect(result.fill?.quantity).toBe(4n);
    expect(result.fill?.priceMinor).toBe(100_00n);
    expect(result.listingQuantityRemaining).toBe(6n);
    expect(result.listingStatus).toBe('partially_filled');
    expect(result.orderStatus).toBe('filled');
  });

  it('rests limit orders below ask without fill', () => {
    const result = matchOrderAgainstListing(listing, {
      orderType: 'limit',
      priceMinor: 90_00n,
      quantity: 2n,
      buyerRef: 'buyer',
    });
    expect(result.accepted).toBe(true);
    expect(result.fill).toBeNull();
    expect(result.orderStatus).toBe('open');
    expect(result.listingQuantityRemaining).toBe(10n);
  });

  it('rejects self-trade and overfill caps at remaining', () => {
    expect(
      matchOrderAgainstListing(listing, {
        orderType: 'market',
        priceMinor: null,
        quantity: 1n,
        buyerRef: 'seller',
      }).accepted,
    ).toBe(false);

    const result = matchOrderAgainstListing(listing, {
      orderType: 'limit',
      priceMinor: 100_00n,
      quantity: 50n,
      buyerRef: 'buyer',
    });
    expect(result.fill?.quantity).toBe(10n);
    expect(result.listingStatus).toBe('filled');
    expect(result.orderStatus).toBe('partially_filled');
  });
});
