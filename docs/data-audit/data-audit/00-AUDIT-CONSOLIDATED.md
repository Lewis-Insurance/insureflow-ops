# Lewis Insurance — Data Integrity Audit (Validated Consolidation)

**Database:** InsureFlow / "Lewis Insurance App" (Supabase `lrqajzwcmdwahnjyidgv`)
**Date:** 2026-06-27
**Method:** 5 parallel read-only audit agents (duplicates, households, business/personal, data-model, field hygiene) + validator spot-checks against the live DB. Nothing was modified.
**Detail files:** `A-duplicates.md`, `B-households.md`, `C-business-personal.md`, `D-model-integrity.md`, `E-hygiene-lob.md` (this folder).

---

## 0. Validator's reconciliation (read first)

The agents reported a few different numbers; all reconcile to **scope**, and one is a real finding:

| Item | Resolution (validated against DB) |
|---|---|
| **Active accounts** | **1,804**, not 1,610. **194 accounts have `agency_workspace_id = NULL`** (187 FL, 167 with active policies). My earlier work filtered to the stamped workspace and missed them. **This is a real tenant-stamping gap and must be fixed first.** |
| **Active policies** | **2,164** total = 1,989 (stamped) + 175 (on null-workspace accounts). |
| **carrier_id NULL** | **486** total = 311 (stamped) + 175 (null-workspace). |
| **type** | **1,803 household / 1 commercial** — the single commercial row is seeded demo data ("Blue Oak Manufacturing"). The production book has **zero correctly-typed commercial accounts.** |
| **duplicate_groups** | **362, all `status='pending'`**; `merge_history` empty → **no merge has ever run**; `duplicate_flags` empty. The 362 are raw candidates (some are households, some internal) — usable as input, not as decisions. |

**Net:** the true active book is ~**1,804 accounts / 2,164 policies**. Re-run Phase-0 and householding after the workspace stamp (P0-1) so the 167 hidden customers are included.

---

## 1. Duplicates (same person/entity, multiple account rows) — agent A

- **83 exact-name clusters / 176 accounts.** Tiers: **21 T1** (same name + identical address or phone, no conflict; ~17 clean enough to auto-merge after spot-check), **58 T2** (same name + same email/zip, complementary rows), **4 T3** (same name, different address = possible 2 properties/moved). **4 identical-policy pairs** (same carrier+line+effective_date).
- **Survivor rule (validated, sound):** keep the account with (1) most active policies → (2) most complete contact → (3) most recent `updated_at`; union non-null fields; re-parent active policies; log to `merge_history`.
- **Do NOT auto-merge:** Jr/Sr same address (Dewey Moore / Dewey Moore Jr), name-swaps (Thomas Howard / Howard Thomas), person↔their business, and shared-phone-only matches. These go to human review.
- **Worst offender:** `SORENSEN AND SMITH LLC` exists as ~6–9 near-identical rows (dedupe + reclassify together).

## 2. Households (different people, one roof) — agent B

- **55 multi-account households / 117 accounts.** **42 HIGH** (surname+house#+ZIP or same-surname exact address) are safe to auto-link; **44 of 55 are mixed-line** (e.g., one spouse home, the other auto/boat) = directly cross-sell-actionable. MEDIUM (diff-surname same address / shared email) and LOW (phone-only) → review.
- Floyd (boat+home) and Myers/Rhodes (cross-surname, shared email+phone) both validate.
- **Canonical key:** smallest member UUID as household id; display "Surname — house# ZIP". Link, never merge (spouses are distinct people).

## 3. Business vs Personal misclassification — agent C

- **~101 accounts flagged commercial, ~87 genuinely commercial businesses** currently mis-typed `household`. **24 Tier-1** (business-name token AND a commercial policy line) are safe to flip (e.g., Donald Roberts Masonry LLC, Cannon Cleaning Company LLC, Evergreen Baptist Church). Tier-2 (commercial line under a personal/brand name) and Tier-3 (entity-name only) → review.
- **Infrastructure exists but unused:** `commercial_business_accounts` (legal_name, fein, naics_code, employees, revenue) and `business_types` (8 defined: LLC, S-Corp, Corp, Partnership, Sole Prop, Non-Profit, Govt, Individual). Reclassification should populate these.
- **Person↔business rule:** keep separate, relate (don't merge) — e.g., D&H Tractor Works LLC (commercial) + Horace Witt (personal) at one phone.
- False positives screened: "Harry/Shelia **B-RANCH**", married "& " names — excluded.

## 4. Data-model integrity — agent D

| Issue | Size | Severity | Fix |
|---|---|---|---|
| **Tenant-stamping gap** | 194 active accounts workspace-NULL (175 policies) | High | Stamp to agency workspace (P0-1) |
| **Contact layer dead** | `contacts` 0 rows; 25+ tables FK to it; `accounts.contact_id` NULL on all | High | Pick ONE party model (accounts+`insured_*` **or** backfill contacts); blocks SMS/consent/portal/marketing stack |
| **Three household models** | `households` 0, `household_accounts` 1 (synthetic), `portal_household_members` 0; **no `accounts.household_id`** | Medium | Canonicalize on `households` + add `accounts.household_id`; deprecate the others |
| **Carrier link partial** | 486 active policies `carrier_id` NULL w/ carrier text | Medium | Backfill by name → `carriers`(16) |
| **LOB not normalized** | 41 distinct text values, no FK to `lines_of_business`(16) | Medium | Add `line_of_business_id` (+ canonical/category); map 41→canonical |
| **Dedup stalled** | 362 candidates, 0 rules, 0 flags, 0 merges | Medium | Drive from validated tiers; populate flags/merge_history |
| **`customers` cutover** | `customers` 0, `customers_unified` view dropped | Info | Drop 4 dead `customer_id` columns + table |

Clean where it counts: active policy→account FKs are 0 NULL / 0 missing / 0 pointing to deleted.

## 5. Field hygiene + LOB — agent E

- **Contactability:** 590 (36.6%) no street address; **682 (42.4%) uncontactable** (no email and no phone); 948 no email; 849 no phone. **DOB present on only 9 accounts (0.6%)** → life cross-sell needs DOB sourcing first.
- **Phones:** 5 formats (E.164 dominant); ~101 deviant → standardize to E.164.
- **Shared email:** 16 emails across 34 accounts (household/dup signal).
- **Policies:** 779 (39%) missing effective+expiration dates; 562 (28%) premium NULL; 10 marked active but expired; status mix active 1,708 / cancelled 179 / lost 97 / lapsed 4 / non_renewed 1.
- **LOB map (41→6 canonical):** Auto (auto/Auto/auto_policy/pp ~1,346) · Dwelling (home/Home/home_policy/ho8/ho6/df1/df3/dp1/dp3/renters/Property ~349) · Specialty (boat/Watercraft/motorcycle/travel_trailer/motor_home ~259) · Commercial (gl/General Liability/bop/commercial_auto/commercial_property/Inland Marine/workers_comp ×variants ~58) · Umbrella (Umbrella/personal_liability 2) · Life (2). Full mapping in `E-hygiene-lob.md`.

---

## 6. Prioritized remediation roadmap

**P0 — Safe, additive, do first (non-destructive; branch → prod):**
1. **Stamp the 194 null-workspace accounts** to the agency workspace (un-hides 167 customers). *Re-run Phase-0 + householding afterward.*
2. **Normalize LOB** — add `line_canonical` + `line_category` (or `line_of_business_id` FK), apply the 41→6 map. Never overwrite raw.
3. **Backfill `carrier_id`** (486) by carrier-name → `carriers`(16).

**P1 — Customer-correctness, review-gated:**
4. **Householding** — add `accounts.household_id`, canonicalize on `households`, auto-link the **42 HIGH** households, queue MEDIUM/LOW for review. (Link, don't merge.)
5. **Business reclassification** — re-type the **24 Tier-1** commercial accounts (then Tier-2/3 by review), populate `commercial_business_accounts` + `business_types`, relate owner personal lines.
6. **Deduplication** — merge the **21 T1** dup clusters (≈17 auto after spot-check + 4 review), union fields, re-parent policies, **log every merge to `merge_history` (reversible)**, seed `duplicate_flags`.

**P2 — Model + cleanup:**
7. **Resolve the party model** (accounts + `insured_*` vs backfill `contacts`) — unblocks SMS/consent/portal/marketing. Architectural decision required.
8. Drop dead `customer_id` columns + `customers` table; deprecate redundant household models; archive ~14k soft-deleted import rows.
9. Field enrichment: addresses (590), DOB (life), policy dates/premium gaps; reconcile 10 active-but-expired.

**Safety model:** P0 is additive (low risk). All P1 destructive/customer-facing steps go through a **review workbook → branch test → prod**, with `merge_history` logging so any merge is reversible. Nothing auto-applies without your sign-off.

---

## 7. Recommended canonical decisions (for your approval)

- **Customer entity = `accounts`** (the `customers` cutover is already done).
- **Household = `households`** + new `accounts.household_id`; deprecate `household_accounts` and `portal_household_members` for CRM grouping.
- **Party/contact detail = adopt `insured_*`** (account-centric) and re-point comms/consent FKs off the dead `contacts` table — *or* backfill one `contacts` row per account. **This is the one decision that needs you**; it gates the SMS/consent/portal stack.
- **Commercial = `commercial_business_accounts` + `business_types`** (both already modeled, just unused).
