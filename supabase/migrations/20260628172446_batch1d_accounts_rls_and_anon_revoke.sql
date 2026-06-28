-- =====================================================================
-- Batch 1D — accounts RLS scoping + revoke anon PII grants (security)
-- =====================================================================
-- BEFORE: accounts had accounts_select_policy(SELECT USING true) +
--   authenticated_users_accounts(ALL USING true) -> any logged-in user could
--   read/write EVERY account; hide_soft_deleted_accounts was a no-op (OR'd with true);
--   anon held INSERT+SELECT table grants on accounts and 14 other PII tables.
-- AFTER: scoped policies — an account is visible/writable where its workspace is in
--   the user's ACTIVE memberships OR the user is staff (is_staff). Soft-deleted rows
--   hidden from the authenticated role (service_role still sees them). anon grants
--   revoked on PII tables (KEEP leads INSERT — the "Anyone can submit leads" public flow).
-- VERIFIED: all 8 staff (incl. Tamrah Tyre, who lacks an f1f07037 membership) see all
--   1,714 active accounts via the is_staff branch -> zero lockout.
-- Reversible: re-create the prior USING(true) policies + re-grant.
-- 2026-06-28
-- =====================================================================

DROP POLICY IF EXISTS accounts_select_policy ON public.accounts;
DROP POLICY IF EXISTS authenticated_users_accounts ON public.accounts;
DROP POLICY IF EXISTS hide_soft_deleted_accounts ON public.accounts;

CREATE POLICY accounts_select_scoped ON public.accounts
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      EXISTS (SELECT 1 FROM public.agency_workspace_memberships m
              WHERE m.user_id = auth.uid() AND m.status = 'active'
                AND m.agency_workspace_id = accounts.agency_workspace_id)
      OR EXISTS (SELECT 1 FROM public.profiles pr
                 WHERE pr.id = auth.uid() AND COALESCE(pr.is_staff, false) = true)
    )
  );

CREATE POLICY accounts_insert_scoped ON public.accounts
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.agency_workspace_memberships m
            WHERE m.user_id = auth.uid() AND m.status = 'active'
              AND m.agency_workspace_id = accounts.agency_workspace_id)
    OR EXISTS (SELECT 1 FROM public.profiles pr
               WHERE pr.id = auth.uid() AND COALESCE(pr.is_staff, false) = true)
  );

CREATE POLICY accounts_update_scoped ON public.accounts
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.agency_workspace_memberships m
            WHERE m.user_id = auth.uid() AND m.status = 'active'
              AND m.agency_workspace_id = accounts.agency_workspace_id)
    OR EXISTS (SELECT 1 FROM public.profiles pr
               WHERE pr.id = auth.uid() AND COALESCE(pr.is_staff, false) = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.agency_workspace_memberships m
            WHERE m.user_id = auth.uid() AND m.status = 'active'
              AND m.agency_workspace_id = accounts.agency_workspace_id)
    OR EXISTS (SELECT 1 FROM public.profiles pr
               WHERE pr.id = auth.uid() AND COALESCE(pr.is_staff, false) = true)
  );

CREATE POLICY accounts_delete_scoped ON public.accounts
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.agency_workspace_memberships m
            WHERE m.user_id = auth.uid() AND m.status = 'active'
              AND m.agency_workspace_id = accounts.agency_workspace_id)
    OR EXISTS (SELECT 1 FROM public.profiles pr
               WHERE pr.id = auth.uid() AND COALESCE(pr.is_staff, false) = true)
  );

-- Revoke vestigial/leaky anon table grants on PII tables. Keep leads INSERT
-- (the "Anyone can submit leads" public-submission policy needs the grant).
REVOKE INSERT, SELECT ON public.accounts                     FROM anon;
REVOKE INSERT, SELECT ON public.commercial_business_accounts FROM anon;
REVOKE INSERT, SELECT ON public.canopy_pulls                 FROM anon;
REVOKE INSERT, SELECT ON public.canopy_monitorings           FROM anon;
REVOKE INSERT, SELECT ON public.communications               FROM anon;
REVOKE INSERT, SELECT ON public.documents                    FROM anon;
REVOKE INSERT, SELECT ON public.insured_profiles             FROM anon;
REVOKE INSERT, SELECT ON public.insured_emails               FROM anon;
REVOKE INSERT, SELECT ON public.insured_phones               FROM anon;
REVOKE INSERT, SELECT ON public.insured_addresses            FROM anon;
REVOKE INSERT, SELECT ON public.notes                        FROM anon;
REVOKE INSERT, SELECT ON public.premium_payments             FROM anon;
REVOKE INSERT, SELECT ON public.quotes                       FROM anon;
REVOKE INSERT, SELECT ON public.tasks                        FROM anon;
REVOKE         SELECT ON public.leads                        FROM anon;  -- keep INSERT for public submission
