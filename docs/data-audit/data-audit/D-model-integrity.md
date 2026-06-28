# Data-Model Integrity Audit — Customer / Account / Household Layer
**Database:** InsureFlow (Supabase project `lrqajzwcmdwahnjyidgv`)
**Tenant:** `agency_workspace_id = f1f07037-3032-45f8-93ca-72c0f47e4fbb`
**Active filter:** `deleted_at IS NULL`
**Date:** 2026-06-27 · **Mode:** READ-ONLY (no data modified)

---

## Methodology
Inspected `information_schema.columns` for all in-scope tables (the full `list_tables` verbose dump exceeded the result limit, so columns were pulled targeted). Sized every table with `COUNT(*)` / `GROUP BY`, tested referential integrity with `NOT EXISTS` anti-joins, and mapped the real dependency graph by querying `information_schema` FK constraints plus `pg_depend`/`pg_rewrite` for views. No rows were dumped; only counts and structural facts were extracted. Canonical customer entity confirmed as `accounts` (1,610 active in tenant).

---

## Findings Table

| # | Issue | Size | Severity | Recommendation |
|---|-------|------|----------|----------------|
| 1 | **`contacts` layer is dead** — 0 rows, yet 25+ tables FK to it | 0 contacts; `accounts.contact_id` NULL on **all 1,610** active accounts (0 orphaned pointers) | **High** (architectural) | Pick ONE party model. Either commit to `contacts` and backfill, or formally deprecate it and standardize on `accounts` + the per-channel `insured_*` tables. Today it is scaffolding with no data. |
| 2 | **Contact-dependent subsystem unbuilt** — comms/consent/marketing/portal tables all hang off `contacts` | sms_messages 0, consent_ledger 0, twilio_consents 0, client_portal_users 0, tickets 0, reviews 0, marketing_send_queue 0; call_sessions 5 (all `contact_id` NULL) | **High** | This is the real cost of #1: the entire SMS/voice/consent/marketing/portal stack cannot function until the contact (person) layer is populated. Decide before building outbound. No dangling refs exist (safe to re-key). |
| 3 | **Three competing household models** | `households` 0 rows; `household_accounts` 1 row (synthetic seed, account_id `1111…1111`, head_contact_id NULL); `portal_household_members` 0 rows | **Medium** | Adopt ONE account-centric model (see below). Deprecate `household_accounts` (contact-keyed, single seed row) and `portal_household_members` (portal not live). |
| 4 | **`accounts` has no `household_id`** (but dead `contacts` does) | n/a | **Medium** | Add `accounts.household_id uuid REFERENCES households(id)` and reuse `households`; re-key `households.primary_contact_id` → `primary_account_id`. |
| 5 | **`account_memberships`** (account ↔ auth user link) | 2 rows, both role `staff`, 0 orphaned | **Low** | Legitimate but barely used. Keep; document as the account↔auth-user join (likely client-portal access). |
| 6 | **`insured_profiles/_emails/_phones/_addresses`** — alternative account-centric PII model | all **0 rows** | **Medium** | Dead scaffolding today, but architecturally the *better* fit (account-keyed, multi-value email/phone/address). Either adopt as the canonical contact-detail model or deprecate. Do not leave all three party models (contacts, insured_*, account flat columns) half-alive. |
| 7 | **Carrier link partially used** — `carrier` (text) vs `carrier_id` (uuid) | **486** active policies have `carrier_id` NULL but `carrier` text present; 1,678 / 2,164 linked; 0 orphaned `carrier_id` | **Medium** | Backfill the 486 by matching `carrier` text → `carriers.name` (16 carriers). Then make `carrier_id` the source of truth. |
| 8 | **LOB free-text not normalized** — `policies.line_of_business` (text) vs `lines_of_business` (16-row ref) | **44** distinct text values across 2,164 active policies; **292** do not match any ref `name`/`code`; **no FK** linking them | **Medium** | Reference table exists but is NOT wired (no `line_of_business_id` column, no FK). Add `policies.line_of_business_id`, map the 44 values to 16 canonical lines, expand the ref table where needed. |
| 9 | **Policies pointing to workspace-less accounts** | **175** active policies reference accounts whose `agency_workspace_id IS NULL` (167 distinct accounts); 0 point to *other* tenants; 0 to soft-deleted accounts | **Medium** | Tenant boundary leak. Stamp those 167 accounts with the correct `agency_workspace_id` (or confirm intentional global rows). Active policy→account FK is otherwise clean (0 NULL, 0 missing). |
| 10 | **Heavy soft-delete residue in `accounts`** | 15,991 total account rows; 15,797 in this tenant; only **1,610 active** → ~14,187 soft-deleted | **Low/Info** | Mostly import/dedup churn. Not corrupt, but inflates the table and any non-filtered query. Candidate for archival/hard-delete once dedup is finalized. |
| 11 | **Dedup scaffolding is stalled, not wired** | `duplicate_groups` 362 (all `status='pending'`, all `entity_type='accounts'`); `duplicate_flags` 0; `merge_history` 0; **`duplicate_detection_rules` 0** | **Medium** | 362 candidate groups were generated but **no rule rows drive them** (rules table empty), **none reviewed**, and **no merge has ever run** (merge_history empty). Either operationalize (seed rules, build review/merge flow) or treat as a one-off detection snapshot. |
| 12 | **Deprecated `customers` migration — COMPLETE** | `customers` 0 rows; `customers_unified` view **does not exist** (already dropped); dependents migrated: `tasks` 267 rows (0 `customer_id`, 153 `account_id`), `notes` 6 rows (0 `customer_id`, on `account_id`), `opportunities` 0 | **Low/Info** | Migration to `accounts` is done. 4 tables still carry a legacy `customer_id` FK column (`customer_tags`, `notes`, `tasks`, `opportunities`) — all unused. Drop those dead columns/constraints to finish the cutover. |
| 13 | **`businesses` / `commercial_business_accounts` near-empty** | businesses 0; commercial_business_accounts 1 | **Low** | Commercial sub-model is effectively unpopulated; `accounts.business_id` set on 0 active accounts. Fold into the account model or defer. |

---

## Recommended Canonical Model (account-centric)

**Party / customer:** `accounts` is the single customer entity. Retire the parallel `customers` table (done — 0 rows) and **decide the fate of `contacts`**: it is the *person* layer that the entire comms/consent/marketing/portal subsystem FKs into, but it holds 0 rows. Two coherent options:

- **Option A (recommended) — account + `insured_*` detail tables.** Treat `accounts` as the party and use the already-modeled `insured_profiles / insured_emails / insured_phones / insured_addresses` for multi-valued contact details. Re-point the comms/consent/marketing FKs from `contacts` to `accounts` (or to `insured_*`). Drop `contacts`. Cleaner, fewer layers, matches the account-centric reality.
- **Option B — commit to `contacts`.** Backfill one `contacts` row per account (person), keep the existing 25+ FKs, and demote `accounts` flat fields (`email`, `phone`, `spouse_name`, `date_of_birth`). Heavier, but preserves the existing comms schema.

Do not stay in the current tri-modal limbo (flat account columns **+** empty `contacts` **+** empty `insured_*`).

**Household:** standardize on **`households`** with an account-centric key:
- Add `accounts.household_id uuid REFERENCES households(id)` (the join that is missing today).
- Rename/re-key `households.primary_contact_id` → `primary_account_id` (or `primary_insured_id`), consistent with whichever party model wins above.
- **Deprecate** `household_accounts` (contact-keyed, 1 synthetic seed row) and `portal_household_members` (0 rows; revive only if/when the client portal ships, keyed to `households` + auth users).

**Carrier & LOB:** make `carrier_id` and a new `line_of_business_id` the canonical references; keep the text columns only as raw-import fallback.

---

## Prioritized Structural Fixes

1. **Decide the party model (contacts vs accounts+insured_*)** — blocks all outbound comms/consent/marketing; everything else depends on this. *(High)*
2. **Normalize carrier + LOB:** backfill 486 `carrier_id`, add `line_of_business_id` + FK, map 44→16 LOB values. *(High data-quality value, low risk)*
3. **Fix tenant leak:** stamp `agency_workspace_id` on the 167 workspace-less accounts behind 175 active policies. *(Medium, security/isolation)*
4. **Household consolidation:** add `accounts.household_id`, adopt `households`, deprecate `household_accounts` + `portal_household_members`. *(Medium)*
5. **Finish the `customers` cutover:** drop the 4 dead `customer_id` columns/FKs (`customer_tags`, `notes`, `tasks`, `opportunities`) and the empty `customers` table. *(Low, cleanup)*
6. **Resolve dedup:** either seed `duplicate_detection_rules` + build the review/merge path for the 362 pending account groups, or archive them; then archive the ~14k soft-deleted account rows. *(Medium)*
7. **Decide `insured_*` and commercial (`businesses`) sub-models** — adopt or drop; do not leave empty scaffolding. *(Low)*

---

### Key Integrity Facts (no orphans found where it matters)
- `accounts.contact_id` orphaned: **0** (because it is NULL everywhere).
- Active policies with NULL / missing / soft-deleted `account_id`: **0 / 0 / 0**.
- `carrier_id` orphaned: **0**. `account_memberships` orphaned: **0**. `call_sessions.contact_id` dangling: **0**.
- Only structural leak: **175 active policies → 167 accounts with NULL `agency_workspace_id`**.
