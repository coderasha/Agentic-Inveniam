# GAIN Tokenization

## Status

Implemented in `@gain/platform-api` under `/api/v1/tokenization` (port **3003**).

## Capabilities

| Capability | Detail |
|------------|--------|
| Instruments | Symbol, subject link (asset/twin/portfolio/custom), supply cap, network |
| Ledger | Mint, burn, transfer, freeze/unfreeze with balance + cap enforcement |
| Holdings | Cap-table style balances per `holderRef` |
| Tx chain | Deterministic SHA-256 `txHash` linked to previous entry |
| Settlement | `offchain` settles immediately; `polygon_amoy` / `fabric_dev` stay `pending` |
| Events | Outbox → `gain.tokenization.*` |
| Console | `/tokenization` |

## Honest limits

- **No live Fabric or Polygon connectors** — choosing those networks records pending settlements only
- Holder identity is a string reference (`issuer`, wallet address, user id) — not a full wallet custody system
- Not a securities issuance / Reg D workflow suite

## APIs

OpenAPI: http://localhost:3003/api/docs

- `POST|GET|PATCH /tokenization/instruments…`
- `POST /tokenization/instruments/:id/mint|burn|transfer|freeze`
- `GET /tokenization/instruments/:id/holdings`
- `GET /tokenization/instruments/:id/ledger`
