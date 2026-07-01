# InsureFlow — Remaining‑Work Handoff (for Claude Code)

**Date:** 2026-06-28
**Author:** Brian's architect/orchestrator (planning only — nothing here was executed from this side).
**Executor:** Claude Code, on branch `cleanup/data-integrity`, Supabase project `lrqajzwcmdwahnjyidgv`.
**Status:** Cleanup Waves 0–4 are live on production and reversible (final book 1,720 accounts / 2,163 policies; zero hard deletes). Wave 5 drafted/parked. Brian has **approved everything in Batch 1 and Batch 2 below.**

This document identifies *all* remaining work, who does each piece, and the spec for every code/DB change. Supersedes `CLAUDE-CODE-EXECUTION.md` (now folded in here).

---

## Operating rules — apply to EVERY code/DB item
- All DB changes as **versioned migrations committed to git**. Branch‑first; **dry‑run → show counts → apply → verify** each step.
- **Soft‑delete only** (never hard‑delete; `accounts` has 106 FK columns / 56 CASCADE). Log mutations; keep reversible.
- **Additive** normalization (never overwrite raw). Respect/repair RLS — never weaken it.
- **Do not `supabase db push` the stale/divergent local migrations** until the pipeline is reconciled (Batch 2B). Build against prod's verified live schema.

---

## BATCH 1 — DB/data fixes + security, then merge to `main`  *(APPROVED)*

### 1A — Carriers & MGAs  (clears the 104 active policies with NULL `carrier_id`)
Add as **carriers** (de‑dupe casing; backfill `carrier_id` by name):
Safe Harbor Insurance Company · US Coastal Property & Casualty Insurance Company · The Burlington Insurance Company · Certain Underwriters at Lloyd's, London · Orange Insurance Exchange · Mount Vernon Fire Insurance Company · AGCS Marine Insurance Company · Covington Specialty Insurance Company · Hadron Specialty Insurance Company · United States Liability Insurance Company · Wilshire Insurance Company · Wright National Flood Insurance Company · **The Pie Insurance Company (NAIC 21857)**.
Add as **MGAs** (`mgas` table) and link the policy:
- **Pie** → risk carrier = The Pie Insurance Company (NAIC 21857): set that policy's `carrier_id` → The Pie Insurance Company, `mga_id` → Pie.
- **ICAT** → MGA underwriting via rated carrier partners / Lloyd's syndicates: set the ICAT policy's `mga_id` → ICAT, `carrier_id` → Certain Underwriters at Lloyd's, London (placeholder — **flag to confirm the exact syndicate from the dec page**).
**Verify:** active‑policy `carrier_id` NULL → 0 (or just the 1 ICAT pending dec‑page confirm).

### 1B — The 7 workspace‑NULL accounts
- **KEEP Joanne Ducas** → stamp `agency_workspace_id = f1f07037-3032-45f8-93ca-72c0f47e4fbb`.
- **SOFT‑DELETE** (reversible) the other 6: AO Commercial Non‑renewals, Ronald Lewis, Suzanne Rhoden‑Mancini, Jeremiah Garling, Emmett Mims, Seth Harrison.
**Verify:** active workspace‑NULL accounts → 0.

### 1C — Wave 5 party‑model  (Brian approved — Option A)
Apply the drafted migration: adopt account‑centric `insured_profiles/emails/phones/addresses`; re‑point the ~26 FKs off `contacts`; deprecate/retire `contacts`. **Verify:** no FK still references `contacts`; `insured_*` in use; zero data loss (`contacts` was empty).

### 1D — `accounts` RLS security  (E1 — APPROVED; do BEFORE the merge)
**Problem:** `accounts` has two policies, both `roles=authenticated USING(true)` → any logged‑in user can read/write every customer record; `anon` also holds a table SELECT grant.
**Intended rule (Brian):** single agency — **all staff see all accounts within their agency.**
**Implement:** replace the `USING(true)` policies with workspace/membership‑scoped policies — account visible/editable where `agency_workspace_id IN (select agency_workspace_id from agency_workspace_memberships where user_id = auth.uid())`; keep `hide_soft_deleted_accounts`. **REVOKE** anon table grants on `accounts` and the other PII tables (policies, leads, canopy_*, insured_*, documents, etc.).
**Caution (test first):** confirm every active staff user has an `agency_workspace_memberships` row, or some lose access; if membership coverage is incomplete, gate on `profiles.role IN (admin,owner,producer,csr,staff)` AND workspace match. Run the app's key read paths against the new policy on the branch before applying to prod. Apply the same scoping pattern to other wide‑open tenant tables where trivially safe; **list any you defer.**

### 1E — `sync_account_types` trigger fix  (E2 — APPROVED)
The `type` ↔ `account_type` sync trigger can't resolve `commercial_business` (legacy `account_type` value is `business`). Fix the mapping so the 23 reclassified commercial accounts update cleanly. **Verify:** update one commercial account; trigger succeeds; legacy column = `business`.

### 1F — Finish Batch 1
Ensure migration history is consistent, commit each item, then **merge `cleanup/data-integrity` → `main` and push to GitHub.** Output `[BATCH 1 COMPLETE]` with the verification results for 1A–1E.

---

## BATCH 2 — Ops / pipeline  *(APPROVED — Part D)*
- **2A.** Confirm **PITR (or daily backups) is enabled** on the prod project; report the current restore window.
- **2B.** Reconcile the **repo ↔ prod migration history** (the repo carried migrations never applied to prod, incl. `customer_merge_transactional_v1`, now superseded by `merge_accounts()`). Decide that file's fate, align the histories, and ensure nobody can `db push` stale migrations over the cleanup. Output the reconciled state.

---

## BATCH 3 — Assistant data‑cleanup tooling  *(BUILD — for Brian's non‑technical assistant)*
**Goal:** let an employee with zero project context clean up the parked data/judgment items.
**Recommended mechanism (build this):** Claude Code **generates a scoped Excel "Cleanup Kit"** from live data — zero‑build, no app login, she starts immediately, returns the file, Claude Code re‑imports under the standard dry‑run→verify→reversible rhythm. (A simple in‑app review page is a reasonable **phase‑2** if this recurs — spec on request; do **not** gate her starting on it.)

**Kit structure — one workbook, tabs:**
1. **START HERE** — plain‑English instructions: what this is, how to fill each tab, what "done" looks like, who to ask. No jargon, no project backstory.
2. **Part C — data entry (SCOPED, not the full book):**
   - *Businesses* — the 23 `commercial_business` accounts; columns to fill: FEIN, NAICS, # employees, annual revenue (from ACORDs/applications). Pre‑list the 23 names.
   - *Missing policy data* — **only active policies on active accounts**, prioritized: missing effective/expiration date and/or premium. **Cap the first batch (~100 highest‑value, e.g., in‑force with a renewal soon)** — do NOT dump all 779.
   - *Missing addresses* — **active accounts with ≥1 policy** only, prioritized by value; note Canopy back‑fills the rest, so keep this list short.
   - *Birthdays* — DOB **only for active cross‑sell/life‑quote targets**, not the 1,700‑row tail.
3. **Part B — judgment calls (simple Yes/No/Unsure):**
   - *Possible duplicates* — T2/T3/phone clusters from `duplicate_groups`; show the 2 records side‑by‑side (name, address, phone, policies) + decision dropdown: Same / Different / Unsure.
   - *Possible households* — MEDIUM/LOW pairs; show members + decision: Same household / Not / Unsure.
   - *Business or personal* — Tier‑2/3 flagged accounts (incl. the 5 Sorensen buildings); decision: Business / Personal / Unsure.
**Rules for the build:** every input column is a dropdown or a single value; raw IDs hidden in a reference column for re‑import; one instruction line per tab in plain English; pull record detail from prod read‑only. **Re‑import path:** assistant returns the file → Claude Code validates + applies approved rows (merges/links/reclass/backfills) with logging + reversibility; anything marked "Unsure" routes back to Brian.

---

## BATCH 4 — Downstream  *(after Batch 1)*
- **4A.** Regenerate the **Phase‑0 cross‑sell target list** against the clean 1,720‑account, householded book (the v2 list predates dedup/householding).
- **4B.** Deploy the **Canopy account‑rewire** patch already built in `canopy-rewire/` (re‑points the loop from leads to accounts) on a branch → verify → prod.
- **4C.** **Wave 6 cleanup:** drop the dead `customer_id` columns + `customers` table; archive the ~14,187 soft‑deleted import rows (after the dedup review queues are closed).

---

## Sequence & ownership
- **Batch 1** first → merge to `main`. **Batch 2** alongside. **Batch 3** can run in parallel (assistant works while code proceeds). **Batch 4** after Batch 1.
- **Stays with Brian (+ architect):** adjudicating the assistant's "Unsure"/Part B outcomes, Wave 6 archive timing, any future multi‑tenant decision.
- **Every code change → its own commit + verification; nothing merged to `main` with a failing verify or an open security hole.**
