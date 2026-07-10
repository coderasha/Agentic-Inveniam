# GAIN Marketplace

## Status

Implemented in `@gain/platform-api` under `/api/v1/marketplace` (port **3003**).

## Capabilities

| Capability | Detail |
|------------|--------|
| Listings | Ask offers against asset / token / twin / custom subjects |
| Orders | Limit and market buy orders against a listing |
| Matching | Deterministic fill at ask when limit ≥ ask (or market); partial fills supported |
| Resting limits | Limit below ask is accepted as open with no fill |
| Trades | Settled trade records with notional + settlement receipt |
| Events | Outbox → `gain.marketplace.*` |
| Console | `/marketplace` |

## Honest limits

- Org-scoped private marketplace — not a public exchange
- No payment rail / escrow / KYC gate
- No automatic token transfer on fill (can be wired to Tokenization later)
- No continuous order-book matching across multiple asks

## APIs

OpenAPI: http://localhost:3003/api/docs

- `POST|GET|PATCH /marketplace/listings…`
- `POST /marketplace/listings/:id/cancel`
- `POST|GET /marketplace/orders…`
- `POST /marketplace/orders/:id/cancel`
- `GET /marketplace/trades`
