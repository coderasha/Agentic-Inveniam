#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
set -a
# shellcheck disable=SC1091
source .env
set +a

API="${NEXT_PUBLIC_IDENTITY_API_URL:-http://localhost:3001}"

echo "==> Health live"
curl -sf "$API/api/health/live" | tee /tmp/gain-health-live.json
echo

echo "==> Minting dev token"
TOKEN="$(pnpm exec tsx scripts/mint-dev-token.ts)"
AUTH="Authorization: Bearer $TOKEN"

echo "==> List organizations"
curl -sf -H "$AUTH" "$API/api/v1/organizations?page=1&pageSize=5" | tee /tmp/gain-orgs.json
echo

ORG_ID="$(node -e "const d=require('/tmp/gain-orgs.json'); process.stdout.write(d.data?.[0]?.id||'')")"
if [[ -z "$ORG_ID" ]]; then
  echo "==> Creating organization"
  SLUG="smoke-$(date +%s)"
  curl -sf -H "$AUTH" -H 'Content-Type: application/json' \
    -d "{\"name\":\"Smoke Org\",\"slug\":\"$SLUG\",\"countryCode\":\"US\",\"timezone\":\"UTC\"}" \
    "$API/api/v1/organizations" | tee /tmp/gain-org-create.json
  echo
  ORG_ID="$(node -e "const d=require('/tmp/gain-org-create.json'); process.stdout.write(d.id)")"
fi

echo "==> List roles (org=$ORG_ID)"
curl -sf -H "$AUTH" -H "x-organization-id: $ORG_ID" \
  "$API/api/v1/roles?page=1&pageSize=10&includeSystem=true" | tee /tmp/gain-roles.json
echo

echo "==> List users"
curl -sf -H "$AUTH" -H "x-organization-id: $ORG_ID" \
  "$API/api/v1/users?page=1&pageSize=10&organizationId=$ORG_ID" | tee /tmp/gain-users.json
echo

echo "Identity smoke checks passed."
