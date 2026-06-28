# Cleanup Kit — re-import path (for Claude Code, when the assistant returns the file)

**Workbook:** `InsureFlow-Cleanup-Kit.xlsx` — generated 2026-06-28 from live prod (read-only).
Each data tab's hidden column A (`ref_id`) is the prod primary key for re-import. Decisions/values
are in the labeled columns. Generated counts: C1=23, C2=100, C3=100, C4=100, B1=63, B2=11, B3=9.

## When she returns the file — apply under the standard rhythm (dry-run → show counts → apply → verify, reversible)

**Part C (data entry) — apply approved rows as additive updates:**
- **C1 Businesses** → the 23 `accounts` (type=commercial_business) by `ref_id`. FEIN/NAICS/#employees/revenue
  have **no native columns** today — store on `accounts.custom` (jsonb) or add columns / use
  `commercial_business_accounts`. Decide target at import; never overwrite a non-empty value silently.
- **C2 Policy Data** → `policies` by `ref_id`: set `effective_date`, `expiration_date`, `premium` ONLY where
  currently NULL. The `trg_auto_sync_policy_to_renewal` trigger fires on these — expected; verify renewal rows after.
- **C3 Addresses** → `accounts` by `ref_id`: set `address_line1/city/state/zip_code` where blank. Also refresh
  the matching `insured_addresses` row (party layer) — insert if missing (requires line1+city+state+postal_code).
- **C4 Birthdays** → `accounts.date_of_birth` by `ref_id` where NULL. (MM/DD/YYYY → date.)

**Part B (judgment) — act only on definitive answers; route "Unsure" to Brian:**
- **B1 Duplicates** `ref_id` = `cleanup.dup_clusters.id`. "Same" → run `merge_accounts(survivor, losers[], 'kit-dup-<id>', actor, p_dry_run=false)`
  (survivor = cluster.survivor_id or compute_account_survivor on member_ids); "Different" → set that cluster's
  disposition to 'KEEP'; "Unsure" → leave for Brian.
- **B2 Households** `ref_id` = `households.id` (from `cleanup.hh_review_queue`). "Same household" → set the member
  accounts' `household_id` to that id (link, do NOT merge); "Not" → leave unlinked; "Unsure" → Brian.
- **B3 Business or Personal** `ref_id` = `accounts.id`. "Business" → set `type='commercial_business'` (the 1E
  trigger now syncs `account_type='business'`); "Personal" → keep household; "Unsure" → Brian.

**Rules:** validate every `ref_id` still exists + not soft-deleted before applying; snapshot each affected table to
a `cleanup.*` table first; do it as a versioned migration / logged batch; everything reversible. Anything marked
"Unsure" (or blank on a judgment tab) is NOT applied — it goes back to Brian.
