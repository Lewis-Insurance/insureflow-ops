# PLAN-D — Data-Model / Schema Integrity (Build-Ready)

**Database:** InsureFlow (Supabase project `lrqajzwcmdwahnjyidgv`)
**Tenant (single, confirmed):** `agency_workspace_id = f1f07037-3032-45f8-93ca-72c0f47e4fbb`
**Author domain:** DATA-MODEL / SCHEMA INTEGRITY (cross-cutting foundation)
**Date:** 2026-06-27 · **Mode of this doc:** PLANNING ONLY. All DDL/DML below is written as TEXT for a Claude Code build agent to execute on a branch. Nothing in this plan was executed. Only read-only `SELECT` / `information_schema` queries were run to verify numbers.

---

## 0. Read-only re-verification (what I can stand behind)

All numbers below were re-pulled live on 2026-06-27. Where they differ from the audit, the audit's figure is explained, not discarded.

| Anchor | Audit said | Verified (live) | Note |
|---|---|---|---|
| Active accounts (`deleted_at IS NULL`) | 1,804 | **1,804** | ✅ |
| Null-workspace active accounts | 194 (187 FL, 167 w/ active policies) | **194 (187 FL, 7 non-FL)** | ✅ on 194/187. See split fix below. |
| Null-ws accounts w/ **active**-status policies | 167 | **164** | ⚠️ Audit's "167" = accounts with *any* non-deleted policy. With `status='active'` it is **164**. Both true at different scopes. |
| Null-ws accounts w/ any non-deleted policy | — | **167** | Reconciles the audit number. |
| `carrier_id` NULL (policies `deleted_at IS NULL`) | 486 | **486** (all have carrier text) | ✅ Of these, **480** are `status='active'`; 6 are cancelled/lost/lapsed. |
| Carriers reference rows | 16 | **16** | ✅ |
| Carrier text → exact (case-insensitive) match to a `carriers.name` | — | **335 / 486 match; 151 do NOT** | ⚠️ MAJOR: ref table holds short brand names; policy text holds full legal names + carriers not in the table. See MODEL-2. |
| LOB distinct text values (`deleted_at IS NULL`) | 41 (consolidated) / 44 (D-file) | **44** | ⚠️ Use **44** as the real count. "41" was the hygiene agent's de-duped-by-casing tally. |
| `lines_of_business` reference rows | 16 | **16** | ✅ |
| `policies.line_of_business_id` column exists? | no | **no** | ✅ must be added. |
| `accounts.household_id` column exists? | no | **no** | ✅ must be added. |
| `contacts` rows | 0 | **0** | ✅ |
| FK constraints referencing `contacts` | "25+ tables" | **26 FK constraints across 23 distinct tables** (+ `accounts.contact_id`, + `household_accounts` has 2) | ✅ Full list in MODEL-5. |
| **Rows in any contacts-dependent table** | mostly 0 | **ALL 0 except `call_sessions`=5 (all `contact_id` NULL)** | ✅ DECISIVE — there is no data to migrate. |
| `customers` rows | 0 | **0** | ✅ |
| `customer_id` non-null on the 4 legacy tables | 0 | **0 / 0 / 0 / 0** | ✅ fully dead columns. |
| FK constraints referencing `customers` | 4 | **4** (`customer_tags`, `notes`, `tasks`, `opportunities`) | ✅ |
| Household models | households 0 / household_accounts 1 / portal_household_members 0 | **0 / 1 / 0** | ✅ |
| insured_profiles / _emails / _phones / _addresses | all 0 | **all 0** | ✅ `insured_profiles` is **account-keyed** (PK-ish `account_id`, no surrogate id). |
| `accounts` total rows / soft-deleted | 15,991 / ~14,187 | **15,991 / 14,187** | ✅ |

### Disputes / corrections I am flagging
1. **"167 with active policies" → split into 164 (status=active) + 3 (other status).** The stamp set is the same 187 FL accounts either way; this only affects how you describe the active-customer un-hide count. Use **164 active-policy / 167 any-policy**.
2. **Carrier backfill is NOT a clean 486-row name match.** Only **335** map by exact name; **151** do not, and **≥10 distinct carriers in the data are absent from the 16-row `carriers` table** (Safe Harbor ≈78 policies, US Coastal 6, Orange Insurance Exchange 3, Lloyd's 3, Burlington 4, Mount Vernon 2, plus Wilshire, Covington, Hadron, ICAT, USLI, Wright Flood, AGCS Marine, PIE). MODEL-2 must **add carrier rows + an alias map**, not just `UPDATE … = carriers.id`.
3. **"194 → stamp all to Lewis" is wrong for 7 of them.** 6 are `state=NULL` with 0 policies (incomplete/test rows spread across Jan–Jun 2026) and 1 is **VT** with 1 policy. None are demonstrably Lewis's FL book. MODEL-1 stamps the **187 FL** and routes the **7** to human review (do not auto-stamp).
4. **LOB count is 44, not 41.** Plan to 44 distinct raw values. (The HYG- domain owns the value→canonical map; this plan owns the column/FK structure.)
5. **Party-model "blast radius" is structural only.** Every dependent table is empty. This is the single biggest input to the recommendation in MODEL-5 (Option A).

---

## 1. Ordering, dependency graph, and P-tier

```
P0 (additive, low-risk, do first; un-hides the book and makes refs trustworthy)
  MODEL-1  Workspace-stamp the 187 FL null-ws accounts  ──┐ (prerequisite for ALL re-scoping in every domain)
  MODEL-2  Carrier ref expansion + carrier_id backfill    │ (independent of MODEL-1)
  MODEL-3  LOB: add line_of_business_id FK (+canonical)    │ (independent; value-map from HYG-)
                                                           │
P1 (customer-correctness, review-gated; run AFTER MODEL-1 re-scope)
  MODEL-4  Household model: add accounts.household_id, canonicalize on households   ← needs MODEL-1
  MODEL-7  Dedup scaffolding wiring (rules/flags/merge_history)                     ← needs MODEL-1; coordinates with DUP-
                                                           │
P2 (architectural / cleanup)
  MODEL-5  PARTY MODEL DECISION (adopt insured_*; deprecate contacts)  ← gates the entire outbound comms stack
  MODEL-6  Drop dead customer_id columns + customers table             ← independent cleanup
  MODEL-8  Archive ~14,187 soft-deleted account rows                   ← MUST follow MODEL-7 (dedup) AND any merges
```

**What blocks what, across domains:**
- **MODEL-1 blocks everything that re-scopes the book**: Phase-0 cross-sell re-run, HH- householding, BP- business reclassification, DUP- dedup, HYG- contactability stats. Until the 187 are stamped, those domains under-count by 164 active customers. **MODEL-1 is the universal P0 prerequisite.**
- **MODEL-5 (party model) blocks the OUTBOUND COMMS / CONSENT / PORTAL / MARKETING stack** (Canopy/Hermes SMS+voice, consent_ledger, twilio_consents, portal_*, tickets, marketing_send_queue). No outbound channel can legally/technically send until the person/consent layer is keyed and live. It does **not** block MODEL-1/2/3/4/6/7.
- **MODEL-8 is blocked by MODEL-7 and by DUP-/HH- merges** — never archive soft-deleted rows until dedup survivorship has finished re-parenting policies, or you may archive a row that becomes a merge target.
- **MODEL-3 coordinates with HYG-** (HYG owns the 44→canonical value map; MODEL-3 owns the column, FK, and the apply step).
- **MODEL-4 coordinates with HH-** (HH owns which accounts group into which household + the HIGH/MEDIUM/LOW tiers; MODEL-4 owns the `households` canonical schema + `accounts.household_id` column + the link-writing mechanism).
- **MODEL-7 coordinates with DUP-** (DUP owns the survivor rule + tier decisions; MODEL-7 owns making `duplicate_detection_rules` / `duplicate_flags` / `merge_history` actually drive and record it).

---

## MODEL-1 — Workspace-stamp the 187 FL null-workspace accounts  ★P0★

**Problem.** 194 active accounts have `agency_workspace_id IS NULL` (tenant-stamping gap). 164 of them sit behind active policies and 167 behind any policy, so they are invisible to every workspace-scoped query — the Phase-0 cross-sell book, householding, and hygiene all under-count by ~164 live customers. There is exactly **one** real tenant in the table (`f1f07037-3032-45f8-93ca-72c0f47e4fbb`), so the destination is unambiguous. Of the 194, **187 are FL** (Lewis's book is a FL agency) and **7 are not safe to assume** (6 are `state=NULL` with 0 policies; 1 is `state=VT` with 1 policy).

**Why we can stand behind "these 187 are Lewis's":** (a) single-tenant DB — there is no *other* agency they could belong to; (b) `state='FL'` matches the agency footprint; (c) 0 of the 194 point to a different tenant and 0 are soft-deleted (verified in the D-file anti-joins); (d) the policies on them are real, non-deleted policies. The 7 excluded rows fail test (b) and mostly (c-policy), so they go to review rather than inheriting tenancy by default.

**Change (TEXT — build agent runs on branch, inside a transaction, after snapshotting the id list):**

```sql
-- 1. Snapshot the exact set FIRST (store ids for reversibility / audit)
CREATE TABLE IF NOT EXISTS _migration_audit_model1 AS
SELECT id, state, type, agency_workspace_id AS old_workspace_id, now() AS captured_at
FROM accounts
WHERE deleted_at IS NULL
  AND agency_workspace_id IS NULL
  AND state = 'FL';

-- 2. Stamp ONLY the 187 FL null-ws accounts
UPDATE accounts
SET agency_workspace_id = 'f1f07037-3032-45f8-93ca-72c0f47e4fbb',
    updated_at = now()
WHERE deleted_at IS NULL
  AND agency_workspace_id IS NULL
  AND state = 'FL';
-- expected rowcount: 187

-- 3. The 7 non-FL / no-policy rows are NOT stamped. Tag them for human review:
--    (2a938ca4…, fe6514b3…, 28be93d0…, 0384f760…, 0b997e1e…, e4cd35b2…  = state NULL, 0 policies;
--     00fe662f… = VT, 1 policy)
--    Recommended: leave workspace NULL and add a review flag (or list in the review workbook).
```

**Do NOT stamp policies directly** — policies inherit tenancy through `account_id`; the D-file confirmed the active policy→account FK is 100% clean (0 NULL / 0 missing / 0 to deleted), so stamping the parent account is sufficient.

**Type:** DML (additive — only fills NULLs; no data destroyed).
**Depends on:** nothing.
**Blocks:** Phase-0 re-run, HH-, BP-, DUP-, HYG- re-scope; effectively every other domain.
**Reversibility:** HIGH. `_migration_audit_model1` lets you `UPDATE accounts SET agency_workspace_id = NULL WHERE id IN (SELECT id FROM _migration_audit_model1)`.
**Acceptance:**
- `SELECT count(*) FROM accounts WHERE deleted_at IS NULL AND agency_workspace_id IS NULL` returns **7** (was 194).
- `SELECT count(*) FROM accounts WHERE deleted_at IS NULL AND agency_workspace_id = 'f1f07037-3032-45f8-93ca-72c0f47e4fbb'` increases by **187**.
- 0 active policies now reference a NULL-workspace account whose `state='FL'`.
- The 7 review rows are captured somewhere actionable.
**Priority:** P0, **rank 1** (highest in the entire plan).

---

## MODEL-2 — Carrier reference expansion + `carrier_id` backfill (486)  ★P0★

**Problem.** 486 non-deleted policies have `carrier_id IS NULL` but carrier *text* present. The audit framed this as a simple name→id backfill, but the live data says otherwise: the `carriers` table stores **short brand names** ("Foremost", "Progressive", "Universal Property", "Auto-Owners", "American Traditions"), while policy text stores **full legal names** ("Foremost Insurance Company Grand Rapids, Michigan", "Progressive American Insurance Co", "Universal Property & Casualty Insurance Company"). Exact case-insensitive match covers **only 335/486**. The remaining **151** split into two buckets: (a) legal-name variants of a carrier that *is* in the table (alias mapping), and (b) carriers **not in the 16-row table at all** — Safe Harbor (~78 policies, the single biggest gap), US Coastal (6), Orange Insurance Exchange (3), Lloyd's of London (3), Burlington (4), Mount Vernon (2), plus Wilshire, Covington Specialty, Hadron Specialty, ICAT, USLI, Wright National Flood, AGCS Marine, PIE.

**Change (TEXT — three steps):**

```sql
-- STEP A: add missing carriers to the reference table (the build agent should review the
-- final list with the user/BP- domain; representative INSERTs shown).
INSERT INTO carriers (id, name) VALUES
  (gen_random_uuid(), 'Safe Harbor'),
  (gen_random_uuid(), 'US Coastal'),
  (gen_random_uuid(), 'Orange Insurance Exchange'),
  (gen_random_uuid(), 'Lloy''s of London'),
  (gen_random_uuid(), 'Burlington'),
  (gen_random_uuid(), 'Mount Vernon'),
  (gen_random_uuid(), 'Wilshire'),
  (gen_random_uuid(), 'Covington Specialty'),
  (gen_random_uuid(), 'Hadron Specialty'),
  (gen_random_uuid(), 'ICAT'),
  (gen_random_uuid(), 'United States Liability (USLI)'),
  (gen_random_uuid(), 'Wright National Flood'),
  (gen_random_uuid(), 'AGCS Marine'),
  (gen_random_uuid(), 'Pie (Workers Comp)');
-- (de-dupe against existing names first; do not double-insert.)

-- STEP B: build an alias map (carrier_text -> carrier brand) as a temp/lookup table so the
-- backfill is auditable and re-runnable. One row per distinct legal-name variant.
CREATE TABLE IF NOT EXISTS _carrier_alias_map (raw_text text PRIMARY KEY, carrier_name text NOT NULL);
INSERT INTO _carrier_alias_map (raw_text, carrier_name) VALUES
  ('Foremost Insurance Company Grand Rapids, Michigan', 'Foremost'),
  ('Progressive American Insurance Co',                 'Progressive'),
  ('Progressive Express Ins Company',                   'Progressive'),
  ('Universal Property & Casualty Insurance Company',   'Universal Property'),
  ('Auto-Owners Insurance Company',                     'Auto-Owners'),
  ('American Traditions Insurance Company',             'American Traditions'),
  ('Safe Harbor Insurance Company',                     'Safe Harbor'),
  ('SAFE HARBOR INSURANCE COMPANY',                     'Safe Harbor'),
  ('US Coastal Property & Casualty Insurance Company',  'US Coastal'),
  ('The Burlington Insurance Company',                  'Burlington'),
  ('THE BURLINGTON INSURANCE COMPANY',                  'Burlington'),
  ('Certain Underwriters at Lloyd''s, London',          'Lloyd''s of London'),
  ('Mount Vernon Fire Insurance Company',               'Mount Vernon'),
  ('Orange Insurance Exchange',                         'Orange Insurance Exchange'),
  ('Wright National Flood Insurance Company',           'Wright National Flood'),
  ('Covington Specialty Insurance Company',             'Covington Specialty'),
  ('Hadron Specialty Insurance Company',                'Hadron Specialty'),
  ('AGCS Marine Insurance Company',                     'AGCS Marine'),
  ('United States Liability Insurance Company',          'United States Liability (USLI)'),
  ('Wilshire Insurance Company',                        'Wilshire'),
  ('Universal Property & Casualty Insurance Company',   'Universal Property'),
  ('ICAT',                                              'ICAT'),
  ('PIE',                                               'Pie (Workers Comp)'),
  ('The Pie Insurance Company',                         'Pie (Workers Comp)'),
  ('Progressive', 'Progressive');  -- (extend until every one of the 151 unmatched values is covered)

-- STEP C: backfill carrier_id. First the exact matches (335), then the alias map (the 151).
UPDATE policies p SET carrier_id = c.id
FROM carriers c
WHERE p.deleted_at IS NULL AND p.carrier_id IS NULL
  AND lower(btrim(p.carrier)) = lower(btrim(c.name));

UPDATE policies p SET carrier_id = c.id
FROM _carrier_alias_map m
JOIN carriers c ON lower(btrim(c.name)) = lower(btrim(m.carrier_name))
WHERE p.deleted_at IS NULL AND p.carrier_id IS NULL
  AND p.carrier = m.raw_text;
```

**Unmatched handling.** After STEP C, any residual `carrier_id IS NULL AND carrier IS NOT NULL` rows are genuine gaps — list them, do NOT guess. Keep the `carrier` text column as the permanent raw-import fallback; never overwrite it. `carrier_id` becomes source-of-truth only once the residual is 0 (or signed off).

**Type:** DDL-lite (INSERT into ref) + DML (UPDATE fills NULLs).
**Depends on:** nothing (can run in parallel with MODEL-1). Coordinate the new-carrier list with BP- if it is also touching carriers.
**Blocks:** nothing hard, but improves every carrier-segmented report.
**Reversibility:** HIGH. The backfill only sets previously-NULL `carrier_id`; revert with `UPDATE policies SET carrier_id=NULL WHERE id IN (…captured set…)`. Capture the affected ids before STEP C.
**Acceptance:**
- `carrier_id` NULL count on `deleted_at IS NULL` policies drops from 486 toward 0; residual is an explicit, reviewed list.
- 0 `carrier_id` values orphaned (every value exists in `carriers`).
- Every distinct `carrier` raw value either matched or is on the residual list (none silently dropped).
**Priority:** P0, **rank 2**.

---

## MODEL-3 — LOB normalization: add `line_of_business_id` FK (+ optional canonical/category)  ★P0★

**Problem.** `policies.line_of_business` is free text with **44 distinct values** across 2,164 policies; the 16-row `lines_of_business` reference exists but is **not wired** (no FK column). Reporting, cross-sell line logic, and the LOB-based product matrix all run on un-normalized text today.

**Note on the reference table:** the 16 canonical lines are Auto, Bond, Commercial Auto, Cyber Liability, Flood, General Liability, Home, Life, Motorcycle, Motorhome, Professional Liability, Property, Travel Trailer, Umbrella, Watercraft, Workers Compensation. The hygiene audit's 6-bucket grouping (Auto/Dwelling/Specialty/Commercial/Umbrella/Life) is a **category roll-up**, not the canonical line — so add BOTH a line FK and an optional category. Some raw values (e.g. `renters`, `ho6`, `dp3`, `bop`, `inland marine`) have no exact canonical row and need the HYG- value map to decide their target (e.g. renters→Home or a new Renters line). **This plan owns the structure; HYG- owns the 44→canonical value decisions.**

**Change (TEXT):**

```sql
-- A. Structure: add the FK column (+ optional denormalized helpers).
ALTER TABLE policies ADD COLUMN IF NOT EXISTS line_of_business_id uuid
  REFERENCES lines_of_business(id);
ALTER TABLE policies ADD COLUMN IF NOT EXISTS line_canonical text;   -- optional, human-readable
ALTER TABLE policies ADD COLUMN IF NOT EXISTS line_category  text;   -- optional 6-bucket roll-up

-- (optional) extend the ref table if HYG- decides a missing canonical line is warranted, e.g.:
-- INSERT INTO lines_of_business (id, name, code) VALUES (gen_random_uuid(),'Renters','RENT');

-- B. Apply the map (HYG- supplies the full 44-row mapping; mechanism shown):
CREATE TABLE IF NOT EXISTS _lob_value_map (raw_value text PRIMARY KEY, canonical_name text NOT NULL, category text);
-- ... HYG- populates _lob_value_map with all 44 raw values ...

UPDATE policies p
SET line_of_business_id = l.id,
    line_canonical      = l.name,
    line_category       = m.category
FROM _lob_value_map m
JOIN lines_of_business l ON lower(btrim(l.name)) = lower(btrim(m.canonical_name))
WHERE p.deleted_at IS NULL
  AND lower(btrim(p.line_of_business)) = lower(btrim(m.raw_value));
```

**Never overwrite `line_of_business` raw text** — it stays as the import fallback (same pattern as carrier).

**Type:** DDL (add column + FK) + DML (apply map).
**Depends on:** HYG- value map for the apply step. The DDL (column + FK) can land immediately; the apply step waits on HYG-.
**Blocks:** clean LOB reporting and any line-based cross-sell scoring.
**Reversibility:** HIGH. New columns are additive; drop them or null them to revert. Raw text untouched.
**Acceptance:**
- `line_of_business_id` populated for all rows whose raw value is in the map; residual (unmapped) is an explicit list, not silent NULL.
- 0 orphaned `line_of_business_id`.
- Spot-check: a known `auto` policy resolves to the Auto line; a `ho6`/`renters` policy resolves to whatever HYG- decided (documented).
**Priority:** P0 (column/FK) / P1 (apply, gated on HYG-), **rank 3**.

---

## MODEL-4 — Household model: add `accounts.household_id`, canonicalize on `households`  ★P1★

**Problem.** Three competing household models: `households` (0 rows), `household_accounts` (1 synthetic seed row, contact-keyed, `head_contact_id` NULL), `portal_household_members` (0 rows). **There is no `accounts.household_id` join** — the one column the CRM actually needs. `households` is the right home but is keyed to the dead `contacts` table (`primary_contact_id`, FK delete-rule SET NULL).

**Decision (this plan's recommendation):** Canonicalize on **`households`**, add **`accounts.household_id`**, and re-key `households.primary_contact_id` → `primary_account_id`. **Link, never merge** (spouses are distinct accounts). Deprecate `household_accounts` and `portal_household_members`. **HH- owns which accounts join which household (the 42 HIGH auto-link + MEDIUM/LOW review); this plan owns the schema + the write mechanism.**

**Change (TEXT):**

```sql
-- A. Add the missing join column.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS household_id uuid
  REFERENCES households(id);
CREATE INDEX IF NOT EXISTS idx_accounts_household_id ON accounts(household_id);

-- B. Re-key households to be account-centric (parallel-add, then deprecate the contact column).
ALTER TABLE households ADD COLUMN IF NOT EXISTS primary_account_id uuid
  REFERENCES accounts(id);
-- align tenancy: households.org_id should carry the workspace; backfill from the primary account.
-- (keep households.primary_contact_id for now; drop in MODEL-5 when contacts is retired.)

-- C. Link writing (driven by HH- tier output). For each HH- household group:
--    1) INSERT one households row (name = "Surname — house# ZIP", org_id = workspace,
--       primary_account_id = the canonical/oldest member),
--    2) UPDATE accounts SET household_id = <new household id> for each member.
--    Smallest member UUID as the household natural key, per HH-/B-file rule.

-- D. Deprecate the redundant models (after C is validated):
COMMENT ON TABLE household_accounts IS 'DEPRECATED 2026-06 — superseded by households + accounts.household_id. Do not write.';
COMMENT ON TABLE portal_household_members IS 'DEPRECATED 2026-06 — revive only with client portal, keyed to households + auth users.';
-- (physical DROP deferred until MODEL-5/portal decision; comment-deprecate now to stop new writes.)
```

**Type:** DDL (add column/index) + DML (link writes from HH-).
**Depends on:** **MODEL-1** (so the 187 newly-stamped accounts are in-scope for householding); **HH-** for the grouping decisions.
**Blocks:** household-level cross-sell rollups, "one bill / one roof" views.
**Reversibility:** HIGH for schema (drop column). Link writes are reversible by nulling `household_id` and deleting the created `households` rows (capture ids).
**Acceptance:**
- `accounts.household_id` exists, indexed, FK valid.
- The 42 HIGH households from HH- each have a `households` row + ≥2 member accounts linked.
- `household_accounts` / `portal_household_members` carry the DEPRECATED comment and receive no new writes.
- Spot-check: Floyd (boat+home) and Myers/Rhodes resolve to a single household each.
**Priority:** P1, **rank 4**.

---

## MODEL-5 — PARTY MODEL DECISION (the big one)  ★P2 / architectural★

**Problem.** The "person" layer is in tri-modal limbo: (1) flat columns on `accounts` (`email`, `phone`, `spouse_name`, `date_of_birth`), (2) a `contacts` table with **0 rows** that **26 FK constraints across 23 tables** depend on, and (3) account-centric `insured_profiles / insured_emails / insured_phones / insured_addresses`, all **0 rows**. The entire outbound stack (SMS, voice, consent, portal, marketing, tickets, reviews) FKs into `contacts`, so it cannot function until a person/consent layer is real.

### RECOMMENDATION: **Option A — adopt account-centric `insured_*`, re-point the comms/consent FKs off `contacts`, then deprecate `contacts`.**

**Rationale (why A, decisively):**
1. **There is no data to preserve in Option B's favor.** Every one of the 23 dependent tables is **empty** except `call_sessions` (5 rows, all `contact_id` NULL). `accounts.contact_id` is NULL on all 1,804. So "keep the existing comms schema" (the only real argument for B) protects **zero rows**. The re-point is pure DDL.
2. **`insured_profiles` is already account-keyed** (`account_id` is its key, with `primary_email_id/phone_id/address_id` pointing at the multi-valued `insured_*` tables). It is the *correct* shape for an account-centric CRM and matches the confirmed canonical entity (`accounts`). Option B would force a redundant person row per account and demote the account flat fields — more layers, not fewer.
3. **Multi-valued contact details** (a household with two phones, an insured with mailing≠property address) are natively modeled by `insured_emails/phones/addresses`. Flat account columns and a single `contacts` row both lose that.
4. **Lower blast radius now, before the stack is built.** Re-keying 26 empty FKs is a one-time migration with no row rewrites and no risk of breaking live sends — precisely because nothing is live yet. Every month we wait, the cost grows.

**Why this gates the outbound comms stack:** Canopy/Hermes SMS+voice, `consent_ledger`, `twilio_consents`, `communication_preferences`, `portal_*`, `tickets`, `marketing_send_queue`, `reviews` all resolve "who am I contacting and did they consent?" through a `*_contact_id` FK. Until that FK points at a populated party layer (account-centric `insured_profiles`), there is no legal consent record and no recipient identity to send to. **MODEL-5 is the hard gate in front of the entire proactive-outreach engine.**

**Blast radius (the 26 FKs to re-point or drop), grouped by subsystem:**

| Subsystem | Tables (FK column → contacts) | delete-rule today | Rows |
|---|---|---|---|
| Core / party | `accounts.contact_id`, `businesses.primary_contact_id`, `commercial_business_accounts.primary_contact_id` | NO ACTION | 0 live |
| SMS / voice | `sms_messages.contact_id`, `call_sessions.contact_id` | NO ACTION | sms 0; calls 5 (NULL) |
| Consent | `consent_ledger.contact_id` (SET NULL), `consent_evidence.contact_id` (CASCADE), `twilio_consents.contact_id` (CASCADE), `communication_preferences.contact_id` (CASCADE), `communication_evidence.to_contact_id` (SET NULL), `contact_send_frequency.contact_id` (CASCADE) | mixed | 0 |
| Portal | `client_portal_users.contact_id`, `portal_invitations.contact_id` | NO ACTION | 0 |
| Tickets / reviews | `tickets.contact_id`, `reviews.contact_id` (SET NULL), `review_requests.contact_id` (SET NULL), `nps_responses.contact_id` (SET NULL) | mixed | 0 |
| Marketing | `marketing_send_queue.to_contact_id` (SET NULL), `marketing_automation_enrollments.contact_id` (CASCADE), `marketing_review_requests.contact_id` (CASCADE), `marketing_survey_sends.contact_id` (CASCADE), `marketing_survey_fatigue.contact_id` (CASCADE), `contact_tags.contact_id` (CASCADE) | mixed | 0 |
| Household | `households.primary_contact_id` (SET NULL), `household_accounts.head_contact_id`, `household_accounts.spouse_contact_id` (NO ACTION) | mixed | households 0; h_a 1 |

**Migration outline (TEXT — staged, reversible; build agent executes on branch):**

```sql
-- PHASE 1: populate the account-centric party layer (one insured_profiles row per active account).
INSERT INTO insured_profiles (account_id, display_name, first_name, last_name, org_name, type, status, created_at, updated_at)
SELECT a.id, a.name, a.first_name, a.last_name,
       CASE WHEN a.type <> 'household' THEN a.name END,
       a.type, 'active', now(), now()
FROM accounts a
WHERE a.deleted_at IS NULL
ON CONFLICT (account_id) DO NOTHING;
-- then backfill insured_emails/phones/addresses from accounts.email / accounts.phone / address columns,
-- set insured_profiles.primary_email_id/phone_id/address_id accordingly.

-- PHASE 2: re-point each FK from contacts(id) to the new canonical key.
-- Since insured_profiles is account-keyed, the cleanest target is accounts(id):
--   rename each *_contact_id -> *_account_id (or *_insured_id) and re-FK to accounts(id).
-- Example (repeat per table; all are empty so no data move):
ALTER TABLE sms_messages DROP CONSTRAINT <fk_sms_contact>;
ALTER TABLE sms_messages RENAME COLUMN contact_id TO account_id;
ALTER TABLE sms_messages ADD CONSTRAINT fk_sms_account
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE NO ACTION;
-- ... repeat for all 26 constraints, preserving each table's existing delete-rule semantics ...
-- (consent tables: keep CASCADE; SET NULL tables: keep SET NULL.)

-- PHASE 3: demote/retire contacts.
ALTER TABLE accounts DROP CONSTRAINT <fk_accounts_contact_id>;  -- then DROP COLUMN contact_id later
COMMENT ON TABLE contacts IS 'DEPRECATED 2026-06 — party layer is accounts + insured_*. Pending DROP.';
-- DROP TABLE contacts deferred to a final cleanup migration after all 26 FKs are confirmed re-pointed.
```

**Type:** DDL (heavy — 26 constraint swaps) + DML (PHASE 1 populate).
**Depends on:** **MODEL-1** (so all 1,804 active accounts, incl. the 187, get an `insured_profiles` row). Should land **before** any outbound-comms domain (Canopy/Hermes/consent) builds against the schema, so they target `*_account_id` from day one.
**Blocks:** ALL outbound comms/consent/portal/marketing build work.
**Reversibility:** MEDIUM. The FK renames are reversible but tedious (rename back, restore constraints); do them in one transactional migration. `contacts` DROP is the point of no return — keep it as the final, separate step and snapshot the (empty) table first. PHASE 1 inserts are reversible (truncate `insured_*`).
**Acceptance:**
- 0 FK constraints reference `contacts` (re-query the MODEL-5 constraint list → empty).
- Every active account has exactly one `insured_profiles` row; `primary_*_id` set where source data exists.
- A test insert into `sms_messages` / `consent_ledger` succeeds against an `account_id`.
- `contacts` either dropped or comment-deprecated with 0 inbound FKs.
**Priority:** P2 (architectural), **rank 5** — but **must precede outbound-comms build**; if the comms domains are starting imminently, promote this ahead of MODEL-4/6/7.

---

## MODEL-6 — Drop dead `customer_id` columns + `customers` table  ★P2 cleanup★

**Problem.** The `customers`→`accounts` cutover is complete (`customers` 0 rows, `customers_unified` view already dropped). Four tables still carry a legacy `customer_id` FK column — `customer_tags`, `notes`, `tasks`, `opportunities` — all verified **100% NULL**. Dead weight + a foot-gun for future writes.

**Change (TEXT):**

```sql
-- snapshot is trivial (all NULL), but capture table defs first for audit.
ALTER TABLE customer_tags  DROP CONSTRAINT IF EXISTS <fk_customer_tags_customer_id>;
ALTER TABLE customer_tags  DROP COLUMN IF EXISTS customer_id;
ALTER TABLE notes          DROP CONSTRAINT IF EXISTS <fk_notes_customer_id>;
ALTER TABLE notes          DROP COLUMN IF EXISTS customer_id;
ALTER TABLE tasks          DROP CONSTRAINT IF EXISTS <fk_tasks_customer_id>;
ALTER TABLE tasks          DROP COLUMN IF EXISTS customer_id;
ALTER TABLE opportunities  DROP CONSTRAINT IF EXISTS <fk_opportunities_customer_id>;
ALTER TABLE opportunities  DROP COLUMN IF EXISTS customer_id;
-- finally, after the 4 FKs are gone:
DROP TABLE IF EXISTS customers;
```

**Type:** DDL (drop columns + table).
**Depends on:** nothing functionally (columns are all NULL). Sequence the `DROP TABLE customers` AFTER the 4 column drops (they are the only inbound FKs).
**Blocks:** nothing.
**Reversibility:** LOW (dropping columns/table is destructive) — but the columns are provably empty and the table has 0 rows, so there is nothing to lose. Keep DDL-to-recreate in the migration comment if paranoid.
**Acceptance:**
- 0 FK constraints reference `customers` (re-query → empty).
- `customers` table gone; the 4 `customer_id` columns gone.
- `tasks`/`notes` still resolve via `account_id` (unaffected).
**Priority:** P2, **rank 6**.

---

## MODEL-7 — Wire the dedup scaffolding (`duplicate_detection_rules` / `duplicate_flags` / `merge_history`)  ★P1★

**Problem.** `duplicate_groups` has 362 pending candidates but **no rules drive them** (`duplicate_detection_rules` 0), **none are reviewed**, and **no merge has ever run** (`merge_history` 0; `duplicate_flags` 0). The scaffolding exists but is inert. **DUP- owns the survivor rule + tier decisions (21 T1, 58 T2, 4 T3); this plan owns making the three tables actually drive and record the process.**

**Table shapes (verified):**
- `duplicate_detection_rules`(id, entity_type, rule_name, match_fields jsonb, threshold numeric, is_active bool, …)
- `duplicate_groups`(id, entity_type, entity_ids[], match_score, rule_id→rules, status, reviewed_by, reviewed_at, …)
- `duplicate_flags`(id, account_id, flagged_by, reason, created_at)
- `merge_history`(id, entity_type, survivor_id, merged_ids[], merge_data jsonb, merged_by, created_at)

**Change (TEXT):**

```sql
-- A. Seed the rules that SHOULD have produced the 362 groups (DUP- supplies thresholds/fields).
INSERT INTO duplicate_detection_rules (id, entity_type, rule_name, match_fields, threshold, is_active, created_at, updated_at) VALUES
 (gen_random_uuid(),'accounts','T1: same name + identical address or phone',
    '{"name":"exact","or":[{"address":"exact"},{"phone":"exact"}]}'::jsonb, 0.95, true, now(), now()),
 (gen_random_uuid(),'accounts','T2: same name + same email or zip (complementary)',
    '{"name":"exact","or":[{"email":"exact"},{"zip":"exact"}]}'::jsonb, 0.80, true, now(), now()),
 (gen_random_uuid(),'accounts','T3: same name, different address (review only)',
    '{"name":"exact","address":"different"}'::jsonb, 0.60, true, now(), now());

-- B. Back-link the existing 362 groups to the rule that matches their pattern (set rule_id).
--    (DUP- classifies each group → T1/T2/T3; UPDATE duplicate_groups SET rule_id = <rule> WHERE id IN (...).)

-- C. Merge flow (executed per DUP- decision, ONE group at a time, transactional):
--    1) choose survivor by DUP- rule (most active policies → most complete → most recent updated_at),
--    2) union non-null fields onto survivor,
--    3) re-parent active policies: UPDATE policies SET account_id = survivor WHERE account_id = ANY(losers),
--    4) soft-delete losers (deleted_at = now()),
--    5) RECORD it:
INSERT INTO merge_history (id, entity_type, survivor_id, merged_ids, merge_data, merged_by, created_at)
VALUES (gen_random_uuid(),'accounts', :survivor, :losers_array, :before_after_json, :actor, now());
--    6) mark the group: UPDATE duplicate_groups SET status='merged', reviewed_by=:actor, reviewed_at=now();

-- D. duplicate_flags: seed for the human-review tiers (Jr/Sr, name-swaps, person↔business, shared-phone-only)
INSERT INTO duplicate_flags (id, account_id, flagged_by, reason, created_at)
VALUES (gen_random_uuid(), :account, :actor, 'review: Jr/Sr same address — do not auto-merge', now());
```

**Every merge MUST write `merge_history` before the loser is soft-deleted** — that row is the reversibility contract (it carries `merged_ids` + `merge_data` to reconstruct).

**Type:** DML (seed rules/flags) + DML (merge execution, DUP-gated).
**Depends on:** **MODEL-1** (so the 187 stamped accounts participate in dedup) and **DUP-** for tiers/survivor decisions.
**Blocks:** **MODEL-8** (archival must not run until merges have re-parented policies and soft-deleted losers).
**Reversibility:** HIGH by design — `merge_history` enables un-merge (restore losers' `deleted_at`, re-parent policies back) per the before/after JSON.
**Acceptance:**
- `duplicate_detection_rules` non-empty; every `duplicate_groups` row has a `rule_id`.
- Each executed merge has a `merge_history` row with non-empty `merged_ids` + `merge_data`.
- Re-parented policies point at survivors (0 active policies orphaned).
- Review-only clusters are in `duplicate_flags`, not merged.
**Priority:** P1, **rank 7**.

---

## MODEL-8 — Archive ~14,187 soft-deleted import rows in `accounts`  ★P2 cleanup★

**Problem.** `accounts` holds 15,991 rows; only 1,804 are active → **14,187 soft-deleted** (import/dedup churn). They inflate every non-filtered query/scan and any future merge target search.

**Change (TEXT):**

```sql
-- A. Move soft-deleted rows to a cold archive table (do NOT hard-delete blindly).
CREATE TABLE IF NOT EXISTS accounts_archive (LIKE accounts INCLUDING ALL);
INSERT INTO accounts_archive
SELECT * FROM accounts a
WHERE a.deleted_at IS NOT NULL
  -- guard: never archive a row that is a survivor or a recently-merged loser still referenced
  AND NOT EXISTS (SELECT 1 FROM merge_history mh WHERE a.id = ANY(mh.merged_ids) AND mh.created_at > now() - interval '30 days')
  AND NOT EXISTS (SELECT 1 FROM policies p WHERE p.account_id = a.id AND p.deleted_at IS NULL);
-- B. Only AFTER archive is verified, remove from the hot table:
DELETE FROM accounts a
WHERE a.deleted_at IS NOT NULL
  AND EXISTS (SELECT 1 FROM accounts_archive ar WHERE ar.id = a.id);
```

**Type:** DDL (archive table) + DML (move) + DML (delete).
**Depends on:** **MODEL-7** (and DUP-/HH- merges) — archival is the LAST step so no row that becomes a survivor/merge target is removed. The `NOT EXISTS` guards enforce this even if sequencing slips.
**Blocks:** nothing (final step).
**Reversibility:** MEDIUM — rows live in `accounts_archive`; re-insert to restore. Keep the archive table indefinitely (cheap) before any true hard-delete.
**Acceptance:**
- `accounts` hot-table row count ≈ 1,804 (+ any retained edge cases); soft-deleted residue moved.
- 0 active policies reference an archived/deleted account (guard query returns 0).
- `accounts_archive` row count ≈ 14,187.
**Priority:** P2, **rank 8** (last).

---

## 2. Cross-domain dependency summary (for the orchestrator)

| MODEL item | P-tier | Hard prerequisite | Coordinates with | Gates / blocks |
|---|---|---|---|---|
| MODEL-1 stamp 187 FL | **P0** | — | — (single tenant, unambiguous) | **Phase-0 re-run, HH-, BP-, DUP-, HYG- (all re-scope)** |
| MODEL-2 carrier ref+backfill | **P0** | — | BP- (carrier list) | carrier reporting |
| MODEL-3 LOB FK | **P0**(ddl)/P1(apply) | — | **HYG-** (44→canonical map) | LOB reporting, line cross-sell |
| MODEL-4 household_id | **P1** | MODEL-1 | **HH-** (grouping tiers) | household rollups |
| MODEL-5 party model (Option A) | **P2** | MODEL-1 | **all outbound-comms domains** | **entire SMS/consent/portal/marketing stack** |
| MODEL-6 drop customer_id + customers | **P2** | — | — | nothing |
| MODEL-7 dedup wiring | **P1** | MODEL-1 | **DUP-** (tiers/survivor) | MODEL-8 |
| MODEL-8 archive 14k | **P2** | MODEL-7 (+ DUP-/HH- merges) | — | nothing (final) |

**Additive (safe, low-risk) vs architectural:**
- **Additive / P0:** MODEL-1 (fills NULLs), MODEL-2 (fills NULLs + ref inserts), MODEL-3 columns (additive).
- **Customer-correctness / review-gated / P1:** MODEL-4, MODEL-7 (both write via review workbook → branch → prod; merges logged & reversible).
- **Architectural / P2:** MODEL-5 (26-FK re-point — the one true design decision), MODEL-6 (destructive but provably-empty), MODEL-8 (archival, last).

---

## 3. Things I could not fully stand behind (flag for the build agent)

1. **The 187 FL stamp assumes single-tenancy.** Verified only 1 non-null workspace exists, so this is safe today — but if a second agency is ever added to this DB, re-confirm before bulk-stamping by `state`.
2. **The 7 excluded null-ws rows need a human.** 6 are `state=NULL`/0-policy (likely test/incomplete); 1 is VT/1-policy. I recommend review, not auto-stamp. If the VT account is a real Lewis client who moved, stamp it individually.
3. **Carrier alias map is representative, not exhaustive.** I listed the high-frequency variants from the live distinct-value query, but the build agent must extend `_carrier_alias_map` until **all 151** unmatched values are covered (re-run the unmatched query after each pass until it returns 0). The new-carrier INSERT list should be confirmed with the user/BP- (some "carriers" like ICAT/PIE may be programs/MGAs, not standalone carriers).
4. **LOB targets for `renters`, `ho6`, `dp1/dp3`, `bop`, `inland marine` are HYG-'s call** — the 16-row ref has no exact home for several of these; this plan provides the column/FK but defers the value decision.
5. **`households.org_id` vs `agency_workspace_id`.** `households` uses `org_id`, not `agency_workspace_id`. The build agent must confirm `org_id` carries the same tenant value (or map it) when creating household rows in MODEL-4.
6. **`call_sessions` has 5 rows** (all `contact_id` NULL). Harmless for the MODEL-5 re-point, but the build agent should confirm those 5 don't carry meaning before renaming the column.
