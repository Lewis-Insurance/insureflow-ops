# GOAL — InsureFlow Data‑Integrity Cleanup (Waves 0–4 + Wave 5 draft)

Execute the validated data‑integrity cleanup of the InsureFlow Supabase database, on a dev branch, following `docs/data-audit/00-MASTER-CLEANUP-ROADMAP.md` and its `PLAN-*` specs. The work is almost entirely versioned Supabase migrations plus a small amount of edge‑function/script work. **Work autonomously. Do not stop until every completion criterion below is met. Do not ask permission on routine implementation decisions inside the locked approach (migrations on a dev branch, soft‑delete, additive normalization). PARK — do not auto‑apply — the human‑gated items listed under Autonomy.**

---

## Paths
- **Spec (read‑only reference):** `docs/data-audit/` in the repo. *Assumption: copy the Cowork "Lewis Insurance Marketing/data-audit/" folder into the repo at `docs/data-audit/` before starting.* Entry point: `00-MASTER-CLEANUP-ROADMAP.md`.
- **Project root (build target):** the InsureFlow repo (React/TS + Supabase).
- **Supabase project ref:** `lrqajzwcmdwahnjyidgv` (single tenant, workspace `f1f07037-3032-45f8-93ca-72c0f47e4fbb`). **Apply migrations to a Supabase DEV BRANCH only — never production.**
- **Git branch:** `cleanup/data-integrity`.

## First action (Step 0 — before any code)
1. `git pull` on `main`; `git status` shows a clean tree.
2. Verify local `supabase/migrations/` is in sync with the live DB (latest applied migration: `20260626160631_fix_payment_methods_select_rls_global`). If local is behind, run `supabase db pull` / reconcile **before** generating new migrations, or new migrations will collide.
3. Create git branch `cleanup/data-integrity`. Create a Supabase **dev branch** (MCP `create_branch`) and target it for all `apply_migration` calls.
4. Read `docs/data-audit/00-MASTER-CLEANUP-ROADMAP.md`, then `PLAN-A-duplicates.md`, `PLAN-B-households.md`, `PLAN-C-business.md`, `PLAN-D-model.md`, `PLAN-E-hygiene.md` in the order the roadmap specifies. Read every one before writing migrations.

## Completion criteria — the goal is met when ALL pass
1. Branch `cleanup/data-integrity` exists; every migration lives in `supabase/migrations/` and applies cleanly to the Supabase dev branch (no errors).
2. **Wave 0:** `MODEL-1` stamps the 187 FL workspace‑NULL accounts (verify: active workspace‑NULL accounts now = **7** parked edge cases); `HYG-1` `lob_crosswalk` lookup populated (44 raw → canonical, row‑counts sum to 2,164); `HYG-2` `phone_e164` added; `HYG-3` `name_display` added + `Lewis Insurance Daysheets 2026` row soft‑deleted; `MODEL-2` carrier work done (PARK the 21 carrier additions for confirmation, then insert + alias‑map + backfill `carrier_id`; verify NULL drops from 486). `[WAVE 0 COMPLETE]`.
3. **Wave 1:** `policies.line_of_business_id` FK added + populated from `lob_crosswalk`; `lines_of_business` dirty categories normalized + 7 missing canonical rows added. `[WAVE 1 COMPLETE]`.
4. **Wave 2:** merge tooling built — `merge_accounts()` with **dynamic re‑parent of all 106 FK columns** from `information_schema`, soft‑delete of losers, `merge_history` undo manifest, dry‑run default; detection re‑run on the full 1,804 book into `duplicate_groups` with `rule_id`; auto‑merges applied for T1 shared‑address + Sorensen 3→1 + Tracy Cruce (verify `merge_history` rows present and **zero hard deletes**); a Dup‑Review workbook generated for T2/T3/phone‑only. `[WAVE 2 COMPLETE]`.
5. **Wave 3:** `accounts.household_id` added; `households` populated via the cycle‑safe matcher; **45 HIGH** households linked (verify count); MEDIUM/LOW review queue generated. `[WAVE 3 COMPLETE]`.
6. **Wave 4:** commercial‑line detection contract; **Tier‑1 (~21)** reclassified to `commercial_business` after FP exclusions; `commercial_business_accounts` + `business_type_id` populated; guardrail trigger on `policies` added; Blue Oak demo row soft‑deleted; Tier‑2/3 review workbook generated. `[WAVE 4 COMPLETE]`.
7. **Wave 5 (DRAFT ONLY):** party‑model Option A migration (adopt `insured_*`, re‑point ~26 FKs off `contacts`, deprecate `contacts`) written as a **non‑applied** draft `.sql` under `docs/data-audit/` + a one‑page impact summary; **PARKED for Brian's approval — NOT applied**. `[WAVE 5 DRAFTED — PARKED]`.
8. `RUN-REPORT.md` written: every migration, every verification query + its actual result, every parked gate, and rollback instructions.
9. Final `[GOAL COMPLETE]` marker.

If any criterion fails, the goal is not met. Continue working.

## Binding rules — never violate
- All DB changes via versioned migrations applied to the **Supabase dev branch only**. Never write to production.
- **Never hard‑DELETE an account.** 106 FK columns / 56 CASCADE reference `accounts.id`; a hard delete cascades destruction across 56 tables. Merge = soft‑delete loser (`deleted_at`) + dynamically re‑parent every referencing FK + log to `merge_history` with a full undo manifest.
- Every destructive op: dry‑run, output the plan, then apply; fully reversible.
- Normalization is **additive** — never overwrite raw columns (`lob_crosswalk`, `phone_e164`, `name_display`, `*_id` FKs are new).
- Respect RLS; never weaken a policy. New objects get RLS consistent with the parent table.
- Migrations idempotent / re‑runnable where feasible.
- Dedup MUST complete before household linking. LOB normalization MUST precede the LOB FK and business detection.
- No new app dependencies. Edge‑function changes only if a PLAN item requires.

Forbidden: hard DELETE on accounts/policies · any write to production · overwriting raw fields · auto‑applying a gated tier · reordering dedup after householding · skipping `merge_history` logging.

## Autonomy
Decide on your own — proceed without asking: exact migration SQL and column names per the PLANs, match thresholds as specified, verification queries, branch mechanics, workbook format.

Surface and PARK (`[PARKED — {gate}]`, then continue other non‑blocked work) — do NOT auto‑apply:
- The 21 carrier additions (confirm carriers vs MGAs — ICAT/PIE flagged) before `MODEL-2` inserts.
- The 7 non‑FL workspace‑NULL accounts (stamp vs exclude).
- Duplicate tiers T2/T3, household MEDIUM/LOW, business Tier‑2/3 — generate review workbooks, do not apply.
- Party‑model Option A — draft only, do not apply.

Do not pause for: routine SQL decisions, naming, formatting, choice of verification query.

## Commit cadence
Commit at the end of each WAVE: `git commit -m "Wave N — {name}"` + one bullet per change; migrations committed with their wave. Never commit mid‑wave or a migration that didn't apply cleanly on the dev branch.

## Progress reporting
After each wave, output:
```
[WAVE N COMPLETE]
Shipped: {bullets}
Verified (actual query results): {bullets}
Parked: {gated items + workbook paths}
Next: Wave N+1 — {name}
```
Blocker → `[BLOCKED — Wave N]` (Blocker / Tried / Need). Gate → `[PARKED — {gate}]`.

## Quality bar
Every migration is proven on the dev branch with a SELECT that demonstrates its intended effect, and counts reconcile to the roadmap's locked baseline (1,804 accounts / 2,164 policies; 45 HIGH households; ~21 Tier‑1 commercial; carrier_id NULL falling from 486). If a merge would touch a table not in the dynamic FK re‑parent set, or any count diverges sharply from the baseline, **stop and surface it — that signal matters more than finishing the wave on time.**

## Final completion gate
1. Show migration list / branch state — all wave migrations applied, no errors.
2. Run and show the verification SQL per wave (workspace‑NULL active = 7; `carrier_id` NULL reduced; `line_of_business_id` populated; `merge_history` rows = merges performed; `accounts.household_id` set = 45; `commercial_business` count up ~21).
3. Confirm **zero hard deletes** — no physical row removal from `accounts`; losers carry `deleted_at`.
4. Confirm every gated tier has a review workbook and Wave 5 is drafted + parked (unapplied).
5. `RUN-REPORT.md` written with rollback steps.

When all gates pass, output:
```
[GOAL COMPLETE]
InsureFlow data‑integrity cleanup Waves 0–4 applied on Supabase dev branch + git branch cleanup/data-integrity.
Wave 5 (party‑model) drafted and PARKED for approval. Gated tiers in review workbooks at docs/data-audit/review/.
Review: {branch}, RUN-REPORT.md, workbook paths.
```
Then stop.
