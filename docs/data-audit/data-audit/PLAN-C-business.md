# PLAN-C — Business vs Personal Classification (build-ready)

**Database:** InsureFlow / Supabase `lrqajzwcmdwahnjyidgv`
**Workspace (agency):** `f1f07037-3032-45f8-93ca-72c0f47e4fbb`
**Planned by:** Domain C agent (business/personal) — 2026-06-27
**Status:** PLANNING ONLY. No DDL/DML executed. All SQL/DDL below is TEXT for the build agent. Only read-only SELECTs were run to verify counts.
**Source audits:** `00-AUDIT-CONSOLIDATED.md`, `C-business-personal.md`

---

## 0. Re-verified anchors (read-only, full active book `deleted_at IS NULL`)

These supersede the numbers in `C-business-personal.md`, which were scoped to the **stamped** workspace (book=1,607). The **true active book is 1,804** and includes 194 null-workspace accounts, so several counts shifted. Build agent must trust THIS table.

| Fact | `C-business-personal.md` (stamped only) | Re-verified (full active book) | Notes |
|---|---|---|---|
| Active accounts | 1,610 / 1,607 | **1,804** | 1,803 `household` / 1 `commercial_business` |
| `type` enum (`account_type_v2`) | — | **`household`, `commercial_business`** | NOT NULL, default `household` |
| `account_type` enum (`account_type_new`) | — | **`individual`, `business`, `household`** | default `individual` |
| Tier-1 (name AND commercial line) | 24 | **25** | +1 = "Meredith Lapradd as Trustee" (null-ws, **FP→review**, not auto) |
| Tier-2 (commercial line only) | 24 | **28** | +4 null-ws sole-props (ANGUS PARKER, Anthony Bowles, Johnny Copeland, Raymond Goushaw) |
| Tier-3 (name only) | 53 | **53** | unchanged |
| Union (either signal) | 101 | **106** | |
| **Guardrail universe: household accts holding a non-deleted commercial line** | ~48 | **52** (47 stamped + 5 null-ws) | This is the authoritative regression-guard target |
| Lone `commercial_business` row | 1 (Blue Oak demo) | **1 confirmed** | `22222222-2222-4222-8222-222222222222`, `commercial_business_accounts.notes`="Sample commercial account; demo data only." |

**Structural facts verified (load-bearing for the plan):**
1. **A `sync_account_types` BEFORE INSERT/UPDATE trigger already exists on `accounts`.** It bidirectionally syncs `type` ↔ `account_type` via `pick_enum_label`: setting `type='commercial_business'` **auto-sets** `account_type='business'`, and vice versa. **The migration must set only ONE of the two columns** (recommend `type`); the trigger maintains the other. Any new guardrail trigger must coexist with it (both are BEFORE on accounts).
2. `commercial_business_accounts.account_id` is the **PRIMARY KEY** (one row/account) with **FK→accounts(id) ON DELETE CASCADE**. Clean upsert target. Columns: `legal_name, dba_name, fein, naics_code, years_in_business, employees_count, annual_revenue, primary_contact_id, notes, created_at, updated_at`.
3. `commercial_business_accounts.primary_contact_id` **FK→contacts(id)**, and `accounts.contact_id` **FK→contacts(id)**. The `contacts` table is **0 rows / dead** (per Audit D). **Therefore the person↔business link via `primary_contact_id` CANNOT be populated until the party-model decision (Audit D / Domain D) lands.** Hard cross-domain blocker — see BIZ-7.
4. `policies` has `status` (text) and `deleted_at`. Guardrail/detection is defined over **`policies.deleted_at IS NULL`** (any non-deleted commercial line), NOT only `status='active'` — a bound-but-not-yet-active commercial policy still makes the account a business.
5. `business_types` has 8 rows, all `is_active=true`. Verified UUIDs (build agent: do NOT hardcode; resolve by `name` at migration time, but these are the current values):
   - LLC `25567fce-5b4a-4e39-a91a-1f83e46a8863`
   - S-Corp `1c033f50-df43-48a7-9ab7-c5380dda3f04`
   - Corporation `c1affe68-dbc5-4697-be85-72670d89ff28`
   - Partnership `636d83a5-284b-43a7-a01e-0a47e02dd9b6`
   - Sole Proprietorship `22edbef5-5e94-41eb-b50a-8a67d29b4e9f`
   - Non-Profit `44f486d2-067a-4046-a497-c3d8438a80c7`
   - Government `51bf78f4-edee-4fc9-b635-38f4237b48c9`
   - Individual `9d879619-2d05-4253-a95c-30d2dc07b51c`
   - **NOTE:** there is no FK column on either `accounts` or `commercial_business_accounts` pointing to `business_types` today. Adding the entity-structure linkage requires a schema change (BIZ-4). Until then `business_types` stays a lookup-only table.

**Disputes / things I cannot stand behind (flagged for the build agent):**
- **D-1 (count):** `C-business-personal.md` "Tier-1 = 24" is stale; full book = **25**, of which the 25th ("Meredith Lapradd as Trustee") is a **review/FP**, not an auto. Net auto-eligible after exclusions ≈ **21** (see BIZ-2).
- **D-2 (Tier-2 size):** doc says 24; full book = **28** (the 4 extra are null-workspace sole-proprietors). All Tier-2 are review-gated anyway.
- **D-3 (Sorensen rows):** doc says "~9"; live count = **8** rows (6 identical "SORENSEN AND SMITH LLC" + "Sorensen & Smith Llc" + "Sorensen & Smith, Llc"), all Live Oak FL. One holds a `commercial_auto` line.
- **D-4 (entity-structure FK):** No `business_type_id` column exists anywhere. The "map entity suffix → business_types" step is **blocked on a schema add** (BIZ-4) — it is not just a data backfill as the audit implies.
- **D-5 (person↔business link):** `primary_contact_id` requires `contacts` rows that do not exist. The relate-don't-merge rule is **partially blocked** (BIZ-7) until the party model is chosen.

---

## 1. Cross-domain dependencies (state explicitly)

| This plan depends on | Why | Hard or soft |
|---|---|---|
| **P0-1 workspace stamp** (Domain D / consolidated roadmap) | Un-hides 5 null-ws guardrail violations + 1 null-ws Tier-1 FP + 4 null-ws Tier-2. If reclassification runs first, those 10 accounts are silently missed. | **HARD — must precede** the reclassification pass |
| **HYG- LOB normalization** (Domain E; `line_canonical`/`line_category` or `line_of_business_id`) | Commercial-line detection currently relies on brittle `ILIKE` over 41 raw text values. A normalized `line_category='Commercial'` makes Tier-1/Tier-2 detection AND the guardrail reliable and maintainable. | **SOFT-but-strongly-preferred** — see BIZ-0. Detection can run on raw text as a fallback, but the guardrail trigger should key off the normalized category once it exists |
| **DUP- dedup** (Domain A; Sorensen & Smith 8 rows, plus any business-name dup clusters) | Reclassifying 8 Sorensen rows individually creates 8 commercial accounts + 8 `commercial_business_accounts` rows for ONE business. Dedup must collapse them first (or jointly). | **HARD — must precede or be co-sequenced** for Sorensen; soft for the rest |
| **Party-model decision** (Domain D; `contacts` vs `insured_*`) | `commercial_business_accounts.primary_contact_id` and the person↔business relationship need a real contact row. | **HARD blocker for BIZ-7** only; does not block BIZ-1..BIZ-6 |

**Ordering relative to other domains:** `P0-1 stamp` → `HYG- LOB normalize` → `DUP- dedup (Sorensen + business clusters)` → **this plan BIZ-1…BIZ-8** → (later) BIZ-7 person-link once party model lands.

---

## 2. Ordered build items

> Standard structure per item: **Problem / Change / Type / Depends on / Blocks / Reversibility / Acceptance / Priority+rank**. All SQL is TEXT.

---

### BIZ-0 — Adopt normalized commercial-line predicate (detection contract)
- **Problem:** Every downstream step (tiering, reclassification, guardrail) needs one agreed definition of "this account holds a commercial line." Raw `line_of_business` has 41 mixed-case values; ad-hoc `ILIKE` lists drift.
- **Change:** Define a single reusable predicate the rest of the plan references as `IS_COMMERCIAL_LINE(account_id)`. Preferred implementation once HYG- lands: `EXISTS (SELECT 1 FROM policies p WHERE p.account_id=:id AND p.deleted_at IS NULL AND p.line_category='Commercial')`. Fallback until HYG- lands (raw-text, validated to return the same 52-account set today):
  ```sql
  EXISTS (SELECT 1 FROM policies p
          WHERE p.account_id = a.id AND p.deleted_at IS NULL AND (
               p.line_of_business ILIKE 'commercial%'
            OR p.line_of_business ILIKE '%general liability%'
            OR lower(p.line_of_business) = 'gl'
            OR lower(p.line_of_business) = 'bop'
            OR p.line_of_business ILIKE '%workers%comp%'
            OR p.line_of_business ILIKE '%inland marine%'
            OR p.line_of_business ILIKE '%professional%'))
  ```
  Optionally encapsulate as an `IMMUTABLE`-ish helper view `v_account_commercial_flag(account_id, has_commercial_line)` for reuse by the review workbook and the guardrail.
- **Type:** Definition/contract (no data change). Optional thin view.
- **Depends on:** HYG- LOB normalization (preferred) — else use fallback.
- **Blocks:** BIZ-1, BIZ-2, BIZ-3, BIZ-6 (guardrail).
- **Reversibility:** Trivial (drop view).
- **Acceptance:** Predicate returns exactly **52** household accounts on today's data (47 stamped + 5 null-ws). If HYG- normalization is in place, the `line_category='Commercial'` form must return the same 52 (any delta is a mapping gap to fix in HYG-, not here).
- **Priority:** P1, rank 1.

---

### BIZ-1 — Build the reclassification review workbook (read-only export, no writes)
- **Problem:** Tier-2 and Tier-3 (and the 3 special exclusions) require human eyeball before flipping `type`. There is no staging artifact today; the audit lists are prose.
- **Change:** Produce a single ordered export (CSV or a `staging.business_reclass_candidates` table — staging only, not prod tables) of all **106** flagged accounts with columns: `account_id, name, city, state, agency_workspace_id, null_ws, name_sig, line_sig, commercial_lines[], tier (1/2/3), proposed_action (AUTO_FLIP / REVIEW_FLIP / EXCLUDE_FP / EXCLUDE_DEMO / EXCLUDE_AGENCY / DEDUP_FIRST), proposed_business_type, dup_cluster_key`. Pre-populate `proposed_action` from the rules in BIZ-2..BIZ-5 so the human only confirms/overrides.
- **Type:** Read-only export / staging build.
- **Depends on:** BIZ-0; P0-1 stamp (so null-ws rows are present and visible).
- **Blocks:** BIZ-2 (Tier-1 spot-check), BIZ-3 (Tier-2/3 review).
- **Reversibility:** N/A (read-only / drop staging table).
- **Acceptance:** Workbook contains 106 rows; flags reconcile to BIZ-0 counts (25 Tier-1, 28 Tier-2, 53 Tier-3); the 3 FPs (Harry Branch, Shelia Branch, Meredith Lapradd as Trustee), Blue Oak demo, and Lewis & Lewis agency are pre-marked EXCLUDE_*; the 8 Sorensen rows are pre-marked DEDUP_FIRST with a shared `dup_cluster_key`.
- **Priority:** P1, rank 2.

---

### BIZ-2 — Tier-1 reclassification (name + commercial line) — AUTO after one spot-check
- **Problem:** 25 entity-named accounts that also carry a commercial line are unambiguously businesses but typed `household`. They are the safe, high-confidence flip.
- **Change:** After a single human spot-check of the 25-row Tier-1 slice in the workbook, set **`type='commercial_business'`** (the `sync_account_types` trigger auto-sets `account_type='business'` — **do not also set `account_type` in the same statement to avoid double-handling**). Apply ONLY to the auto-eligible subset:
  - **Exclude (4):** `Blue Oak Manufacturing, LLC` (demo, BIZ-8), `Lewis & Lewis Insurance Agency Inc` (agency-internal), `Meredith Lapradd as Trustee` (`%TRUST%`→GL FP; trust/estate, route to REVIEW not auto), and the Sorensen rows (DEDUP_FIRST, BIZ via DUP-).
  - **Defer to dedup (8 Sorensen rows incl. the Tier-1 "Sorensen & Smith Llc"):** one surviving account flips post-dedup.
  - **Net auto-eligible ≈ 21** distinct businesses (e.g. Assured Property Management Llc, B & B Homes New Home Builders Inc, Beachville Advent Christian Church, Cannon Cleaning Company LLC, China House 58 Inc, D And H Tractor Works LLC, Donald Roberts Masonry Llc, Elite Rc Productions Llc, Evergreen Baptist Church, Ferrell'S Inc, Garden Maze Inc, Levings Forest Products Inc, Local Roots Apothecary LLC, Meeks Grain Inc, Pbc Inc, Plumbing Concepts Inc, Robey Investments Llc, Seth Heitzman Construction Inc, Stan Jacobs LLC, Topline Home And Aluminum Services, True Life Apostolic Church).
  - SQL shape (TEXT): `UPDATE accounts SET type='commercial_business', updated_at=now() WHERE id = ANY(:approved_tier1_ids) AND type='household';` Run inside a transaction; capture pre-image (see Reversibility).
- **Type:** DML reclassification (review-gated, branch→prod).
- **Depends on:** BIZ-1; **DUP- dedup of Sorensen** (HARD, for those rows); P0-1 stamp.
- **Blocks:** BIZ-4 (populate `commercial_business_accounts` for these), BIZ-6 (guardrail will assume these are resolved).
- **Reversibility:** **Reversible.** Before update, snapshot `(id, old_type='household', old_account_type)` to a `staging.reclass_log` (or reuse the existing `audit_accounts` AFTER-UPDATE trigger, which already logs changes — verify it captures `type`). Rollback = `UPDATE accounts SET type='household' WHERE id=ANY(...)`.
- **Acceptance:** Exactly the approved ~21 ids flip to `commercial_business`; `account_type` becomes `business` for each (trigger-driven); the 4 exclusions remain `household`; `audit_accounts`/`reclass_log` has one row per flip; re-running BIZ-0 predicate shows these 21 no longer in the "household + commercial line" set.
- **Priority:** P1, rank 3.

---

### BIZ-3 — Tier-2 & Tier-3 reclassification — REVIEW-gated flips
- **Problem:** Tier-2 (28: commercial line under a personal/brand name) and Tier-3 (53: entity name, no commercial line yet) are very likely businesses but each carries a false-positive or person-vs-business risk, so they must not auto-flip.
- **Change:** Human reviews each in the BIZ-1 workbook and sets the action. Two sub-rules:
  - **Tier-2 sole-proprietor pattern:** Many Tier-2 are individuals whose *personal* lines should stay personal while the commercial activity is a related entity (the Horace Witt pattern — BIZ-7). For these, **do NOT flip the person to `commercial_business`**; instead create/relate a separate commercial entity. Only flip the row itself if the account genuinely IS the business (e.g. brand-named "BoxDrop Live Oak", "Friendly Hands Cleaning", "Road Runner Tire And Break Express", "Dale'S Mobile Homes Setup").
  - **Tier-3:** flip after eyeball; **exclude the 2 `%RANCH%` FPs** (Harry Branch, Shelia Branch → keep household) and collapse the Sorensen duplicates (DUP-).
  - Apply approved flips with the same single-column `type='commercial_business'` update + pre-image snapshot as BIZ-2.
- **Type:** DML reclassification (review-gated).
- **Depends on:** BIZ-1, BIZ-2; DUP- (Sorensen); BIZ-7 decision per Tier-2 sole-prop (relate vs flip).
- **Blocks:** BIZ-4 (firmographic backfill for approved flips).
- **Reversibility:** Same snapshot/rollback as BIZ-2.
- **Acceptance:** Every Tier-2/Tier-3 row has an explicit approved action; Harry Branch + Shelia Branch remain `household`; no Tier-2 personal sole-prop was flipped without a corresponding BIZ-7 related-entity decision; flips logged and reversible.
- **Priority:** P1, rank 4.

---

### BIZ-4 — Populate `commercial_business_accounts` + add/seed entity-structure (`business_types`)
- **Problem:** Reclassified accounts have no firmographic record; `commercial_business_accounts` is empty except the Blue Oak demo. There is also **no FK column linking an account/business to `business_types`** (verified — D-4).
- **Change:** Two parts.
  - **(a) Backfill `commercial_business_accounts`** — one upsert per reclassified account (BIZ-2 + approved BIZ-3). Backfill what is derivable; leave the rest NULL pending data:
    - `account_id` = the account id (PK)
    - `legal_name` = `accounts.name` (best available legal name today)
    - `dba_name` = NULL unless review supplies it
    - `fein`, `naics_code`, `years_in_business`, `employees_count`, `annual_revenue` = **NULL pending data** (not in source; do not fabricate)
    - `primary_contact_id` = **NULL pending party model** (BIZ-7 / Domain D) — do not point at `contacts` (0 rows)
    - `notes` = provenance string, e.g. `'Reclassified from household by PLAN-C BIZ-4 on <date>; tier=<n>.'`
    - SQL shape (TEXT): `INSERT INTO commercial_business_accounts(account_id, legal_name, notes, created_at, updated_at) SELECT a.id, a.name, '...', now(), now() FROM accounts a WHERE a.id=ANY(:reclassified_ids) ON CONFLICT (account_id) DO NOTHING;`
  - **(b) Entity-structure linkage (schema add, then map):** Add a nullable `business_type_id uuid REFERENCES business_types(id)` to `commercial_business_accounts` (preferred home — keeps firmographics together). Then map entity suffix → `business_types.name` during review/backfill:
    - `LLC` / `L.L.C` → LLC; `Inc` / `Corp` / `Corporation` → Corporation; `S-Corp` token → S-Corp; `Partnership` / `& Sons` (judgment) → Partnership; `Church`/`Ministr`/`Temple`/`Advent`/`Baptist`/`Apostolic` → Non-Profit; bare personal-name sole-props (Tier-2 brand businesses) → Sole Proprietorship; government bodies → Government. Resolve the target id by `SELECT id FROM business_types WHERE name=:label` (do not hardcode UUIDs).
    - Leave `business_type_id` NULL where the suffix is ambiguous (route to review).
- **Type:** DDL (one nullable FK column) + DML backfill. Additive/non-destructive.
- **Depends on:** BIZ-2 (and BIZ-3 for approved rows). Part (b) FK add depends only on `business_types` existing (it does).
- **Blocks:** Nothing hard; enables commercial reporting/segmentation.
- **Reversibility:** Additive and reversible — `DELETE FROM commercial_business_accounts WHERE account_id=ANY(:reclassified_ids)` (CASCADE-safe, these are new rows); `ALTER TABLE ... DROP COLUMN business_type_id`. Do NOT delete the Blue Oak row here (BIZ-8 owns it).
- **Acceptance:** One `commercial_business_accounts` row per reclassified account with `legal_name` populated and firmographic fields NULL; `business_type_id` set for unambiguous suffixes and NULL otherwise; church/non-profit names mapped to Non-Profit; no fabricated FEIN/NAICS/revenue; Blue Oak demo row untouched.
- **Priority:** P1, rank 5.

---

### BIZ-5 — Explicit false-positive exclusions (codify, don't just document)
- **Problem:** Substring signals create known false positives that must never be auto-flipped now or on future loads.
- **Change:** Encode the exclusion list as data + as guardrail-exception logic:
  - **`%RANCH%` surname FP:** `Harry Branch`, `Shelia Branch` → keep `household`. (Verified both present, `household`.)
  - **Married "& " names:** keep the `% & %` (spaced) requirement; never match bare `&`. (All 7 spaced-`&` matches in book are real businesses; rule still required for future loads.)
  - **Surname `Co`/`Carr`/`Carrington`:** use `% CO %`/`% CO` (not bare `CO`); `Carr*` is NOT in the signal — leave as-is. Verified no spurious matches today.
  - **Trust/estate FP:** `Meredith Lapradd as Trustee` (`%TRUST%`→GL) → route to REVIEW (trust/estate per existing `accounts.primary_entity_type` check allows 'trust'/'estate'); do not auto-flip. A trust holding a GL policy may be a landlord/estate, not a commercial business — human decides.
  - Maintain a small `staging.reclass_exclusions(account_id, reason)` seeded with these ids so the guardrail (BIZ-6) and any re-run skip them.
- **Type:** Data/config (exclusion list) + rule documentation.
- **Depends on:** BIZ-1.
- **Blocks:** BIZ-2, BIZ-3, BIZ-6 (guardrail must honor exclusions to avoid false enforcement).
- **Reversibility:** Trivial (edit list).
- **Acceptance:** Harry/Shelia Branch and Meredith Lapradd never appear in any auto-flip set; exclusion list referenced by guardrail; future-load note recorded for `%FARM%`/`%RANCH%`/bare-`&` watch.
- **Priority:** P1, rank 6 (co-req with BIZ-2/3).

---

### BIZ-6 — Guardrail: "any account holding a commercial line MUST be typed commercial_business"
- **Problem:** Even after this cleanup, a future personal→commercial policy add (or import) would re-create mis-typed rows. Need enforcement + a standing data-quality check. **52 accounts violate this rule today.**
- **Change:** Two layers.
  - **(a) Standing DQ check (non-blocking):** a view `v_business_type_violations` = household accounts where BIZ-0 predicate is true AND not in `staging.reclass_exclusions`. Wire into the recurring data-quality job. Today it should list the residual violators (everything not yet flipped).
  - **(b) Enforcement trigger (after backfill is complete):** Because a commercial line lives in `policies` (child), enforce on **policy** insert/update, not on accounts. Design a `BEFORE INSERT OR UPDATE ON policies` trigger function that, when the new/changed policy is a commercial line (BIZ-0 category) and `deleted_at IS NULL`, promotes the parent account: `UPDATE accounts SET type='commercial_business' WHERE id=NEW.account_id AND type='household' AND id NOT IN (SELECT account_id FROM staging.reclass_exclusions);` (auto-promote pattern), OR raises a soft warning, per owner preference. **Recommendation: auto-promote** (the rule is definitional) but SKIP exclusion-list accounts.
  - **Coexistence:** This new trigger is on `policies`; it does not collide with the existing `accounts.sync_account_types` (BEFORE on accounts) — in fact it relies on it to sync `account_type`. Confirm trigger ordering vs the existing `policies` triggers (`audit_policies`, `trg_auto_sync_policy_to_renewal`, `trigger_automation_rules_on_policies`); name the new trigger to sort acceptably (e.g. `aa_enforce_commercial_type` if it must run early, or accept default alphabetical).
  - **Do NOT add a CHECK constraint** crossing tables — a CHECK cannot subquery `policies`. The trigger is the only viable enforcement.
- **Type:** DDL (trigger function + trigger on `policies`) + view. Enforcement is behavior-changing — gate behind owner sign-off.
- **Depends on:** BIZ-0, BIZ-2, BIZ-3 (flip the existing 52 first so the trigger does not fire en masse retroactively), BIZ-5 (exclusions), HYG- (preferred, so it keys off `line_category`).
- **Blocks:** Prevents regression for all future loads.
- **Reversibility:** Reversible — `DROP TRIGGER`/`DROP FUNCTION`/`DROP VIEW`. Auto-promotions are logged via existing `audit_accounts`.
- **Acceptance:** With the 52 resolved, `v_business_type_violations` returns 0 (excluding the intentional exclusion-list rows). Inserting a test commercial policy on a household account (on a branch) flips that account to `commercial_business` unless excluded; inserting on an excluded account does not. Existing policy triggers still fire (audit, renewal sync).
- **Priority:** P1, rank 7 (after the bulk flips land).

---

### BIZ-7 — Person ↔ business relationship (keep SEPARATE, relate — do NOT merge)
- **Problem:** Several individuals own a commercial entity at the same phone/address (textbook: `Horace Witt` + `D And H Tractor Works LLC`, shared phone `+13866231125`, both `household` today). Merging would destroy either the personal cross-sell or the commercial book.
- **Change:** Rule: keep two separate `accounts` rows. Re-type the **entity** to `commercial_business` (handled in BIZ-2/BIZ-3); keep the **person** as `household`/individual for their personal lines. **Relate** them — intended mechanism is `commercial_business_accounts.primary_contact_id` → the owner's contact. **BLOCKED:** that column FKs to `contacts` (0 rows). Until the party model lands (Domain D), capture the relationship in an interim way that does NOT fabricate a contact:
  - Interim: record the owner↔entity pair in `commercial_business_accounts.notes` (e.g. `'Owner personal account: Horace Witt (account_id ...). Relate via primary_contact_id once contacts exist.'`) and/or in a `staging.business_owner_links(business_account_id, owner_account_id, match_signal)` staging table.
  - Final: once Domain D backfills `contacts`, set `commercial_business_accounts.primary_contact_id` to the owner's contact and clear the interim note. (Follow-up item owned jointly with Domain D.)
  - Apply the same "separate but related" rule to every Tier-2 sole-proprietor where the person's personal lines should stay personal (see BIZ-3).
- **Type:** Rule + interim staging data; final step is DML once party model exists.
- **Depends on:** BIZ-2/BIZ-3 (entity typed); **HARD-blocked** for the final `primary_contact_id` write on the **party-model decision (Domain D)**.
- **Blocks:** Clean commercial-with-owner reporting; cross-sell linkage.
- **Reversibility:** Interim is notes/staging (trivial). Final link reversible (set `primary_contact_id=NULL`).
- **Acceptance:** Horace Witt stays `household`; D And H Tractor Works LLC becomes `commercial_business`; the two remain distinct account ids; an interim owner-link record exists; a follow-up is filed to populate `primary_contact_id` after Domain D. No merge occurred.
- **Priority:** P1 (interim) rank 8; final link = P2 (deferred, gated on Domain D).

---

### BIZ-8 — Lone demo `commercial_business` record handling (Blue Oak)
- **Problem:** The only correctly-typed `commercial_business` account is **seed/demo data** (`22222222-2222-4222-8222-222222222222`, "Blue Oak Manufacturing, LLC", FEIN 12-3456789, NAICS 332710, blank city/state, `commercial_business_accounts.notes`="Sample commercial account; demo data only."). It pollutes the real commercial book and any "count of commercial accounts" metric.
- **Change:** Decide with owner: **(a) soft-delete** (`accounts.deleted_at=now()` — note `prevent_hard_delete_accounts` blocks hard delete, and CASCADE would remove its `commercial_business_accounts` row only on hard delete, which is blocked, so prefer soft-delete and also soft-handle the child), or **(b) quarantine** by moving it out of the agency workspace / flagging it demo so reports exclude it. **Recommendation: soft-delete** both the account and treat its `commercial_business_accounts` row as demo (leave it, since CASCADE only triggers on hard delete which is prevented). Do NOT let it count as a genuine reclassification.
- **Type:** DML (soft-delete) — reversible.
- **Depends on:** Nothing (independent); should land before BIZ-6 acceptance so "commercial count" is clean.
- **Blocks:** Accurate commercial-book metrics.
- **Reversibility:** Fully reversible (`deleted_at=NULL`).
- **Acceptance:** Blue Oak no longer appears in the active commercial book; genuine reclassified accounts are the only `commercial_business` rows in the active book; metric "real commercial accounts" reflects only reclassified businesses.
- **Priority:** P1, rank 9.

---

## 3. Execution sequence (single ordered list for the build agent)

1. **(Cross-domain) P0-1** stamp 194 null-workspace accounts — *prerequisite, Domain D.*
2. **(Cross-domain) HYG-** LOB normalization (`line_category`) — *preferred prerequisite, Domain E.*
3. **(Cross-domain) DUP-** dedup Sorensen & Smith (8→1) + business-name clusters — *prerequisite for those rows, Domain A.*
4. **BIZ-0** commercial-line predicate/contract.
5. **BIZ-1** review workbook (106 rows).
6. **BIZ-5** codify FP exclusions (co-req).
7. **BIZ-2** Tier-1 auto flips (~21 after exclusions), branch→prod, logged/reversible.
8. **BIZ-3** Tier-2/Tier-3 review flips.
9. **BIZ-4** populate `commercial_business_accounts` + add `business_type_id` FK + map suffixes.
10. **BIZ-7 (interim)** owner↔entity links in notes/staging (Horace Witt etc.).
11. **BIZ-8** soft-delete Blue Oak demo.
12. **BIZ-6** standing DQ view + enforcement trigger on `policies` (after the 52 are resolved).
13. **BIZ-7 (final)** set `primary_contact_id` — *deferred, gated on Domain D party model.*

**Safety model:** All flips run on a branch first, snapshot pre-images (or rely on verified `audit_accounts`), then prod with owner sign-off. Reclassification sets only `type`; `sync_account_types` maintains `account_type`. Enforcement trigger ships last, after the existing backlog is cleared, so it never fires retroactively en masse.
