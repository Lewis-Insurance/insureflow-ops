# Lewis Insurance (InsureFlow) — Master Data‑Cleanup Roadmap

**Status:** PLANNING ONLY — nothing in this roadmap has been executed. Build/apply is handed off to a separate Claude Code agent.
**Database:** Supabase `lrqajzwcmdwahnjyidgv` ("Lewis Insurance App"). Single tenant; workspace `f1f07037-3032-45f8-93ca-72c0f47e4fbb`.
**Date:** 2026-06-27
**Inputs:** audit `00-AUDIT-CONSOLIDATED.md` + `A–E.md`; build specs `PLAN-A-duplicates.md`, `PLAN-B-households.md`, `PLAN-C-business.md`, `PLAN-D-model.md`, `PLAN-E-hygiene.md` (this folder). Each item below (DUP‑/HH‑/BIZ‑/MODEL‑/HYG‑) is fully specified in its PLAN file.

---

## Validator sign‑off

I (orchestrator) independently re‑queried every load‑bearing number against the live DB. **All five agents' corrections to the original audit held up.** The original audit was scoped to the stamped 1,610‑account workspace; the true active book is **1,804 accounts / 2,164 policies**, and the agents correctly re‑scoped.

| Claim | Agent | Independently verified |
|---|---|---|
| Workspace‑null accounts = 194 (187 FL, 167 w/ policies, **7 edge‑cases to review**, not a blind 194) | D | ✅ 194 / 187 FL / 167 w‑policy / 6 non‑FL‑no‑policy + 1 VT‑w‑policy |
| Carrier backfill is **not** a clean 486 | D | ✅ 486 null = **335 name‑match + 151 unmatched**; **21 distinct carriers missing** from the 16‑row `carriers` table |
| LOB = **44** distinct raw (41 case‑folded) | D/E | ✅ 44 raw / 41 ci |
| Active‑but‑expired = **22** (not 10); 779 null‑expiration; 562 null‑premium | E | ✅ exact |
| **106 FK columns / 104 tables → `accounts.id` (56 CASCADE)** — merges must soft‑delete + re‑parent, never hard‑delete | A | ✅ exact (56 CASCADE / 18 SET NULL / 32 NO ACTION) |
| Party model: contacts stack is empty → adopt `insured_*`, drop `contacts` | D | ✅ contacts 0; sms/consent_ledger/twilio/tickets/portal_users/insured_* all 0; 5 communications + 5 call_sessions, 0 contact links |
| `lines_of_business` ref dirty categories; Sorensen = 8 rows | E/C | ✅ categories `Both/commercial/Commercial/personal/Personal/specialty`; Sorensen 8 |

**Push‑backs I enforced over the original audit (now baked into this roadmap):** book is 1,804 not 1,610; stamp **187** FL not 194; carrier backfill needs carrier inserts + alias map, not a flat 486 UPDATE; **all merges soft‑delete + dynamically re‑parent 106 FKs** (a hard DELETE would CASCADE‑destroy 56 child tables); LOB is 44 not 41; households **45 HIGH** not 42; business Tier‑1 nets **~21** auto not 24 (one `%TRUST%` false positive). One agent number I corrected: A's "Sorensen = 9 rows" → actually **8**.

I'd stake my name on the sequence below.

---

## Locked canonical numbers (use these, not the audit's stamped‑only figures)

- Active book: **1,804 accounts / 2,164 active policies** (single tenant).
- Tenant gap: **194** workspace‑null accounts → stamp **187 FL**, review **7**.
- Duplicates (full book): **92 clusters / 195 accounts** — T1 26 / T2 56 / T3 18; auto‑merge‑eligible ≈ **17–19** (T1 shared‑address) after dry‑run spot‑check.
- Households (full book): **59 households / 125 accounts** — **45 HIGH** (auto‑link) / 8 MEDIUM / 6 LOW.
- Business mis‑typed: **106 flagged** — Tier‑1 25 (~21 net auto) / Tier‑2 28 / Tier‑3 53; guardrail universe **52** household accounts holding a commercial line.
- Carrier: 486 null `carrier_id` = 335 match + 151 alias; **21 carriers missing** from `carriers` (Safe Harbor ≈78 the biggest).
- LOB: **44** raw values → 6 canonical (full crosswalk in PLAN‑E); ref table 16 rows, dirty categories, missing 7 canonical homes (DP‑1/DP‑3, renters/HO‑4, mobile home, BOP, inland marine, personal liability, CPL).
- Contactability: no‑address **597**, uncontactable **749**, no‑email 1,089, no‑phone 919, **DOB present 9**.
- Policies: 779 null expiration, 562 null premium, 22 active‑but‑expired.
- Dedup scaffolding: `duplicate_groups` 362 pending, `duplicate_flags` 0, `merge_history` 0 (**no merge has ever run**). `customers` cutover complete. 14,187 soft‑deleted import rows to archive.

---

## Execution sequence (dependency‑ordered waves)

Every wave is **branch‑first → verify → promote**. Additive/safe steps carry low risk; destructive (merges, reclass, drops) are review‑gated, logged, and reversible.

**Wave 0 — Foundation (P0, additive/safe).** Must precede all re‑scoped detection.
- `MODEL‑1` stamp the 187 FL workspace‑null accounts (route 7 edge cases to review). *Un‑hides 167 customers; gates everything.*
- `HYG‑1` build `lob_crosswalk` lookup (44→canonical/category); raw never overwritten.
- `HYG‑2` add `phone_e164` (additive); `HYG‑3` add `name_display` + soft‑delete the `Lewis Insurance Daysheets 2026` admin record.
- `MODEL‑2` insert the 21 missing carriers + build alias map, then backfill `carrier_id` (335 direct + 151 via alias).

**Wave 1 — Normalization schema (P0→P1, additive).**
- `MODEL‑3` add `policies.line_of_business_id` FK; fix `lines_of_business` dirty categories + add 7 missing canonical rows; apply crosswalk (needs `HYG‑1`).
- `HYG‑7` feed shared‑email/phone clusters to DUP/HH as **signals only** (no auto‑merge).

**Wave 2 — Deduplication (P1, review‑gated; soft‑delete + logged).** After `MODEL‑1`.
- `DUP‑1` build `merge_accounts()` tooling: **dynamic re‑parent of all 106 FK columns**, soft‑delete losers, full `merge_history` undo manifest, dry‑run default. `MODEL‑7` wire dedup rules/flags/merge_history.
- `DUP‑2` re‑run detection on the full 1,804 book → `duplicate_groups` w/ `rule_id`. `DUP‑3` hard gate: workspace‑null = 0 before any merge.
- `DUP‑4` auto‑merge T1 shared‑address (~17–19) after spot‑check; `DUP‑5` Sorensen Ranchera **3→1** (keep 5 distinct buildings); `DUP‑6` Tracy Cruce identical‑policy merge.
- `DUP‑7/8/9` phone‑only, T2 (56), T3 (18) → human‑review workbook. *All merges precede Wave 3 and finalize Sorensen for Wave 4.*

**Wave 3 — Households (P1, link‑not‑merge).** After dedup.
- `HH‑2` add `accounts.household_id` + canonicalize on `households` (repoint off dead `primary_contact_id` → `primary_account_id`).
- `HH‑3…8` exclusion view → cycle‑safe union‑find matcher → upsert `households` → **link 45 HIGH** (the only write to `accounts`) → rollup view + mixed‑line flag (on normalized LOB) → display name.
- `HH‑9` deprecate `household_accounts`/`portal_household_members` (coordinate `MODEL‑4`); `HH‑10` review queue (MEDIUM/LOW + person↔business); `HH‑11` maintained `refresh_households()` routine.

**Wave 4 — Business classification (P1, review‑gated).** After `HYG‑1` + Sorensen dedup.
- `BIZ‑0` commercial‑line detection contract (uses `lob_crosswalk` category); `BIZ‑1` review workbook (106).
- `BIZ‑2` Tier‑1 auto‑flip (~21); `BIZ‑3` Tier‑2/3 review flips.
- `BIZ‑4` add `business_type_id` FK + populate `commercial_business_accounts` + map suffix→`business_types`; `BIZ‑5` FP exclusions; `BIZ‑6` guardrail trigger on `policies` (commercial line ⇒ commercial type), ship last; `BIZ‑8` soft‑delete the Blue Oak demo row.

**Wave 5 — Party model + structural (P2, architectural — NEEDS BRIAN'S DECISION).**
- `MODEL‑5` **Party model = Option A**: adopt account‑centric `insured_*`, re‑point ~26 FKs off `contacts`, deprecate `contacts`. *Gates the entire SMS/consent/portal/marketing stack.*
- `MODEL‑4` finalize household‑model deprecations; `BIZ‑7` final person↔business relate via owner/primary.

**Wave 6 — Cleanup (P2).**
- `MODEL‑6` drop 4 dead `customer_id` columns + `customers` table; `HYG‑4/5/6` enrichment queues (policy dates/premium, address, DOB — sourced/ongoing; Canopy backfills some); `MODEL‑8` archive 14,187 soft‑deleted import rows (last).

---

## Decisions required from Brian (before the gated waves)
1. **Party model — approve Option A** (adopt `insured_*`, retire `contacts`). Validated to protect zero existing data. *(Wave 5)*
2. **The 7 non‑FL workspace‑null accounts** — stamp to workspace or exclude as non‑book. *(Wave 0)*
3. **Carrier list** — confirm the 21 additions are carriers vs MGAs (ICAT/PIE flagged). *(Wave 0)*
4. **Review‑gate approvals** during build — duplicate merges (T2/T3), business Tier‑2/3 flips, household MEDIUM/LOW — surfaced as workbooks; auto‑tiers proceed after a dry‑run spot‑check.

## Handoff note for the Claude Code build agent
- Order is load‑bearing: **MODEL‑1 → HYG‑1/2/3 + MODEL‑2 → MODEL‑3 → DUP‑* → HH‑* → BIZ‑* → MODEL‑5 → cleanup.** Do not reorder dedup after householding.
- Every destructive step: branch‑first, dry‑run, `merge_history`/audit logging, reversible. Never hard‑DELETE an account (106 FKs / 56 CASCADE).
- Re‑verify the live counts at build time (they drift as merges run); the locked numbers above are the 2026‑06‑27 baseline.
