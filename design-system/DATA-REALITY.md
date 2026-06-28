# DATA-REALITY.md — what is actually in the production database

Read this BEFORE building any data-backed surface. CLAUDE.md is partly
aspirational and wrong about several tables. Everything below was verified
read-only against the production Supabase project (lrqajzwcmdwahnjyidgv) on
2026-06-28. Source triage and counts server-side from these REAL signals. Never
wire a tile, count, or recency state to an empty or unused table.

## Dead / misleading signals (do NOT build on these)

- `communications` holds ~5 rows over 4 of 1714 accounts. Its columns are
  `account_id`, `type`, `direction`, `occurred_at`, `created_at` (NOT
  `entity_type`/`entity_id` as CLAUDE.md claims). Contact recency from this table
  is noise. Degrade contact-recency gracefully ("No contact logged") until logging
  writes data.
- `accounts` has NO `last_contact_at` and NO `balance` column. The
  `unified_customer_search` RPC hardcodes both to null.
- `accounts.account_status` is 100% `'active'` (1 distinct value). A status or
  "leads" cohort over accounts is structurally degenerate.

## Real signals (build on these)

### accounts (1714, deleted_at IS NULL)
`type` is `household` (1691) or `commercial_business` (23). `created_at` is real.

### policies (2163, deleted_at IS NULL) — the rich signal
Columns of note: `account_id`, `named_insured`, `policy_number`, `carrier` (text),
`line_of_business`, `line_canonical` (already human-readable), `status`,
`premium`, `effective_date`, `expiration_date`, `created_at`, `cancelled_at`.

- status: active 1879, cancelled 180, lost 98, lapsed 5, non_renewed 1. There is
  no `expired` status; an expired policy is `status='active'` with a past
  `expiration_date`.
- `expiration_date` is NULL for 779 policies (a real, large cohort).
- `line_canonical` is already humanized (Auto, Homeowners, Boat / Watercraft,
  Commercial Auto, Motorcycle, Travel Trailer, ...). Prefer it over
  `line_of_business`. Specialty lines (Boat/Watercraft, Motorcycle, Travel
  Trailer, Motorhome/RV) are their own policies, never folded onto an auto policy.
- carriers are free text and messy (Progressive 1011, Auto-Owners 591,
  "Auto-Owners Insurance Company" 2, Universal Property 200, ...). Carriers are
  NAME CHIPS, never colors.

Policies triage cohorts (verified counts, account/policy-level):
- Expiring 30d: `status='active' AND expiration_date IN [today, today+30)` = 87
- Lapsed: `status <> 'active'` (cancelled/lost/lapsed/non_renewed) = 284
- No renewal date: `expiration_date IS NULL` = 779
- Recently bound: `created_at >= now() - 30d` = 66

### ao_renewals (524) — the Auto-Owners migration signal
The AO book moving off Auto-Owners. Columns of note: `account_id`,
`customer_name`, `policy_number`, `policy_type`, `current_carrier`,
`renewal_date`, `current_premium`, `status`, `priority`, `last_contact_date`
(POPULATED here, unlike accounts), `moved_carrier` (the target/bound-elsewhere
carrier), `best_alternative_carrier`, `moved_premium`, `follow_up_date`.

- status: moved 206, pending 164, lost 110, cancelled 26, contacted 15, quoted 3.

AO migration cohorts (verified):
- Not started: `status='pending'` = 164
- Quote out: `status IN ('quoted','contacted')` = 18
- Bound elsewhere: `status='moved'` = 206
- Lapsing this week: `renewal_date IN [today, today+7) AND status IN ('pending','contacted','quoted')` = 2

Auto-Owners is identified by `carrier ILIKE '%auto%owner%'` on policies (593) and
by `ao_renewals` membership for the migration view. Target carriers in the book
are Nationwide and Progressive (both name chips).

## Rules that follow from this reality

- Triage tile counts come from a server-side aggregate RPC over the whole book,
  never a client-side count over a fetched page (otherwise pagination corrupts
  the counts). This is the Customers pattern (`get_customer_triage_counts`).
- Validate any new RPC read-only against prod before mirroring into
  `supabase/migrations/`. Do not deploy. Branch only.
- Mask SSN, DOB, DLN everywhere. Numbers tabular. No em or en dashes in UI copy.
- Humanize raw enums for display (`commercial_business` -> Commercial Business,
  `commercial_auto` -> Commercial Auto). Never render a raw enum or a literal
  object (`{}`) in the UI.
