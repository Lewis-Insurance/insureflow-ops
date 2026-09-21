#!/usr/bin/env bash
# Drives the Haven policy feed through the situations that actually break a
# consumer — pagination, catching up, withdrawal, and re-release — and writes the
# pages out for Haven's own receiver to judge.
#
#   scripts/haven-feed/emit-contract-pages.sh <socket-dir> <port> <db> <out.json>
set -euo pipefail

SOCK="$1"; PORT="$2"; DB="$3"; OUT="$4"
BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
I=bbbbbbbb-1111-4000-8000-000000000001
ACCOUNTS='["be76fd41-de02-4274-ba6a-d26b7fb7e94f","45892ec6-70ff-4e82-9a8f-abbdb6f578bd","11c98512-dad1-49be-bb90-5cf1620c58fb","43b472e2-6ad4-4e3b-a3e4-4bf06ca0de41"]'

q() { "$BIN/psql" -h "$SOCK" -p "$PORT" -U postgres -d "$DB" -tAq -v ON_ERROR_STOP=1 -c "$1"; }

page() { q "select public.haven_policy_feed('$I',$1,$2);"; }

emit() { # name after limit expect_cursor expect_manifest expect_visible
  printf '{"name":%s,"integration_id":"%s","after":%s,"limit":%s,"approved_account_ids":%s,"expect":"valid","expect_cursor":%s,"expect_manifest":%s,"expect_visible":%s,"page":{"success":true,"data":%s}}' \
    "\"$1\"" "$I" "$2" "$3" "$ACCOUNTS" "$4" "$5" "$6" "$(page "$2" "$3")"
}

{
  printf '['
  emit "fresh consumer takes everything"        0 100 4 4 4
  printf ','
  emit "first page of two, has_more"            0 2   2 2 2
  printf ','
  emit "second page resumes at the cursor"      2 2   4 4 4
  printf ','
  emit "caught up returns no events"            4 100 4 4 4

  # Withdrawal: policy 3 stops being disclosed. Its withdrawn event must arrive
  # with an explicit null body and must NOT appear in the manifest.
  q "select public.haven_feed_withdraw('$I','a0000000-0000-4000-8000-000000000003');" > /dev/null
  printf ','
  emit "withdrawal drops one from membership"   4 100 5 3 3

  # Re-release: policy 1 is published again at a new sequence. Its ORIGINAL
  # release must vanish from the stream, or the receiver rejects the page for
  # carrying a released event its manifest does not select.
  q "select public.haven_feed_publish('$I','a0000000-0000-4000-8000-000000000001');" > /dev/null
  printf ','
  emit "re-release supersedes the old release"  5 100 6 4 4

  # A fresh consumer arriving after all of that must still see a coherent world:
  # three live policies, no trace of the superseded release.
  printf ','
  emit "fresh consumer after churn is coherent" 0 100 6 4 4
  printf ']'
} > "$OUT"

echo "wrote $(python3 -c "import json;print(len(json.load(open('$OUT'))))" ) scenarios to $OUT"
