-- =====================================================================
-- Wave 1 · HYG-7 — Shared-email signal feed (additive view; SIGNAL only)
-- =====================================================================
-- Purpose : Surface email values shared across >1 active account as a candidate
--           feed for DUP- (possible duplicate) and HH- (possible household), and
--           for server-side send-time email de-duplication. NEVER auto-merges/nulls email.
-- Type    : Additive-safe (read-only view).
-- Placement: cleanup schema (NOT exposed via PostgREST) so this aggregated
--           account-id/name/email feed is not browser-reachable. DUP/HH and
--           edge functions reach it via the service role. security_invoker kept
--           as defense-in-depth (respects accounts RLS for any non-service caller).
-- Reverse : DROP VIEW cleanup.v_shared_email_clusters;
-- Date    : 2026-06-28
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS cleanup;

CREATE OR REPLACE VIEW cleanup.v_shared_email_clusters
WITH (security_invoker = true) AS
SELECT lower(btrim(email))            AS email_norm,
       count(*)                       AS n_accounts,
       array_agg(id   ORDER BY id)    AS account_ids,
       array_agg(name ORDER BY id)    AS names
FROM public.accounts
WHERE deleted_at IS NULL
  AND email IS NOT NULL
  AND btrim(email) <> ''
GROUP BY 1
HAVING count(*) > 1;
