# Batch 2 — Ops / Pipeline Reconciliation (Part D)

**Date:** 2026-06-28 · **Project:** `lrqajzwcmdwahnjyidgv` (Lewis Insurance App)

---

## 2A — Backups / PITR

- **Org plan:** `pro` (org `cuoszdxjsnhkvywxtpfq`). Region `us-east-1`. Postgres `17.4.1.075` (ga).
- **What Pro guarantees:** automatic **daily logical backups with 7-day retention** are included on the Pro plan by default. That is the floor — a restore to any of the last 7 daily snapshots is available.
- **PITR (Point-in-Time Recovery):** a paid add-on giving ~2-minute granularity over a longer window. **On/off status is not exposed through the MCP/SQL surface** (`get_project`/`get_organization` don't return backup config; there is no backup MCP tool).
- **ACTION FOR BRIAN (1 click):** confirm in Supabase Dashboard → **Project → Database → Backups** whether PITR is enabled and note the window. Recommendation: **enable PITR** before/around the Wave-6 destructive cleanup (4C) so any mistake during the archive/drop is recoverable to the minute, not just to the last daily snapshot.
- **Restore window today (guaranteed):** last **7 days** of daily backups (Pro default). PITR window = whatever the dashboard shows if enabled.

---

## 2B — Repo ↔ Prod migration-history reconciliation

Compared **432 repo migration files** vs the **applied versions** in prod `supabase_migrations.schema_migrations`.

### Direction 1 — REPO-ONLY (versions a `supabase db push` *would* have applied) — the danger set

5 files. Each verified against live prod, then **marked APPLIED** in `schema_migrations` (migration-repair) so `db push` now skips them. None re-run.

| Version | File | Live-state check | Disposition |
|---|---|---|---|
| `20260511000000` | ao_child_created_by_default | `DEFAULT auth.uid()` present on all 3 AO child cols | effect already live → repaired-applied |
| `20260512000000` | renewal_child_created_by_default | `DEFAULT auth.uid()` present on all 4 renewal child cols (7/7 total) | effect already live → repaired-applied |
| `20260622152000` | ao_renewal_quotes_nullable_declines | `premium` IS nullable ✅ — **but the `…non_denied_requires_rate_term` CHECK is ABSENT** ⚠️ | primary effect live → repaired-applied; **see FLAG #1** |
| `20260622160000` | **customer_merge_transactional_v1** | no `customer_merge_transactional*` function in prod | **SUPERSEDED by `merge_accounts()`** → repaired-applied + file marked DEAD/DO-NOT-APPLY |
| `20260626120000` | fix_payment_methods_select_rls_global | same fix already live via prod `20260626160631` (same name, later version); old "…for their org" policy gone | stale duplicate → repaired-applied |

**Result:** REPO-ONLY count is now **0** → `supabase db push` applies nothing and cannot clobber the cleanup. (The operating-rule embargo on `db push` can be lifted *for these*; still review Direction-2 file gaps before relying on push for fresh environments.)

### Direction 2 — PROD-ONLY (applied to prod, no matching repo file)

19 versions. These do **not** endanger anything (`db push` ignores already-applied versions); they are a repo *documentation* gap.

- **Mine, from the cleanup (now reconstructed + committed for completeness):**
  - `20260628145732` wave2_dup1_merge_tooling_perf — FK-discovery perf rewrite; **superseded** by `…151600` (no-op stub committed).
  - `20260628153334` wave3_households_fix_minuuid — `MIN(uuid)` → `MIN(label::text)::uuid` (note stub).
  - `20260628153545` wave3_households_fix_exclusion — **authoritative** reconstruction: current `cleanup.refresh_households()` dumped from prod.
- **Pre-existing (applied via Lovable/dashboard before this engagement — NOT reconstructed here; flagged):** `20260504174418` backfill_ao_renewals_211_missing_clients; the 10 `20260509*` brian morning/evening-brief KPI + cron + drill-down migrations; `20260518120000` patrol_rls_policy_export; the four `20260625*` security fixes (`security_fix_enable_rls_financial_tables`, `security_fix_kb_view_remove_auth_users_v2`, `security_fix_enable_rls_serveronly_config_tables`, `security_hardening_is_staff_and_remaining_rls`); `20260626160631` fix_payment_methods_select_rls_global. **See FLAG #2.**

> Note: repo file `20251226000001_performance_indexes.sql` collides on version with prod's `20251226000001` (= `portal_schema`). `db push` already treats that version as applied and skips the repo file, so `performance_indexes.sql` will never run via push. **FLAG #3.**

---

## Flags for Brian / architect

1. **AO-renewal-quotes CHECK guard is absent in prod.** `20260622152000` would have added `ao_renewal_quotes_non_denied_requires_rate_term` (non-denied quotes must carry premium + term). Prod has the nullability but not the guard. Decide: (a) add the constraint after verifying zero violating rows, or (b) leave it off intentionally. Not auto-applied (could break inserts).
2. **16 prod-only migrations have no repo file** (brian-brief KPIs, June-25 security fixes, patrol export, payment-methods 160631). The deploy pipeline (Lovable/dashboard direct-apply) has been writing to prod without committing files. Recommend a one-time `supabase db pull` to backfill these into the repo so the repo is a faithful mirror — do this *before* anyone relies on `db push` for a fresh/branch environment.
3. **Version collision** `20251226000001` (repo `performance_indexes` vs prod `portal_schema`). Confirm the intended indexes exist; if not, re-issue `performance_indexes` under a fresh version.

**Reconciled state:** dangerous repo-only push set neutralized (0 remaining); `customer_merge_transactional_v1` decided DEAD; cleanup hotfix files reconstructed. Residual = the 3 flags above (judgment / pipeline-hygiene, none blocking).
