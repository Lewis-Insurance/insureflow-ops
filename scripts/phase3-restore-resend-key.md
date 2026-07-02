#!/usr/bin/env bash
# Phase 3 Slice 9 — verify Resend provider delivery on dev (ops)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env.local ]]; then
  # shellcheck disable=SC1091
  source .env.local
fi

: "${SUPABASE_ACCESS_TOKEN:?Set SUPABASE_ACCESS_TOKEN in .env.local}"

DEV_REF="klnygbbmognbslgobmzc"

echo "=== Phase 3 Slice 9 — Resend provider check ==="
echo ""
echo "1. Copy production RESEND_API_KEY to dev:"
echo "   Supabase Dashboard → klnygbbmognbslgobmzc → Edge Functions → Secrets"
echo "   Set RESEND_API_KEY to the same value as production (lrqajzwcmdwahnjyidgv)."
echo ""
echo "2. Or via CLI (if you have the key locally):"
echo "   supabase secrets set RESEND_API_KEY=<key> --project-ref ${DEV_REF}"
echo ""
echo "3. Re-run G4 soak Part A only:"
echo "   ./scripts/phase3-g4-soak.sh"
echo ""
echo "Expected: Part A Resend step returns success=true (not failed_delivery)."
echo ""
echo "This script does not read or print secrets. Run the soak after updating the key."
