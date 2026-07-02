#!/usr/bin/env bash
# Phase 5 Slice 3 — morning tray batch RPC + delivery split soak (dev)
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
TS="$(date +%Y%m%d%H%M%S)"

db_query() {
  curl -sS -X POST "https://api.supabase.com/v1/projects/${DEV_REF}/database/query" \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"query\":$(python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' <<<"$1")}"
}

mint_service_key() {
  local keys_json
  keys_json=$(curl -sS "https://api.supabase.com/v1/projects/${DEV_REF}/api-keys" \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}")
  SERVICE_KEY=$(python3 -c "import json,sys; keys=json.load(sys.stdin); print(next(k['api_key'] for k in keys if k.get('name')=='service_role'))" <<<"$keys_json")
}

invoke_heartbeat() {
  curl -sS -X POST "${DEV_URL}/functions/v1/floor-run-plays" \
    -H "Authorization: Bearer ${SERVICE_KEY}" \
    -H "X-Cron-Secret: ${CRON_SECRET}" \
    -H "Content-Type: application/json" \
    -d "{
      \"agency_workspace_id\":\"${AGENCY_WS}\",
      \"heartbeat\":true,
      \"dry_run\":false,
      \"play1_limit\":1,
      \"play3_limit\":1,
      \"play4_limit\":1,
      \"play5_limit\":1,
      \"play6_limit\":1,
      \"play7_limit\":1
    }"
}

echo "=== Phase 5 Slice 3 — morning tray batch soak ==="
mint_service_key

echo ""
echo "--- Part 0: ensure RPC exists ---"
RPC_CHECK=$(db_query "select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'floor_list_morning_tray_packages';")
RPC_N=$(python3 -c "import json,sys; rows=json.load(sys.stdin); print(rows[0]['n'] if rows else 0)" <<<"$RPC_CHECK")
if [[ "$RPC_N" != "1" ]]; then
  echo "FAIL: floor_list_morning_tray_packages missing — apply migration 20260702140000_floor_morning_tray_batch.sql"
  exit 1
fi
echo "RPC present ✅"

echo ""
echo "--- Part A: heartbeat live (seed heartbeat packages) ---"
HB_JSON=$(invoke_heartbeat)
echo "$HB_JSON" | python3 -m json.tool
HB_OK=$(python3 -c "import json,sys; d=json.load(sys.stdin); print('yes' if d.get('ok') and d.get('heartbeat') else 'no')" <<<"$HB_JSON")
if [[ "$HB_OK" != "yes" ]]; then
  echo "FAIL: heartbeat live"
  exit 1
fi

echo ""
echo "--- Part B: morning tray queue (heartbeat only) ---"
TRAY_ROWS=$(db_query "select package_ref, for_agent_id, tray_summary from public.floor_list_morning_tray_packages(50);")
TRAY_COUNT=$(python3 -c "import json,sys; print(len(json.load(sys.stdin)))" <<<"$TRAY_ROWS")
echo "tray_queue_count=${TRAY_COUNT}"
if [[ "$TRAY_COUNT" -lt 1 ]]; then
  echo "WARN: no heartbeat packages in tray queue (idempotent replay may have zero new rows)"
fi

echo ""
echo "--- Part C: immediate queue excludes heartbeat ---"
IMM_ROWS=$(db_query "select package_ref, for_agent_id from public.floor_list_undelivered_slack_packages(50);")
HB_IN_IMM=$(python3 - <<'PY' "$IMM_ROWS" "$TRAY_ROWS"
import json, sys
imm = json.loads(sys.argv[1])
tray_refs = {r["package_ref"] for r in json.loads(sys.argv[2])}
overlap = [r["package_ref"] for r in imm if r["package_ref"] in tray_refs]
print(len(overlap))
PY
)
if [[ "$HB_IN_IMM" != "0" ]]; then
  echo "FAIL: heartbeat packages leaked into immediate delivery queue"
  exit 1
fi
echo "immediate queue split ✅ (overlap=0)"

echo ""
echo "--- Part D: agent grouping ---"
python3 - <<'PY' "$TRAY_ROWS"
import json, sys
from collections import Counter
rows = json.loads(sys.argv[1])
counts = Counter(r["for_agent_id"] for r in rows)
print(json.dumps({"agents": len(counts), "by_agent": dict(counts)}, indent=2))
PY

echo ""
echo "=== Phase 5 Slice 3 soak complete (${TS}) ==="
echo "Mac Mini live tray DM: cd /Users/rocky/lewis-the-floor && npm run deliver:morning-tray-batch"
echo "Schedule: 13:00 UTC (8 AM ET) after materialize:home-snapshots; keep */2 deliver:canonical-decision-cards for non-heartbeat only."
