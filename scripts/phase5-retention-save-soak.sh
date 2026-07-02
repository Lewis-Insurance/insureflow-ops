#!/usr/bin/env bash
# Phase 5 Slice 2 — retention.save.list end-to-end soak (dev)
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
POLICY_ID="88ea8214-b9cf-4672-8863-10191ef5bc21"
POLICY_NUMBER="875652030"
KELLI_ID="e321fae3-f28b-4170-8316-9460cb9eb2fc"
CRON_SECRET="${CRON_SECRET:-floor-dev-soak-cron-20260701}"
DAY_KEY="$(date -u +%Y-%m-%d)"
TS="$(date +%Y%m%d%H%M%S)"
IDEM_KEY="floor-soak-retention-${TS}"

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

invoke_retention_scoring() {
  curl -sS -X POST \
    "${DEV_URL}/functions/v1/run-retention-scoring?agency_workspace_id=${AGENCY_WS}&days_ahead=60" \
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
    -d "{\"agency_workspace_id\":\"${AGENCY_WS}\",\"retention_only\":true,\"play7_limit\":10,\"dry_run\":${dry_run}}"
}

echo "=== Phase 5 Slice 2 — retention.save.list soak ==="
mint_service_key

echo ""
echo "--- Part 0: retention scoring (pre-cards) ---"
invoke_retention_scoring | python3 -m json.tool 2>/dev/null || true

echo ""
echo "--- Part 0b: high/critical score inventory ---"
HIGH_CNT=$(db_query "
  SELECT COUNT(*)::int AS cnt
  FROM policy_renewal_risk_scores
  WHERE agency_workspace_id = '${AGENCY_WS}'::uuid
    AND risk_level IN ('high', 'critical')
" | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['cnt'])")
echo "High/critical renewal risk scores: ${HIGH_CNT}"

if [[ "${HIGH_CNT}" -eq 0 ]]; then
  echo "Seeding dev soak high-risk score on policy ${POLICY_NUMBER} (${POLICY_ID})..."
  db_query "
    INSERT INTO policy_renewal_risk_scores (
      agency_workspace_id, account_id, policy_id, renewal_date, score, risk_level,
      top_factors, model_name, model_version, idempotency_key
    ) VALUES (
      '${AGENCY_WS}'::uuid,
      '${ACCOUNT_ID}'::uuid,
      '${POLICY_ID}'::uuid,
      (CURRENT_DATE + 45),
      0.8200,
      'high',
      '[{\"factor_key\":\"contact_recency\",\"explanation\":\"No contact in 90+ days\"}]'::jsonb,
      'floor-soak',
      '1.0.0',
      '${IDEM_KEY}'
    )
    RETURNING id::text, risk_level, score
  " | python3 -m json.tool
  HIGH_CNT=1
fi

echo ""
echo "--- Part A: floor-run-plays dry_run (retention_only) ---"
DRY_JSON=$(invoke_floor_plays true)
echo "$DRY_JSON" | python3 -m json.tool
DRY_OK=$(python3 -c "import json,sys; d=json.load(sys.stdin); print('yes' if d.get('ok') and d.get('dry_run') else 'no')" <<<"$DRY_JSON")
PLANNED=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('play7_planned',0))" <<<"$DRY_JSON")
if [[ "$DRY_OK" != "yes" ]]; then
  echo "FAIL: retention_only dry_run"
  exit 1
fi
if [[ "${PLANNED}" -lt 1 ]]; then
  echo "FAIL: expected play7_planned >= 1"
  exit 1
fi
echo "play7_planned=${PLANNED}"

echo ""
echo "--- Part B: live create (retention_only) ---"
LIVE_JSON=$(invoke_floor_plays false)
echo "$LIVE_JSON" | python3 -m json.tool
CREATED=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('created',0))" <<<"$LIVE_JSON")
IDEMPOTENT=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('idempotent',0))" <<<"$LIVE_JSON")
echo "created=${CREATED} idempotent=${IDEMPOTENT}"

if [[ "${CREATED}" -eq 0 && "${IDEMPOTENT}" -eq 0 ]]; then
  echo "FAIL: no cards created or idempotent"
  exit 1
fi

PKG_ROWS=$(db_query "
  SELECT dp.id::text AS pkg_id,
         dp.play_id,
         awr.owner_id::text AS owner_id,
         awr.status
  FROM decision_packages dp
  JOIN automation_work_requests awr ON awr.id = dp.work_request_id
  WHERE dp.play_id = 'retention.save.list'
    AND awr.agency_workspace_id = '${AGENCY_WS}'::uuid
    AND awr.idempotency_key LIKE 'play7:retention.save.list:%:${DAY_KEY}'
  ORDER BY dp.created_at DESC
  LIMIT 5
")
PKG_COUNT=$(python3 -c "import json,sys; print(len(json.load(sys.stdin)))" <<<"$PKG_ROWS")
echo "Packages for today (${DAY_KEY}): ${PKG_COUNT}"
echo "$PKG_ROWS" | python3 -m json.tool

OWNER_CHECK=$(python3 -c "import json,sys; rows=json.load(sys.stdin); print(rows[0]['owner_id'] if rows else '')" <<<"$PKG_ROWS")
if [[ -n "${OWNER_CHECK}" && "${OWNER_CHECK}" != "${KELLI_ID}" ]]; then
  echo "WARN: owner ${OWNER_CHECK} != Kelli default ${KELLI_ID}"
fi

echo ""
echo "--- Part C: idempotency replay ---"
REPLAY_JSON=$(invoke_floor_plays false)
REPLAY_IDEM=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('idempotent',0))" <<<"$REPLAY_JSON")
echo "replay idempotent=${REPLAY_IDEM}"
if [[ "${CREATED}" -gt 0 && "${REPLAY_IDEM}" -lt 1 ]]; then
  echo "WARN: expected idempotent hits after live create"
fi

echo ""
echo "=== Phase 5 Slice 2 soak complete (${TS}, day=${DAY_KEY}) ==="
