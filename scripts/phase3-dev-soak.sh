#!/usr/bin/env bash
# Phase 3 dev soak — Play 4 id.card.issue (legacy; use phase3-g4-soak.sh for G4 validation)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env.local ]]; then
  # shellcheck disable=SC1091
  source .env.local
fi

: "${SUPABASE_ACCESS_TOKEN:?Set SUPABASE_ACCESS_TOKEN in .env.local}"

DEV_REF="klnygbbmognbslgobmzc"
DEV_URL="https://${DEV_REF}.supabase.co"
AGENCY_WS="f1f07037-3032-45f8-93ca-72c0f47e4fbb"
# Gerald Depoi — in-force auto + ID card PDF in documents bucket
ACCOUNT_ID="e97075fc-8ed0-4dd0-b1e4-738135e3ae01"
ACCOUNT_REF="account:$(echo -n "$ACCOUNT_ID" | tr -d '-')"
STAFF_EMAIL="brian@lewisinsurance.com"
CRON_SECRET="${CRON_SECRET:-floor-dev-soak-cron-20260701}"
IDEM_KEY="phase3-id-card-$(date +%Y%m%d%H%M%S)"

echo "=== Phase 3 dev soak: id.card.issue ==="

KEYS_JSON=$(curl -sS "https://api.supabase.com/v1/projects/${DEV_REF}/api-keys" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}")
ANON_KEY=$(python3 -c "import json,sys; keys=json.load(sys.stdin); print(next(k['api_key'] for k in keys if k.get('name')=='anon'))" <<<"$KEYS_JSON")
SERVICE_KEY=$(python3 -c "import json,sys; keys=json.load(sys.stdin); print(next(k['api_key'] for k in keys if k.get('name')=='service_role'))" <<<"$KEYS_JSON")

LINK_JSON=$(curl -sS -X POST "${DEV_URL}/auth/v1/admin/generate_link" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"magiclink\",\"email\":\"${STAFF_EMAIL}\"}")

ACCESS_TOKEN=$(python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('hashed_token') or d.get('properties',{}).get('hashed_token') or '')" <<<"$LINK_JSON")
if [[ -z "$ACCESS_TOKEN" ]]; then
  echo "Failed to mint staff session token for ${STAFF_EMAIL}"
  echo "$LINK_JSON" | python3 -m json.tool || true
  exit 1
fi

SESSION_JSON=$(curl -sS -X POST "${DEV_URL}/auth/v1/verify" \
  -H "apikey: ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"magiclink\",\"token_hash\":\"${ACCESS_TOKEN}\"}")
JWT=$(python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('access_token',''))" <<<"$SESSION_JSON")
if [[ -z "$JWT" ]]; then
  echo "Failed to verify magic link session"
  echo "$SESSION_JSON" | python3 -m json.tool || true
  exit 1
fi

echo "1. create_internal_package (id.card.issue)..."
CREATE_JSON=$(curl -sS -X POST "${DEV_URL}/functions/v1/floor-action" \
  -H "Authorization: Bearer ${JWT}" \
  -H "apikey: ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"action\": \"create_internal_package\",
    \"agency_workspace_id\": \"${AGENCY_WS}\",
    \"idempotency_key\": \"${IDEM_KEY}\",
    \"play_id\": \"id.card.issue\",
    \"play_version\": \"1.0.0\",
    \"clientRef\": \"${ACCOUNT_REF}\",
    \"source\": \"crm_button\"
  }")

echo "$CREATE_JSON" | python3 -m json.tool
OK=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('ok', False))" <<<"$CREATE_JSON")
if [[ "$OK" != "True" ]]; then
  echo "create_internal_package failed"
  exit 1
fi

WR_REF=$(python3 -c "import json,sys; print(json.load(sys.stdin)['workRequestRef'])" <<<"$CREATE_JSON")
PKG_REF=$(python3 -c "import json,sys; print(json.load(sys.stdin)['packageRef'])" <<<"$CREATE_JSON")
ACTOR_ID=$(curl -sS -X POST "https://api.supabase.com/v1/projects/${DEV_REF}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"SELECT id::text FROM auth.users WHERE email = '${STAFF_EMAIL}' LIMIT 1\"}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['id'])")

echo "2. approve (feedback)..."
APPROVE_JSON=$(curl -sS -X POST "${DEV_URL}/functions/v1/floor-action" \
  -H "Authorization: Bearer ${JWT}" \
  -H "apikey: ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"action\": \"feedback\",
    \"agency_workspace_id\": \"${AGENCY_WS}\",
    \"workRequestRef\": \"${WR_REF}\",
    \"packageRef\": \"${PKG_REF}\",
    \"verb\": \"approve\",
    \"actor_id\": \"${ACTOR_ID}\"
  }")

echo "$APPROVE_JSON" | python3 -m json.tool
STAGING=$(python3 -c "import json,sys; s=json.load(sys.stdin).get('sendStaging'); print(s.get('staged') if s else False)" <<<"$APPROVE_JSON")
if [[ "$STAGING" != "True" ]]; then
  echo "Approve did not stage held send"
  exit 1
fi

echo "3. verify portal_id_cards populated..."
CARD_CNT=$(curl -sS -X POST "https://api.supabase.com/v1/projects/${DEV_REF}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"SELECT COUNT(*)::int AS cnt FROM portal_id_cards WHERE account_id = '${ACCOUNT_ID}'::uuid\"}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['cnt'])")
echo "portal_id_cards rows for account: ${CARD_CNT}"

echo "4. wait 31s for undo hold..."
sleep 31

echo "5. release held sends..."
RELEASE_JSON=$(curl -sS -X POST "${DEV_URL}/functions/v1/floor-release-held-sends" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "apikey: ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -H "X-Cron-Secret: ${CRON_SECRET}")

echo "$RELEASE_JSON" | python3 -m json.tool

echo "6. verify floor_client_send_approvals + client_send_approvals..."
curl -sS -X POST "https://api.supabase.com/v1/projects/${DEV_REF}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"SELECT status, recipient, message_id FROM floor_client_send_approvals ORDER BY created_at DESC LIMIT 1\"}" \
  | python3 -m json.tool

curl -sS -X POST "https://api.supabase.com/v1/projects/${DEV_REF}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"SELECT surface, approval_ref, consumed_at IS NOT NULL AS fence_consumed FROM client_send_approvals WHERE surface = 'send-id-card-email' ORDER BY created_at DESC LIMIT 1\"}" \
  | python3 -m json.tool

echo "=== Phase 3 soak complete ==="
