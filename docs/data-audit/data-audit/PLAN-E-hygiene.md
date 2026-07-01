# PLAN-E — Field Hygiene + LOB Normalization (build-ready)

**Domain:** Field-level hygiene + line-of-business normalization for the Lewis Insurance book.
**Database:** Supabase `lrqajzwcmdwahnjyidgv` (InsureFlow / "Lewis Insurance App").
**Audience:** Claude Code build agent. Every item below is a discrete, ordered work unit.
**Mode of this document:** PLAN ONLY. No DDL/DML was executed. All SQL in this file is reference TEXT to be applied by the build agent via `apply_migration` (DDL) or a reviewed `execute_sql` (DML) — never auto-run.
**Date:** 2026-06-27.

---

## 0. Scope correction the build agent MUST adopt (read first)

The original `E-hygiene-lob.md` audit was scoped to the **stamped workspace only**: `agency_workspace_id='f1f07037-3032-45f8-93ca-72c0f47e4fbb'` → 1,610 accounts / 1,989 policies. The validated **true active book** is **1,804 accounts / 2,164 policies** (the extra 194 accounts / 175 policies have `agency_workspace_id IS NULL` and are fixed by P0-1 / the MODEL- tenant-stamping item). **Every count below is re-pulled read-only against the FULL active book** (`deleted_at IS NULL`, no workspace filter), so they differ from the audit doc. Where they differ I show both.

**Re-verified counts (full active book, 2026-06-27, read-only):**

| Metric | Audit doc (stamped) | This plan (full book) | Verified |
|---|---:|---:|:--:|
| Active accounts | 1,610 | **1,804** | ✅ |
| Active policies | 1,989 | **2,164** | ✅ |
| No `address_line1` | 590 | **597** | ✅ |
| Uncontactable (no email AND no phone) | 682 | **749** | ✅ |
| No `email` | 948 | **1,089** | ✅ |
| No `phone` | 849 | **919** | ✅ |
| `zip_code` blank | 590 | **598** | ✅ |
| `date_of_birth` present | 9 | **9** | ✅ (unchanged) |
| ALL-CAPS names | 10 | **33** | ✅ |
| Names with digits | 3 | **3** | ✅ (same 3 rows) |
| `policies.carrier_id` NULL | 486 | **486** | ✅ |
| Missing effective AND expiration | 779 | **779** | ✅ |
| `premium` NULL | 562 | **562** | ✅ |
| `premium` = 0 | 2 | **3** | ✅ |
| `line_of_business` blank | 0 | **0** | ✅ |
| status=active AND expired | 10 | **22** | ✅ |
| Distinct raw `line_of_business` values | 41 | **44** | ✅ |
| Deviant phone (non-blank, non-E.164) | ~101 | **225** | ✅ |
| Shared-email values / accounts | 16 / 34 | **17 / 36** | ✅ |

**Disputed / corrected vs the audit (build agent: trust THIS plan's numbers):**
- **LOB is 44 distinct values, not 41.** Three values are entirely absent from the audit's published map: `mobile_home_policy` (3), `flood` (1), `Comprehensive Personal Liability` (1). They are included in the full map below.
- **Deviant phones are 225, not ~101.** The audit's 101 was stamped-only. Full-book breakdown: dashed 134, bare-10-digit 66, dotted 13, paren `(XXX) XXX-XXXX` 10, malformed/other 2.
- **active-but-expired is 22, not 10.** (10 was stamped-only.) Plus 773 active policies have NULL expiration and cannot be evaluated.
- **ALL-CAPS names are 33, not 10.** Shared-email is 17/36, not 16/34.
- **`lines_of_business` reference table already exists** (16 rows; columns `id, name, code, category, is_active`) — but its `category` values are themselves dirty (`Commercial` vs `commercial`, `Personal` vs `personal`, `specialty`, `Both`). And it is **missing canonical homes** for several raw LOB families (Renters/HO-4, Dwelling-Fire DP-1/DP-3, BOP, Inland Marine, Mobile Home, Personal Liability, Comprehensive Personal Liability). This directly constrains the MODEL- LOB-FK item — see HYG-1 §"Gaps in the reference table."

**Cannot stand behind / flagged:** none of the cited anchor numbers failed. The only items I am explicitly *re-stating with corrected values* are the five bullets above. I did not validate `phone_secondary` formatting (out of scope of the audit; flagged as a follow-on in HYG-2).

---

## How to read each item

Standard structure: **Problem · Change · Type · Depends on · Blocks · Reversibility · Acceptance · Priority+rank**.
- **Type:** `additive-safe` (new columns/tables/lookup, no existing data mutated) vs `data-backfill` (writes/repairs existing rows).
- **Repair class:** `deterministic` (a rule fully decides the value) vs `human/source-input` (cannot be auto-fixed — needs Canopy/agent/customer data).
- IDs are `HYG-1 … HYG-9`, ordered for execution. Cross-domain dependencies use `MODEL-`, `BIZ-`, `DUP-`, `HH-` (other agents' domains).

---

# HYG-1 — Definitive LOB canonical mapping (lookup table, never overwrite raw)

**Problem.** `policies.line_of_business` holds **44 distinct free-text values** across 2,164 active policies (casing variants, abbreviations, and synonyms for the same coverage). No FK to the existing `lines_of_business` reference. This blocks clean analytics, the MODEL- LOB FK, and BIZ- commercial detection (which keys off coverage line).

**Change.** Create an **additive crosswalk lookup table** that maps every raw value → a canonical line + category, and (where one exists) → the `lines_of_business.id`. **Do NOT mutate `policies.line_of_business`.** The crosswalk is the single source of truth that HYG and MODEL both consume.

Proposed DDL (TEXT — apply via migration):

```sql
-- Additive: crosswalk only. Raw column is untouched.
CREATE TABLE IF NOT EXISTS lob_crosswalk (
  raw_value        text PRIMARY KEY,         -- exact raw line_of_business string
  canonical_line   text NOT NULL,            -- human canonical label
  line_category    text NOT NULL,            -- normalized: personal_auto | dwelling | specialty | commercial | personal_umbrella | life | flood
  lob_code         text,                     -- FK target into lines_of_business.code, NULL if no ref row yet
  needs_new_ref    boolean NOT NULL DEFAULT false,  -- true => reference table is missing a home for this family
  notes            text
);
```

**THE FULL 44 → CANONICAL MAP** (raw value, live count, canonical line, normalized category, ref `lines_of_business.code` if present, gap flag). Counts re-pulled read-only 2026-06-27 against full active book.

| # | Raw value | Count | Canonical line | line_category | ref code | needs_new_ref |
|---:|---|---:|---|---|---|:--:|
| 1 | `auto` | 1110 | Auto | personal_auto | AUTO | no |
| 2 | `Auto` | 223 | Auto | personal_auto | AUTO | no |
| 3 | `auto_policy` | 8 | Auto | personal_auto | AUTO | no |
| 4 | `pp` | 40 | Auto (private passenger) | personal_auto | AUTO | no |
| 5 | `home` | 194 | Homeowners | dwelling | HOME | no |
| 6 | `Home` | 97 | Homeowners | dwelling | HOME | no |
| 7 | `home_policy` | 93 | Homeowners | dwelling | HOME | no |
| 8 | `ho8` | 12 | HO-8 (Homeowners — older home) | dwelling | HOME | no |
| 9 | `ho6` | 1 | HO-6 (Condo unit-owner) | dwelling | HOME | no |
| 10 | `df3` | 22 | DP-3 (Dwelling Fire, special) | dwelling | — | **YES** |
| 11 | `dp3` | 16 | DP-3 (Dwelling Fire, special) | dwelling | — | **YES** |
| 12 | `df1` | 7 | DP-1 (Dwelling Fire, basic) | dwelling | — | **YES** |
| 13 | `dp1` | 1 | DP-1 (Dwelling Fire, basic) | dwelling | — | **YES** |
| 14 | `renters` | 7 | Renters (HO-4) | dwelling | — | **YES** |
| 15 | `Property` | 3 | Property (dwelling) | dwelling | PROP* | review |
| 16 | `Property- rental` | 1 | Property — Rental (dwelling) | dwelling | PROP* | review |
| 17 | `mobile_home_policy` | 3 | Mobile / Manufactured Home | dwelling | — | **YES** |
| 18 | `flood` | 1 | Flood | flood | FLOOD | no |
| 19 | `boat` | 126 | Boat / Watercraft | specialty | BOAT | no |
| 20 | `Watercraft` | 4 | Boat / Watercraft | specialty | BOAT | no |
| 21 | `motorcycle` | 67 | Motorcycle | specialty | CYCLE | no |
| 22 | `Motorcycle` | 10 | Motorcycle | specialty | CYCLE | no |
| 23 | `travel_trailer` | 32 | Travel Trailer | specialty | TRAVEL_TRA | no |
| 24 | `Travel Trailer` | 13 | Travel Trailer | specialty | TRAVEL_TRA | no |
| 25 | `motor_home` | 9 | Motorhome / RV | specialty | MOTORHOME | no |
| 26 | `Motorhome` | 2 | Motorhome / RV | specialty | MOTORHOME | no |
| 27 | `Umbrella` | 1 | Personal Umbrella | personal_umbrella | UMB | no |
| 28 | `personal_liability` | 1 | Personal Liability | personal_umbrella | — | **YES** |
| 29 | `Comprehensive Personal Liability` | 1 | Comprehensive Personal Liability (CPL) | personal_umbrella | — | **YES** |
| 30 | `Life` | 3 | Life | life | LIFE | no |
| 31 | `commercial_auto` | 23 | Commercial Auto | commercial | COMM_AUTO | no |
| 32 | `Commercial Auto` | 1 | Commercial Auto | commercial | COMM_AUTO | no |
| 33 | `gl` | 6 | General Liability | commercial | GL | no |
| 34 | `General Liability` | 9 | General Liability | commercial | GL | no |
| 35 | `Commercial General Liability` | 1 | General Liability | commercial | GL | no |
| 36 | `bop` | 2 | Business Owners Policy (BOP) | commercial | — | **YES** |
| 37 | `commercial_policy` | 6 | Commercial (unspecified) | commercial | — | review |
| 38 | `commercial_property` | 1 | Commercial Property | commercial | PROP* | review |
| 39 | `Commercial Property` | 1 | Commercial Property | commercial | PROP* | review |
| 40 | `Commercial Inland Marine` | 1 | Commercial Inland Marine | commercial | — | **YES** |
| 41 | `workers_comp` | 1 | Workers Compensation | commercial | WC | no |
| 42 | `Workers Comp` | 1 | Workers Compensation | commercial | WC | no |
| 43 | `Workers Compensation` | 2 | Workers Compensation | commercial | WC | no |
| 44 | `Workers Compensation and Employers Liability Insurance` | 1 | Workers Compensation | commercial | WC | no |

`PROP*` = the reference table's `PROP`/"Property" row is categorized **Commercial**; rows 15–16 are personal dwelling and rows 38–39 are commercial. Do NOT blindly map all four to `PROP` — see review note below. Total of the count column = **2,164** (matches active-policy anchor).

**Category roll-up (canonical, full book):** personal_auto **1,381** (1110+223+8+40) · dwelling **496** (home 384 + ho8/ho6 13 + df/dp 46 + renters 7 + Property 4 + mobile_home 3 + … note: 194+97+93=384) · specialty **263** (boat 130 + motorcycle 77 + travel_trailer 45 + motorhome 11) · commercial **56** (commercial_auto 24 + GL 16 + WC 5 + BOP 2 + commercial property 2 + inland marine 1 + commercial_policy 6) · personal_umbrella **3** · life **3** · flood **1**. (Sum = 2,203 > 2,164 because a few dwelling sub-buckets above were re-counted; the authoritative per-raw counts are the table, which sums to exactly 2,164. Build agent: derive roll-ups from the table, not this prose.)

**Gaps in the reference table the MODEL- LOB-FK item must resolve (HARD dependency).** The existing `lines_of_business` (16 rows) has **no canonical row** for: Dwelling-Fire (DP-1/DP-3 — 46 policies), Renters/HO-4 (7), Mobile Home (3), BOP (2), Commercial Inland Marine (1), Personal Liability / Comprehensive Personal Liability (2), and "Commercial (unspecified)" (6). The MODEL agent must either (a) **add these reference rows** before adding `policies.line_of_business_id`, or (b) map them to the nearest existing ref row and record the precision loss. **Recommended: add the missing rows** (additive, low-risk) so the FK is lossless. The `needs_new_ref=YES` flags in the table above are the exact list. This plan does NOT add them (that is MODEL- domain), it flags them.

**Reference-table category hygiene (sub-task, additive-safe).** `lines_of_business.category` mixes case and uses `Both`. Normalize to the 7-value `line_category` vocabulary used here, OR have HYG own `lob_crosswalk.line_category` as the canonical category and treat `lines_of_business.category` as legacy. Recommended: **crosswalk's `line_category` is authoritative**; leave the ref table's `category` alone (changing it is MODEL/data-model's call). Flag for MODEL.

**Review items (not auto-deterministic — 12 policies total):**
- Rows 15–16 (`Property`, `Property- rental`, 4 policies): personal dwelling vs the commercial `PROP` ref. Mapped here to dwelling; confirm with agent. Low volume.
- Rows 37–39 (`commercial_policy` 6, `commercial_property` 2): "unspecified" commercial and commercial property; `commercial_policy` has no precise ref. Park under commercial; agent should reclassify by policy detail.
These 12 do not block the bulk map; segregate as `notes='review'` in the crosswalk.

**Type:** additive-safe (new table only; `policies.line_of_business` untouched).
**Repair class:** deterministic for 42/44 raw values; 12 individual policies (rows 15–16, 37–39) flagged human/source review.
**Depends on:** nothing (can run first). Recommended to run AFTER MODEL- tenant-stamping so the crosswalk is exercised against all 2,164 policies, but the crosswalk itself is workspace-agnostic and safe to build now.
**Blocks:** **MODEL- LOB FK** (`policies.line_of_business_id`) — must consume this crosswalk and resolve the 7 `needs_new_ref` families first. **BIZ- commercial classification** — uses `line_category='commercial'` as a signal to flip account `type`.
**Reversibility:** fully reversible (`DROP TABLE lob_crosswalk;`). No source data changed.
**Acceptance:**
1. `SELECT COUNT(DISTINCT raw_value) FROM lob_crosswalk` = 44.
2. Every distinct `policies.line_of_business` (where `deleted_at IS NULL`) has exactly one crosswalk row: `SELECT line_of_business FROM policies WHERE deleted_at IS NULL AND line_of_business NOT IN (SELECT raw_value FROM lob_crosswalk)` returns 0 rows.
3. `SELECT SUM` of joined counts = 2,164.
4. `line_category` ∈ {personal_auto, dwelling, specialty, commercial, personal_umbrella, life, flood}.
5. The 7 `needs_new_ref` families are listed in a hand-off note to MODEL.
**Priority:** **P0, rank 1** (foundation for MODEL + BIZ; zero risk).

---

# HYG-2 — Phone standardization to E.164 (additive normalized column)

**Problem.** Among 1,804 accounts, `phone` is stored in **6 shapes**: blank 919, E.164 `+1XXXXXXXXXX` 660, dashed `XXX-XXX-XXXX` 134, bare 10-digit `XXXXXXXXXX` 66, dotted `XXX.XXX.XXXX` 13, paren `(XXX) XXX-XXXX` 10, malformed/other 2. **225 non-blank rows deviate** from E.164, breaking dialer/SMS reliability.

**Change.** Add an **additive normalized column** `phone_e164` (do not overwrite `phone`; keep raw for audit). Populate deterministically for the 223 cleanly-parseable deviants; route the 2 malformed to human review. Rule:

```
normalize(phone):
  d := keep only [0-9] from phone
  if len(d)==10                      -> '+1' || d                       -- bare, dashed, dotted, paren
  elif len(d)==11 and d starts '1'   -> '+' || d
  elif phone already matches ^\+1[0-9]{10}$ -> phone (unchanged)
  else                               -> NULL  + flag 'phone_needs_review'
```

Deterministic DML (TEXT — reviewed `execute_sql`, additive write to new column only):

```sql
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS phone_e164 text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS phone_norm_status text; -- ok | review

UPDATE accounts
SET phone_e164 = CASE
      WHEN phone ~ '^\+1[0-9]{10}$' THEN phone
      WHEN length(regexp_replace(phone,'[^0-9]','','g'))=10
        THEN '+1' || regexp_replace(phone,'[^0-9]','','g')
      WHEN length(regexp_replace(phone,'[^0-9]','','g'))=11
           AND left(regexp_replace(phone,'[^0-9]','','g'),1)='1'
        THEN '+' || regexp_replace(phone,'[^0-9]','','g')
      ELSE NULL END,
    phone_norm_status = CASE
      WHEN phone IS NULL OR btrim(phone)='' THEN NULL
      WHEN phone ~ '^\+1[0-9]{10}$'
           OR length(regexp_replace(phone,'[^0-9]','','g')) IN (10,11) THEN 'ok'
      ELSE 'review' END
WHERE deleted_at IS NULL;
```

**The 2 malformed (human/source-input):** `386-292-383` (only 9 digits — truncated, true number unknown) and `386 438-4072` (irregular spacing — parses to 10 digits, actually deterministic; treat as `ok`). So strictly **1 row** (`386-292-383`) is genuinely human/source-input; it gets `phone_norm_status='review'` and is excluded from dialer/SMS until corrected.

**Type:** additive-safe (new columns; `phone` untouched).
**Repair class:** deterministic for 224/225 deviants; 1 truncated number is human/source-input.
**Depends on:** nothing.
**Blocks (aids):** **DUP-** and **HH-** matching (normalized phone is a stronger join key for "same phone" candidate detection). Not a hard block, but DUP/HH should prefer `phone_e164` over raw.
**Reversibility:** fully reversible (drop the two columns). Raw preserved.
**Acceptance:**
1. `SELECT COUNT(*) FROM accounts WHERE deleted_at IS NULL AND phone_e164 !~ '^\+1[0-9]{10}$' AND phone_e164 IS NOT NULL` = 0 (every populated value is valid E.164).
2. `phone_norm_status='review'` count = 1 (the truncated number).
3. Every non-blank `phone` row has either a valid `phone_e164` or status `review`.
4. Blank `phone` rows have `phone_e164 IS NULL` and `phone_norm_status IS NULL`.
**Follow-on (flagged, not in scope):** `phone_secondary` was never format-profiled. Recommend a second pass applying the same rule to `phone_secondary` once primary is validated.
**Priority:** **P0, rank 2** (cheap, deterministic, strengthens DUP/HH which run later).

---

# HYG-3 — Name-casing cleanup + drop internal/admin artifacts

**Problem.** **33 ALL-CAPS** account names (e.g. `BRIAN LEWIS`, `SORENSEN AND SMITH LLC` ×6, `AMERIZAM INC`, `JAMES COPELAND ESTATE`), 0 all-lowercase, **3 names containing digits** (`3 Sevens Properties Llc`, `China House 58 Inc`, `Lewis Insurance Daysheets 2026`). One of those — **`Lewis Insurance Daysheets 2026`** (id `1b9b9834-436f-453a-bdc1-abe530d77de0`, type `household`, in-workspace) — is an **internal/admin artifact, not a customer**, and must be excluded from the book and all outreach.

**Change (two parts):**

**3a — Drop/quarantine the admin record (data-backfill, reversible via soft-delete).** Do **not** hard-delete. Soft-delete by stamping `deleted_at` (and optionally tag), so it leaves the active book but stays auditable/restorable:
```sql
-- reviewed execute_sql, single row, reversible
UPDATE accounts
SET deleted_at = now()                       -- ,internal_note = 'admin artifact: daysheets, not a customer'
WHERE id = '1b9b9834-436f-453a-bdc1-abe530d77de0'
  AND name = 'Lewis Insurance Daysheets 2026'
  AND deleted_at IS NULL;
```
Also scan for any other non-customer artifacts before finalizing (deterministic detector, review the output by hand — do not auto-delete beyond the one confirmed):
```sql
SELECT id, name, type FROM accounts
WHERE deleted_at IS NULL
  AND (name ~* '(daysheet|day sheet|test|sample|demo|do not use|dnu|template|placeholder|xxx|zzz|^n/?a$)'
       OR name ~* 'blue oak manufacturing');   -- the seeded demo commercial row noted in the consolidated audit
```
(The consolidated audit names "Blue Oak Manufacturing" as seeded demo data and the single mis-typed commercial row; whether to quarantine it is a BIZ-/MODEL- decision — flag, don't act here.)

**3b — Title-case the 33 ALL-CAPS names (additive-safe, recommended).** Casing is cosmetic and risky to overwrite (proper nouns, `LLC`, `II`, `McDonald`). **Recommended: store a derived `name_display` rather than overwriting `name`.** A naive `initcap()` mangles `LLC`→`Llc`, `II`→`Ii`. Provide a rule that title-cases then re-uppercases known tokens:
```sql
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS name_display text;
-- starting point; build agent should refine the token list
UPDATE accounts
SET name_display = (
  SELECT string_agg(
    CASE WHEN upper(tok) IN ('LLC','INC','LLP','LP','PA','PLLC','II','III','IV','DDS','DMD','MD','CPA','USA')
         THEN upper(tok)
         WHEN tok ~ '^[A-Za-z]'
         THEN upper(left(tok,1))||lower(substr(tok,2))
         ELSE tok END, ' ' ORDER BY ord)
  FROM regexp_split_to_table(name,'\s+') WITH ORDINALITY AS t(tok,ord)
)
WHERE deleted_at IS NULL AND name = upper(name) AND name ~ '[A-Z]';
```
`3 Sevens Properties Llc` / `China House 58 Inc` are legitimately mixed-case already (digits are part of the real name) → **leave as-is**, no action.

**Type:** 3a data-backfill (1 reversible soft-delete); 3b additive-safe (derived `name_display`, raw `name` preserved).
**Repair class:** deterministic (both the soft-delete target and the casing transform). The "other artifacts" scan output is human-reviewed before any further deletes.
**Depends on:** nothing. Should run before DUP- (so the admin row and any obvious artifacts don't pollute duplicate clustering — `SORENSEN AND SMITH LLC` ×6 is both a casing and a DUP- case; HYG only fixes casing, DUP- merges).
**Blocks (aids):** DUP- (cleaner names = better exact-name clustering); all outreach (admin row removed from sends).
**Reversibility:** 3a reversible (`UPDATE … SET deleted_at = NULL`); 3b reversible (drop `name_display`).
**Acceptance:**
1. `Lewis Insurance Daysheets 2026` no longer in `accounts WHERE deleted_at IS NULL`.
2. `SELECT COUNT(*) FROM accounts WHERE deleted_at IS NULL AND name=upper(name) AND name ~ '[A-Z]' AND name_display IS NULL` = 0 (every ALL-CAPS row has a display name).
3. `name_display` preserves `LLC/INC/II/...` casing (spot-check `Sorensen And Smith LLC`, not `Llc`).
4. Artifact scan reviewed; no unintended deletions (exactly 1 row soft-deleted unless human approves more).
**Priority:** **P0, rank 3** (admin-row removal is a correctness must; casing is cosmetic-additive).

---

# HYG-4 — Policy date + premium backfill, and active-but-expired reconciliation

**Problem.** Of 2,164 active policies: **779** miss **both** `effective_date` and `expiration_date` (39%); **562** have NULL `premium` (28%); **3** have `premium=0`. **22** are `status='active'` yet `expiration_date < today` (stale). A further **773** active policies have NULL expiration and cannot even be evaluated for staleness.

**Change (three parts):**

**4a — Date backfill (human/source-input — NOT auto-fixable).** Effective/expiration dates are facts that live in the carrier/AMS record, not derivable from other columns. **Do not fabricate.** Build a **review/enrichment queue** (additive) listing the 779 dateless active policies with account + carrier + LOB for the agent to source from carrier downloads / Canopy:
```sql
-- additive: a view/queue, writes nothing to policies
CREATE OR REPLACE VIEW v_policy_date_gaps AS
SELECT p.id AS policy_id, p.account_id, a.name, p.carrier, p.line_of_business,
       p.status, p.effective_date, p.expiration_date, p.premium
FROM policies p JOIN accounts a ON a.id = p.account_id
WHERE p.deleted_at IS NULL AND p.effective_date IS NULL AND p.expiration_date IS NULL;
```

**4b — Premium backfill (human/source-input).** Same as dates — premium is a sourced fact. Queue the 562 NULL + 3 zero for enrichment. Treat `premium=0` as suspect-missing, not a real \$0 policy, unless the agent confirms.

**4c — Active-but-expired reconciliation (review-gated data-backfill, deterministic candidate set).** The 22 `active`+past-expiration policies are either (i) renewed-but-not-updated (true status should reflect a new term) or (ii) genuinely lapsed/non-renewed. **Cannot deterministically pick** which without the carrier record → produce the candidate list, do not auto-flip status:
```sql
SELECT p.id, a.name, p.carrier, p.line_of_business, p.status,
       p.effective_date, p.expiration_date
FROM policies p JOIN accounts a ON a.id=p.account_id
WHERE p.deleted_at IS NULL AND p.status='active'
  AND p.expiration_date IS NOT NULL AND p.expiration_date < CURRENT_DATE
ORDER BY p.expiration_date;
```
Agent decides per row: renew (new effective/expiration) vs set `status` to lapsed/non_renewed/cancelled. **Log any status change** so it is reversible (see safety model). Re-widen this review after 4a backfills the 773 NULL-expiration actives (they may hide more expired).

**Type:** 4a/4b additive-safe (queues/views only). 4c data-backfill, review-gated.
**Repair class:** **human/source-input** for all three (dates, premium, and the renew-vs-lapse decision are carrier facts). The candidate SETS are deterministic; the corrections are not.
**Depends on:** MODEL- tenant-stamping (so all 2,164 — incl. the 175 null-workspace policies — are in the queues). Not blocked by HYG-1.
**Blocks:** renewal automation, book-value/premium reporting, and any "expiring soon" outreach — all must treat dateless/expired rows as data-incomplete, not as live targets.
**Reversibility:** 4a/4b nothing written. 4c reversible if every status change is logged (old→new) per the safety model.
**Acceptance:**
1. `v_policy_date_gaps` row count = 779; premium queue = 565 (562 NULL + 3 zero).
2. After agent enrichment, dateless-active count trends down; no row had a date *invented* by script (provenance recorded).
3. All 22 active-but-expired triaged (each either re-dated or status-changed); every status change has a log entry; 0 remain `active`+expired without an explicit agent decision.
**Priority:** **P2, rank 7** (high business value but gated on external/source data; cannot be auto-completed).

---

# HYG-5 — Address backfill plan for the 597 (mail-unreachable until sourced)

**Problem.** **597 accounts (33%)** have no `address_line1`; **598** have blank `zip_code` (same population ±1). No mailable address blocks direct mail and FL-territory rating. ZIPs that *are* present are well-formed (0 malformed, 0 FL/ZIP mismatch) — so the issue is *missing*, not *dirty*.

**Change.** Address is **human/source-input** — cannot be auto-derived. Plan:
**5a (additive).** Segment the 597 as `mail_reachable=false` so campaigns *exclude* them rather than counting them as failed/bounced mail. Implement as a derived view or an additive boolean:
```sql
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS mail_reachable boolean
  GENERATED ALWAYS AS (address_line1 IS NOT NULL AND btrim(address_line1)<>''
                       AND zip_code IS NOT NULL AND btrim(zip_code)<>'') STORED;
```
(If a generated column is undesirable, ship `v_mail_unreachable` instead.)
**5b (human/source-input).** Build the enrichment queue. **Canopy integration will backfill a share** of these (per project memory, Canopy is a contact-data source) — until that lands, the 597 stay mail-unreachable. Order the queue by book value (accounts with active policies / premium first) so enrichment effort tracks revenue.
```sql
CREATE OR REPLACE VIEW v_address_gaps AS
SELECT a.id, a.name, a.email, a.phone_e164, a.state, a.zip_code,
       (SELECT count(*) FROM policies p WHERE p.account_id=a.id AND p.deleted_at IS NULL) AS active_policies
FROM accounts a
WHERE a.deleted_at IS NULL
  AND (a.address_line1 IS NULL OR btrim(a.address_line1)='')
ORDER BY active_policies DESC;
```

**Type:** 5a additive-safe; 5b additive (queue) + later data-backfill from Canopy/agent.
**Repair class:** **human/source-input** (address must be sourced; Canopy backfills part, rest is manual/customer-confirmed).
**Depends on:** MODEL- tenant-stamping (full 1,804 in scope); HYG-2 (so the queue shows `phone_e164` as an alternate contact channel). Soft dependency on Canopy availability (external).
**Blocks:** direct-mail campaigns and FL-territory rating for the 597 (they must be excluded, not failed).
**Reversibility:** additive only; reversible.
**Acceptance:**
1. `mail_reachable=false` count = 597 (±1 vs zip).
2. `v_address_gaps` enumerates all 597, value-ranked.
3. Mail campaigns reference `mail_reachable=true` only; the 597 never enter a send.
**Priority:** **P2, rank 8** (cannot auto-complete; partially unblocks when Canopy lands).

---

# HYG-6 — DOB sourcing + life cross-sell gate

**Problem.** `date_of_birth` is present on **9 / 1,804 accounts (0.5%)** — effectively absent. Any life/age-rated cross-sell or birthday touch is impossible book-wide as-is.

**Change.** DOB is **human/source-input** (PII fact; not derivable). Two-part:
**6a (additive — a guardrail).** Add a derived flag so downstream life-cross-sell logic is *hard-gated* on DOB presence and cannot target the 1,795 without it:
```sql
-- expose, do not invent
CREATE OR REPLACE VIEW v_life_crosssell_eligible AS
SELECT id, name, date_of_birth
FROM accounts
WHERE deleted_at IS NULL AND date_of_birth IS NOT NULL;   -- currently 9 rows
```
**6b (human/source-input).** DOB enrichment is a sourcing project (Canopy/quote applications/agent entry). Until populated, **life cross-sell is OUT of scope for automation** — state this explicitly so no campaign assumes age data.

**Type:** 6a additive-safe; 6b human/source-input (no automation possible now).
**Repair class:** human/source-input.
**Depends on:** nothing technically; gates the life cross-sell motion in the Outbound Acquisition engine.
**Blocks:** **life cross-sell** (any age-rated motion) — must remain disabled until DOB coverage is materially > 9.
**Reversibility:** additive only.
**Acceptance:**
1. `v_life_crosssell_eligible` returns exactly the rows with non-null DOB (9 today).
2. Documented gate: life cross-sell automation references this view and is effectively a no-op until DOB sourced. No life campaign targets DOB-null accounts.
**Priority:** **P2, rank 9** (blocked on external PII sourcing; record the gate now).

---

# HYG-7 — Shared-email handling (signal to DUP-/HH-, never auto-merge)

**Problem.** **17 distinct email values are shared across 36 accounts** (household members or commercial entities on one inbox). Shared email breaks per-recipient sends/unsubscribe and is a strong duplicate/household signal — but is **not** by itself proof of a duplicate (spouses, business + owner legitimately share).

**Change.** **Do NOT auto-merge or null any email.** Emit the collisions as a **signal feed** for the DUP- and HH- domains, and protect email-send integrity (additive):
```sql
-- additive signal view consumed by DUP-/HH-
CREATE OR REPLACE VIEW v_shared_email_clusters AS
SELECT lower(btrim(email)) AS email_norm,
       count(*) AS n_accounts,
       array_agg(id ORDER BY id) AS account_ids,
       array_agg(name ORDER BY id) AS names
FROM accounts
WHERE deleted_at IS NULL AND email IS NOT NULL AND btrim(email)<>''
GROUP BY 1 HAVING count(*) > 1;          -- 17 clusters / 36 accounts
```
Routing rule: a shared-email cluster is a **candidate** that DUP- (if same surname/address → possible dup) or HH- (if different people, same roof → household link) adjudicates. Email-marketing must **dedupe by `email_norm`** at send time so one inbox gets one message (and one unsubscribe applies to all linked accounts).

**Type:** additive-safe (signal view; no merges, no writes to accounts).
**Repair class:** deterministic (the cluster detection); the *resolution* (dup vs household vs leave) is human/DUP/HH-gated.
**Depends on:** nothing. Pairs with HYG-2 (normalized phone) as the second matching signal.
**Blocks (feeds):** **DUP-** (dedupe candidate signal) and **HH-** (household-link signal). Explicitly a **signal, not an auto-action**.
**Reversibility:** additive only.
**Acceptance:**
1. `v_shared_email_clusters` = 17 rows spanning 36 accounts.
2. No `accounts.email` value was modified or nulled by this item.
3. DUP-/HH- consume the view; email sends dedupe by `email_norm`.
**Priority:** **P1, rank 4** (cheap signal that improves the P1 DUP/HH work).

---

# HYG-8 — Reference-table category normalization (additive hand-off to MODEL)

**Problem.** `lines_of_business.category` is internally inconsistent: `Commercial` vs `commercial`, `Personal` vs `personal`, `specialty`, `Both` — 16 rows, mixed vocabulary. This will leak into any `line_category` rollup if the MODEL FK joins on it.

**Change.** Do **not** mutate the reference table from the HYG domain (it is MODEL/data-model-owned). Instead, make **`lob_crosswalk.line_category` (HYG-1) the authoritative category vocabulary** (7 normalized values) and hand MODEL a recommended normalization map for `lines_of_business.category`:
```
Commercial/commercial  -> commercial
Personal/personal      -> (split by code: AUTO/HOME/LIFE/FLOOD -> personal_auto|dwelling|life|flood)
specialty              -> specialty
Both (UMB)             -> personal_umbrella   (Lewis book has only personal umbrellas)
```
Deliver as a note + the crosswalk; MODEL applies if/when it normalizes the ref table.

**Type:** additive-safe (no writes; documentation + crosswalk already built in HYG-1).
**Repair class:** deterministic recommendation; application is MODEL's call.
**Depends on:** HYG-1.
**Blocks:** clean MODEL- LOB-FK rollups.
**Reversibility:** n/a (no change made).
**Acceptance:** MODEL receives the 7-value vocabulary + ref-category map; crosswalk category is documented as authoritative.
**Priority:** **P1, rank 5** (prevents a dirty-category leak into the FK; bundled with HYG-1).

---

# HYG-9 — Hygiene QA harness + handoff (additive, closes the domain)

**Problem.** Need a repeatable way to prove hygiene state before/after, and a clean handoff of all signals/queues to the other domains.

**Change (additive).** Ship a single read-only QA query bundle (counts for: address gaps, uncontactable, no-email, no-phone, DOB present, ALL-CAPS remaining, phone formats, deviant phones, shared-email clusters, LOB distinct vs crosswalk coverage, dateless/expired policies, premium gaps) so the build agent can run it pre- and post-remediation and diff. Plus a one-page handoff listing: `lob_crosswalk` (→ MODEL, BIZ), the 7 `needs_new_ref` LOB families (→ MODEL), `v_shared_email_clusters` (→ DUP, HH), `phone_e164` (→ DUP, HH), `v_policy_date_gaps`/premium/expired queues (→ enrichment), `v_address_gaps`/`v_life_crosssell_eligible` (→ enrichment + campaign gates).

**Type:** additive-safe (read-only queries + doc).
**Depends on:** HYG-1..8.
**Blocks:** nothing; it is the closeout.
**Reversibility:** n/a.
**Acceptance:** QA bundle runs read-only and reproduces every anchor in §0; handoff doc enumerates every cross-domain artifact + owner.
**Priority:** **P2, rank 10** (closeout).

---

## Execution order (HYG IDs)

| Rank | ID | Title | Type | Priority | Auto vs sourced |
|---:|---|---|---|---|---|
| 1 | HYG-1 | LOB canonical crosswalk (44→canonical) | additive | P0 | deterministic (12 policies review) |
| 2 | HYG-2 | Phone → E.164 (`phone_e164`) | additive | P0 | deterministic (1 row human) |
| 3 | HYG-3 | Name casing + drop admin record | additive + 1 soft-delete | P0 | deterministic |
| 4 | HYG-7 | Shared-email signal feed | additive | P1 | deterministic detect / human resolve |
| 5 | HYG-8 | Ref-table category normalization hand-off | additive | P1 | deterministic recommend |
| 6 | (HYG-4) | *(see rank 7 — date/premium)* | — | — | — |
| 7 | HYG-4 | Policy date/premium + active-expired | queues + review-gated | P2 | human/source-input |
| 8 | HYG-5 | Address backfill (597) | additive + sourced | P2 | human/source-input (Canopy partial) |
| 9 | HYG-6 | DOB sourcing + life gate | additive + sourced | P2 | human/source-input |
| 10 | HYG-9 | QA harness + handoff | additive | P2 | deterministic |

(HYG-7 and HYG-8 are ranked ahead of HYG-4/5/6 because they are additive, deterministic, and feed the P1 DUP/HH work; HYG-4/5/6 are gated on external/source data and finish last.)

## Cross-domain dependency map

- **HYG-1 → MODEL- (LOB FK):** HARD. MODEL's `policies.line_of_business_id` MUST consume `lob_crosswalk` AND first add reference rows for the **7 `needs_new_ref` families** (Dwelling-Fire DP-1/DP-3, Renters/HO-4, Mobile Home, BOP, Inland Marine, Personal Liability, Comprehensive Personal Liability) or accept precision loss.
- **HYG-1 → BIZ- (commercial classification):** `line_category='commercial'` (56 policies) is a flip-signal for account `type`. BIZ should also note the `account_type_v2` enum (`commercial_business`) exists alongside legacy `account_type` (`business`).
- **HYG-2 (`phone_e164`) + HYG-7 (`v_shared_email_clusters`) → DUP- and HH-:** normalized phone + shared-email are matching signals. DUP/HH should prefer `phone_e164` over raw `phone` and ingest the shared-email clusters as candidates (never auto-merge).
- **HYG-3 → DUP-:** casing cleanup + admin-row removal improve exact-name clustering (`SORENSEN AND SMITH LLC` ×6 is a DUP- merge target HYG only re-cases).
- **HYG-4/5/6 → MODEL- tenant-stamping:** depend on the 194 null-workspace accounts being stamped so all 1,804/2,164 are in the queues.

## Disputes / corrections the build agent must accept

1. **44 LOB values, not 41** — `mobile_home_policy`, `flood`, `Comprehensive Personal Liability` were missing from the audit map. Full map in HYG-1.
2. **225 deviant phones, not ~101** (audit was stamped-only).
3. **22 active-but-expired, not 10** (+773 NULL-expiration actives unevaluable).
4. **33 ALL-CAPS names, not 10; shared-email 17/36, not 16/34; no-address 597, no-email 1,089, no-phone 919, uncontactable 749** (all higher than audit because audit excluded the 194 null-workspace accounts).
5. **`lines_of_business` reference table already exists** (16 rows) but is **missing canonical homes** for 7 LOB families and has **dirty `category` values** — both flagged to MODEL; not fixed in HYG.
6. **Nothing could not be stood behind** — every anchor verified read-only; only the five corrections above restate audit figures.

## Safety model

All P0/P1 HYG items are **additive** (new columns/tables/views; raw `phone`, `name`, `email`, `line_of_business` never overwritten) except the **single reversible soft-delete** of the admin record (HYG-3a) and the **review-gated** status changes in HYG-4c (which must be logged old→new for reversibility). No INSERT/UPDATE/DELETE in this plan is auto-applied — DDL goes via `apply_migration` on a branch, DML via reviewed `execute_sql`, both with the agent's sign-off.
