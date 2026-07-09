#!/usr/bin/env bash
# Release helper for changes that touch the ACORD 25 "hash bind" (the client
# preview and the server rebuild must go live together, front-end FIRST).
#
# It polls the production site until the served entry chunk changes -- i.e. the
# new front-end is actually being served -- and only THEN deploys the matching
# edge function. Between the merge and this deploy, previewing works and issuing
# is safely blocked with a 409; that window is expected, not an outage.
#
# Run this from the Mac (release side) AFTER the PR is merged and Netlify has
# started building. Requires the supabase CLI to be logged in.
#
# Usage:
#   scripts/release-coi.sh [edge-function-name]
# Defaults to generate-certificate.
set -euo pipefail

SITE="${SITE_URL:-https://lewisinsurance.netlify.app}"
PROJECT_REF="${SUPABASE_PROJECT_REF:-lrqajzwcmdwahnjyidgv}"
FUNCTION="${1:-generate-certificate}"
POLL_SECONDS="${POLL_SECONDS:-15}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-600}"

entry_chunk() {
  curl -fsS "$SITE/" | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1
}

echo "Reading current front-end entry chunk from $SITE ..."
OLD="$(entry_chunk || true)"
echo "  current: ${OLD:-<none>}"
echo "Waiting for Netlify to serve the new front-end (poll every ${POLL_SECONDS}s, timeout ${TIMEOUT_SECONDS}s)..."

elapsed=0
while :; do
  NEW="$(entry_chunk || true)"
  if [ -n "$NEW" ] && [ "$NEW" != "$OLD" ]; then
    echo "  new front-end live: $NEW"
    break
  fi
  if [ "$elapsed" -ge "$TIMEOUT_SECONDS" ]; then
    echo "TIMED OUT after ${TIMEOUT_SECONDS}s waiting for the entry chunk to change." >&2
    echo "Deploy was NOT run. Check the Netlify build, then re-run this script." >&2
    exit 1
  fi
  sleep "$POLL_SECONDS"
  elapsed=$((elapsed + POLL_SECONDS))
done

echo "Deploying edge function '$FUNCTION' ..."
supabase functions deploy "$FUNCTION" --project-ref "$PROJECT_REF" --use-api

echo "Done. Verify the version bumped and that an unauthenticated POST still returns 401."
