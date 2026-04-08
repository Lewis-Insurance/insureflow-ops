-- SEC-005 fix: leads table missing workspace SELECT isolation
-- Resolves BLA-440 — any authenticated staff user could read leads across all workspaces.
--
-- Root cause: leads_select_policy used is_staff_or_admin() which grants access to
-- ALL leads for any staff user regardless of which agency workspace they belong to.
--
-- Fix:
--   1. Add agency_workspace_id column to leads (nullable for backfill safety)
--   2. Backfill from accounts.agency_workspace_id via leads.account_id
--   3. Set NOT NULL after backfill (default: primary workspace for orphaned leads)
--   4. Replace leads_select_policy with workspace-scoped equivalent
--   5. Tighten insert/update WITH CHECK to enforce workspace scope
--   6. Add index for query performance

-- ============================================================
-- 1. Add agency_workspace_id column (nullable first for backfill)
-- ============================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS agency_workspace_id uuid
    REFERENCES public.agency_workspaces(id) ON DELETE CASCADE;

-- ============================================================
-- 2. Backfill from accounts.agency_workspace_id
-- ============================================================

UPDATE public.leads l
SET agency_workspace_id = a.agency_workspace_id
FROM public.accounts a
WHERE l.account_id = a.id
  AND l.agency_workspace_id IS NULL;

-- Fallback: assign any remaining leads (null account_id) to the first workspace.
-- These are orphaned leads; they must belong somewhere to satisfy NOT NULL.
UPDATE public.leads l
SET agency_workspace_id = (SELECT id FROM public.agency_workspaces ORDER BY created_at LIMIT 1)
WHERE l.agency_workspace_id IS NULL;

-- ============================================================
-- 3. Enforce NOT NULL now that backfill is complete
-- ============================================================

ALTER TABLE public.leads
  ALTER COLUMN agency_workspace_id SET NOT NULL;

-- ============================================================
-- 4. Add index for workspace-scoped queries
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_leads_agency_workspace_id
  ON public.leads (agency_workspace_id);

-- ============================================================
-- 5. Replace leads RLS policies with workspace-scoped versions
-- ============================================================

-- Drop all existing leads policies (phase2 set, plus any stragglers)
DROP POLICY IF EXISTS "leads_select_policy" ON public.leads;
DROP POLICY IF EXISTS "leads_insert_policy" ON public.leads;
DROP POLICY IF EXISTS "leads_update_policy" ON public.leads;
DROP POLICY IF EXISTS "leads_delete_policy" ON public.leads;
DROP POLICY IF EXISTS "staff_all_leads_access" ON public.leads;
DROP POLICY IF EXISTS "hide_soft_deleted_leads" ON public.leads;
DROP POLICY IF EXISTS "Users can view leads they created or are assigned to" ON public.leads;
DROP POLICY IF EXISTS "Users can view leads for their account" ON public.leads;
DROP POLICY IF EXISTS "Users can view their assigned leads" ON public.leads;
DROP POLICY IF EXISTS "Everyone can view all leads" ON public.leads;
DROP POLICY IF EXISTS "Users can view all leads" ON public.leads;
DROP POLICY IF EXISTS "Staff can view leads" ON public.leads;

-- SELECT: workspace members see leads in their workspace only.
-- Also allows access to leads directly assigned to the user (cross-workspace
-- scenarios for assigned reps) and leads tied to accounts the user is
-- explicitly a member of.
CREATE POLICY "leads_select_policy"
  ON public.leads
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      -- Staff/admin: must be a member of this lead's workspace
      EXISTS (
        SELECT 1 FROM public.agency_workspace_memberships awm
        WHERE awm.agency_workspace_id = leads.agency_workspace_id
          AND awm.user_id = auth.uid()
          AND awm.status = 'active'
      )
      -- Customer portal: explicit account membership
      OR (
        account_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.account_memberships am
          WHERE am.account_id = leads.account_id
            AND am.user_id = auth.uid()
        )
      )
      -- Direct assignment fallback
      OR assigned_to = auth.uid()
    )
  );

-- INSERT: must belong to a workspace the inserting user is an active member of.
CREATE POLICY "leads_insert_policy"
  ON public.leads
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agency_workspace_memberships awm
      WHERE awm.agency_workspace_id = leads.agency_workspace_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
    )
  );

-- UPDATE: same workspace membership required; assigned users can update their own leads.
CREATE POLICY "leads_update_policy"
  ON public.leads
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agency_workspace_memberships awm
      WHERE awm.agency_workspace_id = leads.agency_workspace_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
    )
    OR assigned_to = auth.uid()
  )
  WITH CHECK (
    -- Prevent moving a lead to a workspace the user doesn't belong to
    EXISTS (
      SELECT 1 FROM public.agency_workspace_memberships awm
      WHERE awm.agency_workspace_id = leads.agency_workspace_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
    )
  );

-- DELETE: workspace membership required (admins/owners only in practice via app layer).
CREATE POLICY "leads_delete_policy"
  ON public.leads
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agency_workspace_memberships awm
      WHERE awm.agency_workspace_id = leads.agency_workspace_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
    )
  );

-- Service role bypass (internal edge functions, scoring jobs, etc.)
CREATE POLICY "leads_service_role_policy"
  ON public.leads
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);
