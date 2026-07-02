#!/usr/bin/env bash
# Phase 4 Slice 1 — coverage.gap.roundout end-to-end soak (dev)
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
KELLI_ID="e321fae3-f28b-4170-8316-9460cb9eb2fc"
CRON_SECRET="${CRON_SECRET:-floor-dev-soak-cron-20260701}"
DAY_KEY="$(date -u +%Y-%m-%d)"
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

invoke_gap_detection() {
  curl -sS -X POST \
    "${DEV_URL}/functions/v1/run-coverage-gap-detection?agency_workspace_id=${AGENCY_WS}&create_tasks=false" \
    -H "Authorization: Bearer ${SERVICE_KEY}" \
    -H "X-Cron-Secret: ${CRON_SECRET}" \
    -H "Content-Type: application/json"
}

invoke_floor_plays() {
  local dry_run="$1"
  curl -sS -X POST "${DEV_URL}/functions/v1/floor-run-plays" \
    -H "Authorization: Bearer ${SERVICE_KEY}" \
    -H "X-Cron-Secret: ${CRON_SECRET}" \
    -H "Content-Type: application/json" \
    -d "{\"agency_workspace_id\":\"${AGENCY_WS}\",\"play4_only\":true,\"play4_limit\":10,\"dry_run\":${dry_run}}"
}

echo "=== Phase 4 Slice 1 — coverage.gap.roundout soak ==="
mint_service_key

echo ""
echo "--- Part 0: gap detection (populate opportunities) ---"
GAP_RESULT=$(invoke_gap_detection)
echo "$GAP_RESULT" | python3 -m json.tool 2>/dev/null || echo "$GAP_RESULT"

NEW_GAPS=$(db_query "SELECT COUNT(*)::int AS cnt FROM coverage_gap_opportunities WHERE agency_workspace_id = '${AGENCY_WS}'::uuid AND status = 'new'" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['cnt'])")
echo "New gap opportunities: ${NEW_GAPS}"

if [[ "${NEW_GAPS}" -eq 0 ]]; then
  echo "Seeding dev soak gap opportunity for account ${ACCOUNT_ID}..."
  db_query "
    INSERT INTO coverage_gap_opportunities (
      agency_workspace_id, account_id, opportunity_key, severity, confidence,
      rationale, recommended_next_step, status, idempotency_key, detection_version
    ) VALUES (
      '${AGENCY_WS}'::uuid,
      '${ACCOUNT_ID}'::uuid,
      'floor_soak_auto_no_home',
      'high',
      0.85,
      '{\"rule_key\":\"auto_no_home\",\"trigger_reason\":\"Floor Phase 4 soak — auto without homeowners\"}'::jsonb,
      'Quote homeowners for bundle discount',
      'new',
      'floor_soak_auto_no_home_v1_${ACCOUNT_ID}',
      'v1.0.0'
    )
    ON CONFLICT (idempotency_key) DO UPDATE SET
      status = 'new',
      last_detected_at = NOW(),
      updated_at = NOW()
    RETURNING id::text
  " | python3 -m json.tool
  NEW_GAPS=$(db_query "SELECT COUNT(*)::int AS cnt FROM coverage_gap_opportunities WHERE agency_workspace_id = '${AGENCY_WS}'::uuid AND status = 'new'" \
    | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['cnt'])")
  echo "New gap opportunities after seed: ${NEW_GAPS}"
fi

echo ""
echo "--- Part A: floor-run-plays dry_run (play4_only) ---"
DRY_JSON=$(invoke_floor_plays true)
echo "$DRY_JSON" | python3 -m json.tool
DRY_OK=$(python3 -c "import json,sys; d=json.load(sys.stdin); print('yes' if d.get('ok') and d.get('dry_run') else 'no')" <<<"$DRY_JSON")
PLAY4_PLANNED=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('play4_planned',0))" <<<"$DRY_JSON")
if [[ "$DRY_OK" != "yes" ]]; then
  echo "FAIL: dry_run did not return ok"
  exit 1
fi
echo "play4_planned=${PLAY4_PLANNED}"

echo ""
echo "--- Part B: floor-run-plays live (play4_only) ---"
LIVE_JSON=$(invoke_floor_plays false)
echo "$LIVE_JSON" | python3 -m json.tool
CREATED=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('created',0))" <<<"$LIVE_JSON")
IDEMPOTENT=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('idempotent',0))" <<<"$LIVE_JSON")
echo "created=${CREATED} idempotent=${IDEMPOTENT}"

PKG_ROWS=$(db_query "
  SELECT dp.id::text AS pkg_id,
         dp.play_id,
         awr.owner_id::text AS owner_id,
         awr.status
  FROM decision_packages dp
  JOIN automation_work_requests awr ON awr.id = dp.work_request_id
  WHERE dp.play_id = 'coverage.gap.roundout'
    AND awr.agency_workspace_id = '${AGENCY_WS}'::uuid
    AND awr.idempotency_key LIKE 'play4:coverage.gap.roundout:%:${DAY_KEY}'
  ORDER BY dp.created_at DESC
  LIMIT 5
")
PKG_COUNT=$(python3 -c "import json,sys; print(len(json.load(sys.stdin)))" <<<"$PKG_ROWS")
echo "Packages for today (${DAY_KEY}): ${PKG_COUNT}"
echo "$PKG_ROWS" | python3 -m json.tool

if [[ "${CREATED}" -eq 0 && "${IDEMPOTENT}" -eq 0 && "${PLAY4_PLANNED}" -gt 0 ]]; then
  echo "FAIL: planned cards but none created or idempotent"
  exit 1
fi

if [[ "${PKG_COUNT}" -gt 0 ]]; then
  OWNER=$(python3 -c "import json,sys; rows=json.load(sys.stdin); print(rows[0].get('owner_id',''))" <<<"$PKG_ROWS")
  if [[ -n "$OWNER" && "$OWNER" != "$KELLI_ID" ]]; then
    echo "NOTE: owner_id=${OWNER} (account owner override; default Kelli=${KELLI_ID})"
  fi

  PKG_REF="package:$(python3 -c "import json,sys; print(json.load(sys.stdin)[0]['pkg_id'].replace('-',''))" <<<"$PKG_ROWS")"
  SLACK_CNT=$(db_query "SELECT COUNT(*)::int AS cnt FROM floor_list_undelivered_slack_packages(25) p WHERE p.package_ref = '${PKG_REF}'" \
    | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['cnt'])" 2>/dev/null || echo "0")
  echo "Slack undelivered queue for latest package: ${SLACK_CNT}"
fi

echo ""
echo "--- Part C: idempotency replay ---"
REPLAY_JSON=$(invoke_floor_plays false)
REPLAY_IDEM=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('idempotent',0))" <<<"$REPLAY_JSON")
REPLAY_CREATED=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('created',0))" <<<"$REPLAY_JSON")
echo "replay created=${REPLAY_CREATED} idempotent=${REPLAY_IDEM}"
if [[ "${PLAY4_PLANNED}" -gt 0 && "${REPLAY_IDEM}" -lt 1 && "${REPLAY_CREATED}" -lt 1 ]]; then
  echo "WARN: expected idempotent hits on replay when cards were planned"
fi

echo ""
echo "=== Phase 4 Slice 1 soak complete (${TS}) ==="
