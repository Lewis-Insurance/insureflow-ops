#!/usr/bin/env bash
# Phase 3 Slice 7 — kill-during-hold + release sweeper soak (dev)
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
STAFF_EMAIL="brian@lewisinsurance.com"
CRON_SECRET="${CRON_SECRET:-floor-dev-soak-cron-20260701}"
TS="$(date +%Y%m%d%H%M%S)"
IDEM_KEY="phase3-slice7-kill-${TS}"

db_query() {
  curl -sS -X POST "https://api.supabase.com/v1/projects/${DEV_REF}/database/query" \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"query\":$(python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' <<<"$1")}"
}

mint_jwt() {
  local keys_json link_json access_token session_json
  keys_json=$(curl -sS "https://api.supabase.com/v1/projects/${DEV_REF}/api-keys" \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}")
  ANON_KEY=$(python3 -c "import json,sys; keys=json.load(sys.stdin); print(next(k['api_key'] for k in keys if k.get('name')=='anon'))" <<<"$keys_json")
  SERVICE_KEY=$(python3 -c "import json,sys; keys=json.load(sys.stdin); print(next(k['api_key'] for k in keys if k.get('name')=='service_role'))" <<<"$keys_json")

  link_json=$(curl -sS -X POST "${DEV_URL}/auth/v1/admin/generate_link" \
    -H "apikey: ${SERVICE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"magiclink\",\"email\":\"${STAFF_EMAIL}\"}")
  access_token=$(python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('hashed_token') or d.get('properties',{}).get('hashed_token') or '')" <<<"$link_json")
  session_json=$(curl -sS -X POST "${DEV_URL}/auth/v1/verify" \
    -H "apikey: ${ANON_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"magiclink\",\"token_hash\":\"${access_token}\"}")
  JWT=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('access_token',''))" <<<"$session_json")
  ACTOR_ID=$(db_query "SELECT id::text FROM auth.users WHERE email = '${STAFF_EMAIL}' LIMIT 1" \
    | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['id'])")
}

invoke_create_package() {
  curl -sS -X POST "${DEV_URL}/functions/v1/floor-action" \
    -H "Authorization: Bearer ${JWT}" \
    -H "apikey: ${ANON_KEY}" \
    -H "Content-Type: application/json" \
    -d "{
      \"action\":\"create_internal_package\",
      \"agency_workspace_id\":\"${AGENCY_WS}\",
      \"play_id\":\"id.card.issue\",
      \"play_version\":\"1.0.0\",
      \"clientRef\":\"${ACCOUNT_REF}\",
      \"idempotency_key\":\"${IDEM_KEY}\",
      \"source\":\"crm_button\"
    }"
}

invoke_feedback() {
  local verb="$1"
  local wr_ref="$2"
  local pkg_ref="$3"
  curl -sS -X POST "${DEV_URL}/functions/v1/floor-action" \
    -H "Authorization: Bearer ${JWT}" \
    -H "apikey: ${ANON_KEY}" \
    -H "Content-Type: application/json" \
    -d "{
      \"action\":\"feedback\",
      \"agency_workspace_id\":\"${AGENCY_WS}\",
      \"verb\":\"${verb}\",
      \"actor_id\":\"${ACTOR_ID}\",
      \"workRequestRef\":\"${wr_ref}\",
      \"packageRef\":\"${pkg_ref}\",
      \"kill_reason\":\"slice7 soak kill during hold\"
    }"
}

invoke_release_sweeper() {
  curl -sS -X POST "${DEV_URL}/functions/v1/floor-release-held-sends" \
    -H "Authorization: Bearer ${SERVICE_KEY}" \
    -H "apikey: ${ANON_KEY}" \
    -H "X-Cron-Secret: ${CRON_SECRET}" \
    -H "Content-Type: application/json"
}

echo "=== Phase 3 Slice 7 — kill-during-hold soak ==="
mint_jwt

echo ""
echo "--- Part A: create id.card.issue package ---"
CREATE_JSON=$(invoke_create_package)
echo "$CREATE_JSON" | python3 -m json.tool
WR_REF=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('workRequestRef',''))" <<<"$CREATE_JSON")
PKG_REF=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('packageRef',''))" <<<"$CREATE_JSON")
if [[ -z "$WR_REF" || -z "$PKG_REF" ]]; then
  echo "FAIL: could not create package"
  exit 1
fi
LATENCY=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('intake_latency_ms',''))" <<<"$CREATE_JSON")
echo "intake_latency_ms=${LATENCY}"

echo ""
echo "--- Part B: approve (stage held send) ---"
APPROVE_JSON=$(invoke_feedback approve "$WR_REF" "$PKG_REF")
echo "$APPROVE_JSON" | python3 -m json.tool
STAGED=$(python3 -c "import json,sys; d=json.load(sys.stdin); s=d.get('sendStaging') or {}; print('yes' if s.get('staged') else 'no')" <<<"$APPROVE_JSON")
if [[ "$STAGED" != "yes" ]]; then
  echo "FAIL: approve did not stage held send"
  exit 1
fi

WR_ID=$(python3 -c "import re,sys; m=re.search(r'work_request:([0-9a-f]{32})', sys.argv[1]); h=m.group(1) if m else ''; print(f'{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:]}' if h else '')" "$WR_REF")

echo ""
echo "--- Part C: kill during hold ---"
KILL_JSON=$(invoke_feedback kill "$WR_REF" "$PKG_REF")
echo "$KILL_JSON" | python3 -m json.tool

APPROVAL_STATUS=$(db_query "
  SELECT status FROM floor_client_send_approvals
  WHERE work_request_id = '${WR_ID}'::uuid
  LIMIT 1
" | python3 -c "import json,sys; rows=json.load(sys.stdin); print(rows[0]['status'] if rows else '')")
echo "floor_client_send_approvals.status=${APPROVAL_STATUS}"
if [[ "$APPROVAL_STATUS" != "killed" ]]; then
  echo "FAIL: expected approval status killed after kill verb"
  exit 1
fi

echo ""
echo "--- Part D: release sweeper must not deliver killed send ---"
db_query "
  UPDATE floor_client_send_approvals
  SET hold_until = NOW() - INTERVAL '1 minute'
  WHERE work_request_id = '${WR_ID}'::uuid
" > /dev/null

RELEASE_JSON=$(invoke_release_sweeper)
echo "$RELEASE_JSON" | python3 -m json.tool

SENT_CNT=$(db_query "
  SELECT COUNT(*)::int AS cnt FROM floor_client_send_approvals
  WHERE work_request_id = '${WR_ID}'::uuid AND status IN ('sent','delivered')
" | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['cnt'])")
if [[ "${SENT_CNT}" -ne 0 ]]; then
  echo "FAIL: killed send was delivered"
  exit 1
fi
echo "provider_send_blocked=yes"

echo ""
echo "=== Phase 3 Slice 7 soak complete (${TS}) ==="
