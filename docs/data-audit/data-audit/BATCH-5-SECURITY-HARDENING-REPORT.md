# Batch 5 — Security Hardening — RESULTS

**Date:** 2026-06-28 · Branch `hardening/rls-batch-5` · Supabase `lrqajzwcmdwahnjyidgv`
**Advisor (security) before → after:** ERROR **41 → 0** · WARN **831 → 759** · total **901 → 788**.

## Applied (versioned, verified, reversible)

### 5C — SECURITY DEFINER views → security_invoker  *(`20260628185306`)*
Flipped all **41** SECURITY DEFINER public views to `security_invoker = true`. Single-tenant: staff see all
rows unchanged; anon/portal now get RLS-scoped results. Verified none reference `auth.users` (only `auth.uid()`).
**Cleared all 41 advisor ERRORs** (`sd_views_remaining = 0`).

### 5D — `ao_renewal_quotes` integrity  *(`20260628185316`)*
Added the absent CHECK `ao_renewal_quotes_non_denied_requires_rate_term` (non-denied quotes need premium+term).
Pre-validated **0 violating rows** of 371.

### 5A — wide-open write lockdown  *(`…185527`, `…185655`, `…190525`)*
Discovery found **130** wide-open write policies / **~76** tables actually writable by a non-service role
(anon held INSERT on ~60 via the default grant) — far beyond the handoff's "six". Transformation: replace
`USING(true)`/`WITH CHECK(true)` write/ALL policies with `public.is_staff()` (staff keep read+write; broader
pre-existing staff policies like `is_canopy_staff()`/`created_by` survive alongside) and revoke `anon` writes;
`service_role` bypasses RLS so edge functions are unaffected.
- **Tier 1 (28 service-PII tables):** all `canopy_*`, `*_risk_scores`, `coverage_gap_opportunities`,
  `document_analysis*/insights/processing_queue` — edge-function-written; closes anon read+write of customer policy data.
- **Tier 2 (28 staff-CRM/extraction/reference + `leads`):** `communications, quotes, tasks, documents, acord_*,
  carriers, kb_entries, rate_watch_*, layout_*, lead_*, import_*, …`; `leads` keeps its public "Anyone can submit
  leads" anon INSERT, create/update/delete scoped to staff.
- **Tier 3 (F1):** locked `generate_review_queue()` EXECUTE to `service_role`.
- **Result:** non-service wide-open write policies **94 → 24** (the 24 are the intentionally-deferred log/audit + public-flow tables); anon write revoked on all 56 scoped tables.
- **Adversarial review: SAFE-WITH-FLAGS** — no currently-active write path breaks (0 portal users / 0 non-staff
  profiles today; all active staff pass `is_staff()`; the only INVOKER trigger writing a scoped table runs in
  service-role context).

## Deferred / flagged (NOT applied — judgment or app-test required)

- **5.0 repo sync — BLOCKED on credentials.** `supabase db pull` needs `SUPABASE_ACCESS_TOKEN` (absent) + DB
  password; can't run headless. The 16 prod-only Lovable migrations still need backfilling into the repo via a
  one-time `db pull` (Brian/CLI). NOTE: my workflow applies via MCP `apply_migration` (records in
  `schema_migrations` immediately), so these Batch-5 migrations do **not** stack on divergent local history.
- **5A log/audit tier (19 tables):** `audit_logs, *_audit_log, collection_token_audit, automation_executions,
  campaign_*, generated_tasks_log, task_generation_log, task_activity_feed, job_events, profile_access_logs,
  canopy_webhook_log, document_access_log, producer_workload_stats` + public-flow `intake_submissions,
  comparison_sessions, jobs` left wide-open — they may be written by triggers in the caller's role; scoping could
  break a public-flow insert. Low risk (append-only logs, no PII read). **Next:** confirm each table's trigger
  writers are SECURITY DEFINER, then lock.
- **5B storage — NOT changed (needs app test).** `documents` bucket is `public=true` (plus `acord-forms,
  acord-templates, certificates, issue-attachments, lewis-social-videos, portal-documents, workspace-documents`);
  `storage.objects` has only unscoped `authenticated` read/write policies (all buckets). Recommended: set the
  PII buckets `public=false` and scope `storage.objects` write to `is_staff()` and read to staff/owner — but this
  breaks document display **if the app loads via public URLs**. The app's `get-document-url` edge function uses
  signed URLs (service-role), which suggests it's safe, but it must be smoke-tested first.
- **5E membership — resolved, no action.** Tamrah Tyre is `profiles.status='disabled'` (offboarded), so
  `is_staff()` correctly excludes her — not a lockout. Optional cleanup: set her `is_staff=false`. All other
  active staff have an active membership and pass `is_staff()`.
- **F2:** `update_lead_score_on_canopy_complete` (SECURITY INVOKER trigger) updates the is_staff-only `leads`;
  today only service-role drives `canopy_pulls→complete`, so safe — keep it that way (or make the trigger DEFINER
  if client-driven completion is ever added).
- **F3 (operational):** `is_staff()` also requires `default_agency_workspace_id` + an active membership. Add a
  staff-onboarding guard so a new `is_staff=true` user always has both before they need to write.

## Stays with Brian (architect calls)
Multi-tenant go/no-go (this batch is the prerequisite); whether to remove the `is_staff` fallback once membership
coverage is proven; 5B storage rollout after a signed-URL smoke test; the log/audit tier lockdown.
