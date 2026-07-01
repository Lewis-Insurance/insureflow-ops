#!/usr/bin/env bash
# G0 dev-branch apply + deploy (DEV ONLY: klnygbbmognbslgobmzc)
# Requires: supabase login (SUPABASE_ACCESS_TOKEN) and DB password for dev branch.
# Prod (lrqajzwcmdwahnjyidgv) is NOT touched by this script.

set -euo pipefail

DEV_REF="klnygbbmognbslgobmzc"
PROD_REF="lrqajzwcmdwahnjyidgv"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Load token from gitignored local env (never commit)
if [[ -f "${ROOT}/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT}/.env.local"
  set +a
fi

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "ERROR: Set SUPABASE_ACCESS_TOKEN in .env.local or export it before running."
  exit 1
fi

export SUPABASE_ACCESS_TOKEN

# Prefer explicit dev password; fall back to legacy SUPABASE_DB_PASSWORD name.
DB_PASSWORD="${SUPABASE_DB_PASSWORD_DEV:-${SUPABASE_DB_PASSWORD:-}}"
if [[ -z "${DB_PASSWORD}" ]]; then
  echo "ERROR: Set SUPABASE_DB_PASSWORD_DEV (dev branch klnygbbmognbslgobmzc) in .env.local."
  echo "       Prod password (lrqajzwcmdwahnjyidgv) is a different database."
  exit 1
fi

DB_PASSWORD_ARGS=(-p "${DB_PASSWORD}")

echo "=== Floor G0 dev sequence ==="
echo "Dev branch: ${DEV_REF}"
echo "Prod ref (must NOT be linked): ${PROD_REF}"
echo ""

if [[ "${SUPABASE_PROJECT_REF:-}" == "${PROD_REF}" ]]; then
  echo "ERROR: SUPABASE_PROJECT_REF is prod. Abort."
  exit 1
fi

cd "$ROOT"

echo "0. Preflight: verify DB password is for DEV branch (not prod)..."
if ! python3 - "${DEV_REF}" "${PROD_REF}" "${DB_PASSWORD}" <<'PY'
import os, subprocess, sys
from urllib.parse import quote
dev_ref, prod_ref, pwd = sys.argv[1:4]
pwd_q = quote(pwd, safe='')

def can_connect(ref: str) -> bool:
    url = f"postgresql://postgres.{ref}:{pwd_q}@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
    r = subprocess.run(
        ["supabase", "migration", "list", "--db-url", url],
        capture_output=True,
        text=True,
        timeout=60,
    )
    return r.returncode == 0 and "password authentication failed" not in (r.stdout + r.stderr)

dev_ok = can_connect(dev_ref)
prod_ok = can_connect(prod_ref)
if dev_ok:
    sys.exit(0)
if prod_ok and not dev_ok:
    print("ERROR: Password authenticates to PROD but not DEV branch.")
    print("Reset Database password on the DEV branch project only:")
    print(f"  https://supabase.com/dashboard/project/{dev_ref}/database/settings")
    print("Then set SUPABASE_DB_PASSWORD_DEV in .env.local to that value.")
    sys.exit(1)
print("ERROR: Password failed for both dev branch and prod.")
sys.exit(1)
PY
then
  exit 1
fi

echo "1. Link to dev branch..."
supabase link --project-ref "${DEV_REF}" --yes "${DB_PASSWORD_ARGS[@]}"

echo "2. Apply migrations (Spine D → A → pg_trgm → resolve_account → hermes_app)..."
supabase db push --yes "${DB_PASSWORD_ARGS[@]}"

echo "3. Regenerate types from dev branch..."
supabase gen types typescript --project-id "${DEV_REF}" > src/integrations/supabase/types.ts

echo "4. Deploy edge functions to dev..."
supabase functions deploy floor-action --project-ref "${DEV_REF}"
supabase functions deploy hermes-chat --project-ref "${DEV_REF}"

echo "5. Smoke tests (manual follow-up):"
echo "   - SELECT count(*) FROM policy_in_force_status LIMIT 1;"
echo "   - SELECT resolve_account('<workspace-uuid>', 'test@example.com', null, null);"
echo "   - POST floor-action create_internal_package (FLOOR_COCKPIT_ENABLED=true on dev)"
echo ""
echo "Done. Update docs/THE-FLOOR-PHASE-0-STATUS.md checkboxes."
