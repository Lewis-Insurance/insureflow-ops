# Batch 6 — Residual Hardening — RESULTS

**Date:** 2026-06-28 · Branch `hardening/storage-batch-6` · Supabase `lrqajzwcmdwahnjyidgv`
**Advisor (security):** ERROR **0** (held) · WARN **759 → 747** · `rls_policy_always_true` **96 (5-baseline) → 10**.

## Applied (DB-only — no `src/`, so the Netlify rebuild is a no-op)

### 6B — append-only log/audit tier locked  *(`20260628192844`)*
Locked **12** log/audit tables (write → `is_staff()`, anon writes revoked): `audit_logs, automation_executions,
campaign_enrollments, collection_token_audit, document_access_log, generated_tasks_log, producer_workload_stats,
profile_access_logs, task_activity_feed, task_generation_log, canopy_webhook_log, collection_audit_log`.
Their writers all bypass RLS (9 SECURITY DEFINER functions owned by `postgres`/BYPASSRLS + 2 service-role edge
functions), so removing the `{public}` write policy cannot break the legitimate write path — **verified** owner
`rolbypassrls=true` for every writer before applying.

### 6C / F2 — canopy trigger hardened  *(in `…192844`)*
Converted `log_audit()` and `update_lead_score_on_canopy_complete()` (both INVOKER, owned by postgres) to
**SECURITY DEFINER** + `search_path=public`, so they write `audit_logs` / `leads` regardless of caller role under
the new is_staff()-scoped policies. Removes the latent F2 risk.

## Deferred / flagged

- **6A storage — PLANNED, NOT shipped.** First real `src/` change of the arc; gate is a runtime smoke-test
  (upload/display/ACORD-PDF/AI-analysis) that can't be run from this env, and it's not a clean swap — **5 sites
  persist the URL to a DB column** (incl. the core ACORD-forms/templates PDF feature), needing a schema change +
  backfill. Full dev-ready, file:line plan in **BATCH-6A-STORAGE-MIGRATION-PLAN.md**. Buckets stay public until
  Phase 1 lands + is verified, exactly as designed. I can execute it on a branch but the **merge/deploy must be
  gated on the runtime smoke-test** (need preview creds, or hand the branch to the doer).
- **6.0 repo sync — still BLOCKED** on `SUPABASE_ACCESS_TOKEN` (absent). The 16 prod-only migrations still need a
  one-time `supabase db pull` (Brian/CLI). My MCP-apply path records each migration in `schema_migrations`
  immediately, so Batch-6 did not stack on divergent local history.
- **6B residual (flagged, left open):** `campaign_step_executions` and `coi_audit_log` have **no confirmed writer**
  (no plpgsql fn, no edge fn found) — could be app-direct or a writer not located; not locked blind. Public-flow
  `jobs/job_events/intake_submissions/comparison_sessions` + `leads` "Anyone can submit leads" intentionally
  remain open. These are the 10 remaining `rls_policy_always_true` findings.
- **6C / F3 onboarding guard (operational):** new `is_staff=true` users must be provisioned with
  `default_agency_workspace_id` **and** an active `agency_workspace_memberships` row, or the 1D/5A/`is_staff()`
  scoping silently blocks their reads/writes. Encode this in the user-provisioning function/runbook (not blind-
  edited here — provisioning is app logic needing its own test). Keep the `is_staff()` fallback until coverage is
  proven 100%.

## Net security posture across Batches 5+6
- SECURITY DEFINER view ERRORs: **41 → 0**.
- Wide-open non-service write policies: **~94 → 10** (the 10 are intentional public-flow + 2 flagged-uncertain).
- `anon` write grants revoked on all scoped PII + log tables; `anon` read closed on analytics matviews (B5) and
  customer-PII tables (B5 tier 1).
- Remaining for a fully-closed posture: **6A storage** (needs the frontend signed-URL migration + runtime test)
  and the 2 flagged log tables. Then **4C** (gated on dedup queues + PITR) is the last item in the entire arc.
