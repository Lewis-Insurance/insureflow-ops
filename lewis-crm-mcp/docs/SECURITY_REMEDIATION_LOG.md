# Lewis Insurance — Security Remediation Log

**Project:** `lrqajzwcmdwahnjyidgv` (PRODUCTION)
**Date:** 2026-06-25
**Method:** Supabase MCP `get_advisors` + live anon-key probes + `execute_sql` (read), `apply_migration` (fixes)

## What triggered this

During the read-only orientation pass, a live probe with the **public `anon` key** (the one shipped in the
website JS) returned **938 `premium_payments` + 9 `payment_methods` rows** to an unauthenticated caller.
Root cause: RLS was *disabled* on tables that already had correct org-scoped policies (policies were inert).

## Advisor baseline (get_advisors security)

- 919 findings: **81 ERROR**, 824 WARN, 14 INFO.
- ERROR classes: `policy_exists_rls_disabled` (14), `rls_disabled_in_public` (24), `security_definer_view` (41),
  `auth_users_exposed` (1: `knowledge_base_with_stats`), `sensitive_columns_exposed` (1: `bank_accounts.routing_number`).
- Systemic: `anon` holds GRANT ALL (incl. UPDATE/DELETE/TRUNCATE) on ~489 of 492 public tables. RLS is the
  only protection on the ~486 that have it enabled.

## ✅ Fixes APPLIED to production (all reversible)

| Migration | What | Verified |
|---|---|---|
| `security_fix_enable_rls_financial_tables` | RLS enabled on 13 tables: premium_payments, payment_methods, bank_accounts, bank_statements, bank_statement_lines, escrow_deposits, payment_attachments, payment_audit_log, reconciliation_adjustments, day_sheets, business_types, lines_of_business, mgas | anon reads 938→0, 9→0; `rls=true` all 13 |
| `security_fix_kb_view_remove_auth_users_v2` | `knowledge_base_with_stats` view: `auth.users.email` → `profiles.email` | 0 auth.users refs |
| `security_fix_enable_rls_serveronly_config_tables` | RLS enabled on 5 server-only config tables: admin_budget_alerts, automation_platform_settings (automation kill switch), carrier_field_requirements, external_service_health, state_communication_rules | anon reads 0; locked to service role |

Resolved: the financial-data anon leak, `bank_accounts.routing_number` exposure, `auth_users_exposed`,
and anon write/truncate access to the automation kill switch.

**Rollback:** `ALTER TABLE <t> DISABLE ROW LEVEL SECURITY;` / restore prior view def.

## ✅ Step 2 — APPLIED 2026-06-25 (`security_hardening_is_staff_and_remaining_rls`)

Security ERRORs dropped **81 → 41** (all 41 remaining are `security_definer_view` — backlog F).
Every public table now has RLS; anon `UPDATE/DELETE/TRUNCATE` grants revoked (verified 0); `is_staff()`
now checks `profiles.is_staff`. The plan below was executed in one atomic, reversible migration:

1. **Gate check** — confirm `profiles.is_staff=true` is populated for the 8 staff (else fixing is_staff() locks everyone out).
2. **Fix `is_staff()`** → `EXISTS(select 1 from profiles where id=auth.uid() and is_staff=true)`. Touches ~43 policies; re-verify staff paths after. (Also the adapter's auth gate.)
3. **RLS + staff-scoped policies** on the 6 tables above (5 are frontend-read → need a read policy; workspace_documents → workspace-scoped).
4. **Revoke anon UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES** on public schema (keep SELECT + INSERT). Public write flows use service-role edge functions, so this is low risk.

## Deferred (separate workstreams, not blocking the Mini)

- **9 public storage buckets** (documents, portal-documents, workspace-documents, certificates, acord-forms hold customer docs). App serves via `getPublicUrl` (23 files) → flipping to private needs a signed-URL frontend change first. Schedule as an app PR.
- **Hardening backlog (F):** 97 `USING(true)` policies, 41 SECURITY-DEFINER views, 268 function `search_path` mutable, leaked-password protection off, Postgres version patch.
