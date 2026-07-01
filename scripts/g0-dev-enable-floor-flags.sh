#!/usr/bin/env bash
# Enable Floor dev flags on branch klnygbbmognbslgobmzc (reversible; staff-internal only).
set -euo pipefail

DEV_REF="klnygbbmognbslgobmzc"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -f "${ROOT}/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT}/.env.local"
  set +a
fi

export SUPABASE_ACCESS_TOKEN

WORKSPACE_ID="${FLOOR_INBOUND_AGENCY_WORKSPACE_ID:-}"
if [[ -z "${WORKSPACE_ID}" ]]; then
  echo "Resolving default agency_workspace_id from dev..."
  WORKSPACE_ID=$(curl -sS -X POST \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.supabase.com/v1/projects/${DEV_REF}/database/query" \
    -d '{"query":"SELECT id::text FROM agency_workspaces ORDER BY created_at ASC LIMIT 1"}' \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if d else '')")
fi

if [[ -z "${WORKSPACE_ID}" ]]; then
  echo "ERROR: Could not resolve agency workspace id. Set FLOOR_INBOUND_AGENCY_WORKSPACE_ID in .env.local"
  exit 1
fi

echo "Setting dev Floor secrets on ${DEV_REF}..."
echo "  FLOOR_COCKPIT_ENABLED=true"
echo "  FLOOR_INBOUND_AGENCY_WORKSPACE_ID=${WORKSPACE_ID}"

supabase secrets set \
  --project-ref "${DEV_REF}" \
  FLOOR_COCKPIT_ENABLED=true \
  "FLOOR_INBOUND_AGENCY_WORKSPACE_ID=${WORKSPACE_ID}" \
  "FLOOR_INTERNAL_SEND_ALLOWLIST=brian@lewisinsurance.ai"

echo ""
echo "Done. Deploy functions if needed:"
echo "  supabase functions deploy floor-action floor-run-plays floor-release-held-sends email-inbound-lite send-coi-email hermes-chat --project-ref ${DEV_REF}"
echo ""
echo "Run plays (requires CRON_SECRET in header):"
echo "  curl -X POST \"https://${DEV_REF}.supabase.co/functions/v1/floor-run-plays\" \\"
echo "    -H \"X-Cron-Secret: \$CRON_SECRET\" -H \"Content-Type: application/json\" \\"
echo "    -d '{\"dry_run\":true}'"
