#!/usr/bin/env bash
# Phase 5 Slice 1 — heartbeat.book.scan end-to-end soak (dev)
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
CRON_SECRET="${CRON_SECRET:-floor-dev-soak-cron-20260701}"
DAY_KEY="$(date -u +%Y-%m-%d)"
TS="$(date +%Y%m%d%H%M%S)"

# Small limits for live soak to avoid flooding dev inbox
HB_PLAY1=2
HB_PLAY3=2
HB_PLAY4=2
HB_PLAY5=2
HB_PLAY6=2

mint_service_key() {
  local keys_json
  keys_json=$(curl -sS "https://api.supabase.com/v1/projects/${DEV_REF}/api-keys" \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}")
  SERVICE_KEY=$(python3 -c "import json,sys; keys=json.load(sys.stdin); print(next(k['api_key'] for k in keys if k.get('name')=='service_role'))" <<<"$keys_json")
}

invoke_gap_detection() {
  curl -sS -X POST \
    "${DEV_URL}/functions/v1/run-coverage-gap-detection?agency_workspace_id=${AGENCY_WS}&create_tasks=false" \
    -H "Authorization: Bearer ${SERVICE_KEY}" \
    -H "X-Cron-Secret: ${CRON_SECRET}" \
    -H "Content-Type: application/json"
}

invoke_heartbeat() {
  local dry_run="$1"
  curl -sS -X POST "${DEV_URL}/functions/v1/floor-run-plays" \
    -H "Authorization: Bearer ${SERVICE_KEY}" \
    -H "X-Cron-Secret: ${CRON_SECRET}" \
    -H "Content-Type: application/json" \
    -d "{
      \"agency_workspace_id\":\"${AGENCY_WS}\",
      \"heartbeat\":true,
      \"dry_run\":${dry_run},
      \"play1_limit\":${HB_PLAY1},
      \"play3_limit\":${HB_PLAY3},
      \"play4_limit\":${HB_PLAY4},
      \"play5_limit\":${HB_PLAY5},
      \"play6_limit\":${HB_PLAY6}
    }"
}

echo "=== Phase 5 Slice 1 — heartbeat.book.scan soak ==="
mint_service_key

echo ""
echo "--- Part 0: gap detection (pre-heartbeat) ---"
invoke_gap_detection | python3 -m json.tool 2>/dev/null || true

echo ""
echo "--- Part A: heartbeat dry_run ---"
DRY_JSON=$(invoke_heartbeat true)
echo "$DRY_JSON" | python3 -m json.tool
DRY_OK=$(python3 -c "import json,sys; d=json.load(sys.stdin); print('yes' if d.get('ok') and d.get('heartbeat') and d.get('dry_run') else 'no')" <<<"$DRY_JSON")
PLANNED=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('planned',0))" <<<"$DRY_JSON")
if [[ "$DRY_OK" != "yes" ]]; then
  echo "FAIL: heartbeat dry_run"
  exit 1
fi
if [[ "${PLANNED}" -lt 1 ]]; then
  echo "WARN: heartbeat planned zero cards (dev book may be quiet)"
fi
echo "planned=${PLANNED}"

echo ""
echo "--- Part B: heartbeat live (capped limits) ---"
LIVE_JSON=$(invoke_heartbeat false)
echo "$LIVE_JSON" | python3 -m json.tool
CREATED=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('created',0))" <<<"$LIVE_JSON")
IDEMPOTENT=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('idempotent',0))" <<<"$LIVE_JSON")
echo "created=${CREATED} idempotent=${IDEMPOTENT}"

if [[ "${PLANNED}" -gt 0 && "${CREATED}" -eq 0 && "${IDEMPOTENT}" -eq 0 ]]; then
  echo "FAIL: planned cards but none created/idempotent"
  exit 1
fi

echo ""
echo "--- Part C: idempotency replay ---"
REPLAY_JSON=$(invoke_heartbeat false)
REPLAY_IDEM=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('idempotent',0))" <<<"$REPLAY_JSON")
echo "replay idempotent=${REPLAY_IDEM}"
if [[ "${CREATED}" -gt 0 && "${REPLAY_IDEM}" -lt 1 ]]; then
  echo "WARN: expected idempotent hits after live create"
fi

echo ""
echo "=== Phase 5 Slice 1 soak complete (${TS}, day=${DAY_KEY}) ==="
