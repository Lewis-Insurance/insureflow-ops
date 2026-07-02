#!/usr/bin/env bash
# Slice 6 — G4 validation soak: client email, Resend delivery, cancel-block tests
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
ACCOUNT_ID="e97075fc-8ed0-4dd0-b1e4-738135e3ae01"
ACCOUNT_REF="account:$(echo -n "$ACCOUNT_ID" | tr -d '-')"
POLICY_NUMBER="875652030"
STAFF_EMAIL="brian@lewisinsurance.com"
CRON_SECRET="${CRON_SECRET:-floor-dev-soak-cron-20260701}"
TS="$(date +%Y%m%d%H%M%S)"

db_query() {
  curl -sS -X POST "https://api.supabase.com/v1/projects/${DEV_REF}/database/query" \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"query\":$(python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' <<<"$1")}"
}

mint_jwt() {
  local keys_json anon_key service_key link_json access_token session_json
  keys_json=$(curl -sS "https://api.supabase.com/v1/projects/${DEV_REF}/api-keys" \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}")
  anon_key=$(python3 -c "import json,sys; keys=json.load(sys.stdin); print(next(k['api_key'] for k in keys if k.get('name')=='anon'))" <<<"$keys_json")
  service_key=$(python3 -c "import json,sys; keys=json.load(sys.stdin); print(next(k['api_key'] for k in keys if k.get('name')=='service_role'))" <<<"$keys_json")

  link_json=$(curl -sS -X POST "${DEV_URL}/auth/v1/admin/generate_link" \
    -H "apikey: ${service_key}" \
    -H "Authorization: Bearer ${service_key}" \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"magiclink\",\"email\":\"${STAFF_EMAIL}\"}")
  access_token=$(python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('hashed_token') or d.get('properties',{}).get('hashed_token') or '')" <<<"$link_json")
  session_json=$(curl -sS -X POST "${DEV_URL}/auth/v1/verify" \
    -H "apikey: ${anon_key}" \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"magiclink\",\"token_hash\":\"${access_token}\"}")
  JWT=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('access_token',''))" <<<"$session_json")
  ANON_KEY="$anon_key"
  SERVICE_KEY="$service_key"
  ACTOR_ID=$(db_query "SELECT id::text FROM auth.users WHERE email = '${STAFF_EMAIL}' LIMIT 1" \
    | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['id'])")
}

create_id_card_package() {
  local idem_key="$1"
  curl -sS -X POST "${DEV_URL}/functions/v1/floor-action" \
    -H "Authorization: Bearer ${JWT}" \
    -H "apikey: ${ANON_KEY}" \
    -H "Content-Type: application/json" \
    -d "{
      \"action\": \"create_internal_package\",
      \"agency_workspace_id\": \"${AGENCY_WS}\",
      \"idempotency_key\": \"${idem_key}\",
      \"play_id\": \"id.card.issue\",
      \"play_version\": \"1.0.0\",
      \"clientRef\": \"${ACCOUNT_REF}\",
      \"source\": \"crm_button\"
    }"
}

approve_package() {
  local wr_ref="$1"
  local pkg_ref="$2"
  curl -sS -X POST "${DEV_URL}/functions/v1/floor-action" \
    -H "Authorization: Bearer ${JWT}" \
    -H "apikey: ${ANON_KEY}" \
    -H "Content-Type: application/json" \
    -d "{
      \"action\": \"feedback\",
      \"agency_workspace_id\": \"${AGENCY_WS}\",
      \"workRequestRef\": \"${wr_ref}\",
      \"packageRef\": \"${pkg_ref}\",
      \"verb\": \"approve\",
      \"actor_id\": \"${ACTOR_ID}\"
    }"
}

release_held_sends() {
  curl -sS -X POST "${DEV_URL}/functions/v1/floor-release-held-sends" \
    -H "Authorization: Bearer ${SERVICE_KEY}" \
    -H "apikey: ${ANON_KEY}" \
    -H "Content-Type: application/json" \
    -H "X-Cron-Secret: ${CRON_SECRET}"
}

cancel_test_policy() {
  db_query "UPDATE policies SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW() WHERE policy_number = '${POLICY_NUMBER}' AND account_id = '${ACCOUNT_ID}'::uuid RETURNING id::text"
}

restore_test_policy() {
  db_query "UPDATE policies SET status = 'active', cancelled_at = NULL, updated_at = NOW() WHERE policy_number = '${POLICY_NUMBER}' AND account_id = '${ACCOUNT_ID}'::uuid RETURNING id::text"
}

echo "=== Slice 6 G4 soak: id.card.issue (client mode) ==="
mint_jwt

CLIENT_EMAIL=$(db_query "SELECT lower(trim(email)) AS email FROM accounts WHERE id = '${ACCOUNT_ID}'::uuid" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['email'])")
echo "Expected client recipient: ${CLIENT_EMAIL}"

echo ""
echo "--- Part A: G4 happy path (create → approve → release → sent) ---"
restore_test_policy >/dev/null

CREATE_JSON=$(create_id_card_package "g4-happy-${TS}")
echo "$CREATE_JSON" | python3 -m json.tool
python3 -c "import json,sys; assert json.load(sys.stdin).get('ok') is True" <<<"$CREATE_JSON"

WR_REF=$(python3 -c "import json,sys; print(json.load(sys.stdin)['workRequestRef'])" <<<"$CREATE_JSON")
PKG_REF=$(python3 -c "import json,sys; print(json.load(sys.stdin)['packageRef'])" <<<"$CREATE_JSON")
PKG_HEX="${PKG_REF#package:}"
PKG_UUID=$(python3 -c "s='${PKG_HEX}'; print(f'{s[:8]}-{s[8:12]}-{s[12:16]}-{s[16:20]}-{s[20:]}')")

RECIPIENT=$(db_query "SELECT send_spec->>'recipient' AS recipient FROM decision_packages WHERE id = '${PKG_UUID}'::uuid" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['recipient'])")
echo "Package recipient: ${RECIPIENT}"
if [[ "$(echo "$RECIPIENT" | tr '[:upper:]' '[:lower:]')" != "$(echo "$CLIENT_EMAIL" | tr '[:upper:]' '[:lower:]')" ]]; then
  echo "FAIL: recipient is not account email on file (G4)"
  exit 1
fi
echo "OK: G4 recipient matches account on file"

SLACK_ROW=$(db_query "SELECT COUNT(*)::int AS cnt FROM floor_list_undelivered_slack_packages(25) p WHERE p.package_ref = '${PKG_REF}'" 2>/dev/null || echo '[{"cnt":0}]')
SLACK_CNT=$(python3 -c "import json,sys; print(json.load(sys.stdin)[0].get('cnt',0))" <<<"$SLACK_ROW" 2>/dev/null || echo 0)
echo "Slack undelivered queue contains package: ${SLACK_CNT} (1 = ready for Mac Mini delivery)"

APPROVE_JSON=$(approve_package "$WR_REF" "$PKG_REF")
echo "$APPROVE_JSON" | python3 -m json.tool
python3 -c "import json,sys; s=json.load(sys.stdin).get('sendStaging'); assert s and s.get('staged') is True" <<<"$APPROVE_JSON"

echo "Waiting 31s for undo hold..."
sleep 31

RELEASE_JSON=$(release_held_sends)
echo "$RELEASE_JSON" | python3 -m json.tool

RELEASE_STATUS=$(python3 -c "import json,sys; r=json.load(sys.stdin).get('results',[{}])[0]; print(r.get('status',''))" <<<"$RELEASE_JSON")
if [[ "$RELEASE_STATUS" == "sent" ]]; then
  echo "OK: Provider delivery succeeded (Resend sent)"
elif [[ "$RELEASE_STATUS" == "failed_delivery" ]]; then
  echo "WARN: Fence path OK but Resend failed — set a valid RESEND_API_KEY on dev Supabase secrets"
else
  echo "FAIL: unexpected release status: ${RELEASE_STATUS}"
  exit 1
fi

FENCE=$(db_query "SELECT consumed_at IS NOT NULL AS fence_consumed FROM client_send_approvals WHERE surface = 'send-id-card-email' ORDER BY created_at DESC LIMIT 1")
echo "Fence consume: $FENCE"

echo ""
echo "--- Part B: cancel-block before approve ---"
restore_test_policy >/dev/null
CREATE_B=$(create_id_card_package "g4-cancel-pre-${TS}")
WR_B=$(python3 -c "import json,sys; print(json.load(sys.stdin)['workRequestRef'])" <<<"$CREATE_B")
PKG_B=$(python3 -c "import json,sys; print(json.load(sys.stdin)['packageRef'])" <<<"$CREATE_B")
cancel_test_policy >/dev/null

APPROVE_B=$(approve_package "$WR_B" "$PKG_B")
echo "$APPROVE_B" | python3 -m json.tool
if python3 -c "import json,sys; d=json.load(sys.stdin); exit(0 if d.get('error')=='send_staging_failed' else 1)" <<<"$APPROVE_B" 2>/dev/null; then
  echo "OK: Approve blocked after same-day cancellation"
else
  echo "FAIL: Approve should fail when policy cancelled before staging"
  restore_test_policy >/dev/null
  exit 1
fi
restore_test_policy >/dev/null

echo ""
echo "--- Part C: cancel-block during hold (release re-check) ---"
CREATE_C=$(create_id_card_package "g4-cancel-hold-${TS}")
WR_C=$(python3 -c "import json,sys; print(json.load(sys.stdin)['workRequestRef'])" <<<"$CREATE_C")
PKG_C=$(python3 -c "import json,sys; print(json.load(sys.stdin)['packageRef'])" <<<"$CREATE_C")
APPROVE_C=$(approve_package "$WR_C" "$PKG_C")
python3 -c "import json,sys; s=json.load(sys.stdin).get('sendStaging'); assert s and s.get('staged') is True" <<<"$APPROVE_C"
cancel_test_policy >/dev/null
echo "Policy cancelled during hold; waiting 31s for hold window to expire..."
sleep 31
RELEASE_C=$(release_held_sends)
echo "$RELEASE_C" | python3 -m json.tool
if python3 -c "
import json,sys
data=json.load(sys.stdin)
for r in data.get('results',[]):
  if r.get('status')=='failed' and 'not in force' in str(r.get('error','')).lower():
    sys.exit(0)
sys.exit(1)
" <<<"$RELEASE_C" 2>/dev/null; then
  echo "OK: Release blocked after cancellation during hold"
else
  # Also accept if result shows failed with in_force message in top-level error
  if echo "$RELEASE_C" | grep -qi 'not in force'; then
    echo "OK: Release blocked after cancellation during hold"
  else
    echo "FAIL: Release should block when policy lapsed during hold"
    restore_test_policy >/dev/null
    exit 1
  fi
fi
restore_test_policy >/dev/null

echo ""
echo "=== Slice 6 G4 soak complete ==="
