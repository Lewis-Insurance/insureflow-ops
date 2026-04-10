-- SEC-004 continued fix: documents table anon-key SELECT bypass
-- Resolves BLA-575
-- Root cause: hide_soft_deleted_documents created without TO clause in
--   20251226000002_soft_delete_enforcement.sql — applies to anon role.
-- Same pattern affects accounts, tasks, contacts (patched defensively).
--
-- Fix: drop and recreate each hide_soft_deleted_* policy with TO authenticated.
-- Service role bypasses RLS by default — no separate service_role policy needed.

-- ============================================================
-- 1. documents (confirmed anon-leaking table)
-- ============================================================
DROP POLICY IF EXISTS "hide_soft_deleted_documents" ON public.documents;
CREATE POLICY "hide_soft_deleted_documents"
  ON public.documents
  FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

-- ============================================================
-- 2. accounts (same migration, same defect, proactive patch)
-- ============================================================
DROP POLICY IF EXISTS "hide_soft_deleted_accounts" ON public.accounts;
CREATE POLICY "hide_soft_deleted_accounts"
  ON public.accounts
  FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

-- ============================================================
-- 3. tasks (same migration, same defect, proactive patch)
-- ============================================================
DROP POLICY IF EXISTS "hide_soft_deleted_tasks" ON public.tasks;
CREATE POLICY "hide_soft_deleted_tasks"
  ON public.tasks
  FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

-- ============================================================
-- 4. contacts (same migration, same defect, proactive patch)
-- ============================================================
DROP POLICY IF EXISTS "hide_soft_deleted_contacts" ON public.contacts;
CREATE POLICY "hide_soft_deleted_contacts"
  ON public.contacts
  FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);
