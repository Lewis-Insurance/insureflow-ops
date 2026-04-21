-- AO Renewals: follow-up columns, RLS cleanup, task backfill, document entity type
-- This migration is the authoritative schema change for the AO renewals command surface v2.

-- ============================================================
-- 1. Add follow-up columns to ao_renewals
-- ============================================================

ALTER TABLE public.ao_renewals
  ADD COLUMN IF NOT EXISTS follow_up_date    DATE NULL,
  ADD COLUMN IF NOT EXISTS follow_up_reason  TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_ao_renewals_follow_up_date
  ON public.ao_renewals (follow_up_date)
  WHERE follow_up_date IS NOT NULL;

-- ============================================================
-- 2. Add 'ao_renewal' as a valid related_entity_type for documents
-- ============================================================

ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_related_entity_type_check;
ALTER TABLE public.documents
  ADD CONSTRAINT documents_related_entity_type_check
  CHECK (related_entity_type = ANY (ARRAY[
    'account'::text, 'policy'::text, 'quote'::text, 'claim'::text, 'ao_renewal'::text
  ]));

-- ============================================================
-- 3. Clean up RLS on ao_renewals — drop all existing policies
--    (mix of {public} and duplicate {authenticated} policies)
-- ============================================================

DROP POLICY IF EXISTS "Allow all delete on ao_renewals"         ON public.ao_renewals;
DROP POLICY IF EXISTS "Allow all insert on ao_renewals"         ON public.ao_renewals;
DROP POLICY IF EXISTS "Allow all select on ao_renewals"         ON public.ao_renewals;
DROP POLICY IF EXISTS "Allow all update on ao_renewals"         ON public.ao_renewals;
DROP POLICY IF EXISTS "Authenticated users can delete ao_renewals" ON public.ao_renewals;
DROP POLICY IF EXISTS "Authenticated users can insert ao_renewals" ON public.ao_renewals;
DROP POLICY IF EXISTS "Authenticated users can update ao_renewals" ON public.ao_renewals;
DROP POLICY IF EXISTS "Authenticated users can view ao_renewals"   ON public.ao_renewals;

-- Staff-membership check (single-agency app: user is active member of any workspace)
CREATE POLICY "ao_renewals_select" ON public.ao_renewals
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agency_workspace_memberships m
      WHERE m.user_id = auth.uid() AND m.status = 'active'
    )
  );

CREATE POLICY "ao_renewals_insert" ON public.ao_renewals
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agency_workspace_memberships m
      WHERE m.user_id = auth.uid() AND m.status = 'active'
    )
  );

CREATE POLICY "ao_renewals_update" ON public.ao_renewals
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agency_workspace_memberships m
      WHERE m.user_id = auth.uid() AND m.status = 'active'
    )
  );

CREATE POLICY "ao_renewals_delete" ON public.ao_renewals
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agency_workspace_memberships m
      WHERE m.user_id = auth.uid() AND m.status = 'active'
    )
  );

-- ============================================================
-- 4. Replace RLS on ao_renewal_contact_log with staff-membership check
-- ============================================================

DROP POLICY IF EXISTS "All authenticated users can create contact logs" ON public.ao_renewal_contact_log;
DROP POLICY IF EXISTS "All authenticated users can delete contact logs" ON public.ao_renewal_contact_log;
DROP POLICY IF EXISTS "All authenticated users can update contact logs" ON public.ao_renewal_contact_log;
DROP POLICY IF EXISTS "Users can view all contact logs"                 ON public.ao_renewal_contact_log;

CREATE POLICY "ao_renewal_contact_log_select" ON public.ao_renewal_contact_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.agency_workspace_memberships m
      WHERE m.user_id = auth.uid() AND m.status = 'active')
  );

CREATE POLICY "ao_renewal_contact_log_insert" ON public.ao_renewal_contact_log
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.agency_workspace_memberships m
      WHERE m.user_id = auth.uid() AND m.status = 'active')
  );

CREATE POLICY "ao_renewal_contact_log_update" ON public.ao_renewal_contact_log
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.agency_workspace_memberships m
      WHERE m.user_id = auth.uid() AND m.status = 'active')
  );

CREATE POLICY "ao_renewal_contact_log_delete" ON public.ao_renewal_contact_log
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.agency_workspace_memberships m
      WHERE m.user_id = auth.uid() AND m.status = 'active')
  );

-- ============================================================
-- 5. Replace RLS on ao_renewal_notes with staff-membership check
-- ============================================================

DROP POLICY IF EXISTS "All authenticated users can create notes" ON public.ao_renewal_notes;
DROP POLICY IF EXISTS "All authenticated users can delete notes" ON public.ao_renewal_notes;
DROP POLICY IF EXISTS "All authenticated users can update notes" ON public.ao_renewal_notes;
DROP POLICY IF EXISTS "Users can view all notes"                 ON public.ao_renewal_notes;

CREATE POLICY "ao_renewal_notes_select" ON public.ao_renewal_notes
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.agency_workspace_memberships m
      WHERE m.user_id = auth.uid() AND m.status = 'active')
  );

CREATE POLICY "ao_renewal_notes_insert" ON public.ao_renewal_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.agency_workspace_memberships m
      WHERE m.user_id = auth.uid() AND m.status = 'active')
  );

CREATE POLICY "ao_renewal_notes_update" ON public.ao_renewal_notes
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.agency_workspace_memberships m
      WHERE m.user_id = auth.uid() AND m.status = 'active')
  );

CREATE POLICY "ao_renewal_notes_delete" ON public.ao_renewal_notes
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.agency_workspace_memberships m
      WHERE m.user_id = auth.uid() AND m.status = 'active')
  );

-- ============================================================
-- 6. Replace RLS on ao_renewal_quotes with staff-membership check
-- ============================================================

DROP POLICY IF EXISTS "All authenticated users can create quotes" ON public.ao_renewal_quotes;
DROP POLICY IF EXISTS "All authenticated users can delete quotes" ON public.ao_renewal_quotes;
DROP POLICY IF EXISTS "All authenticated users can update quotes" ON public.ao_renewal_quotes;
DROP POLICY IF EXISTS "All authenticated users can view quotes"   ON public.ao_renewal_quotes;

CREATE POLICY "ao_renewal_quotes_select" ON public.ao_renewal_quotes
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.agency_workspace_memberships m
      WHERE m.user_id = auth.uid() AND m.status = 'active')
  );

CREATE POLICY "ao_renewal_quotes_insert" ON public.ao_renewal_quotes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.agency_workspace_memberships m
      WHERE m.user_id = auth.uid() AND m.status = 'active')
  );

CREATE POLICY "ao_renewal_quotes_update" ON public.ao_renewal_quotes
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.agency_workspace_memberships m
      WHERE m.user_id = auth.uid() AND m.status = 'active')
  );

CREATE POLICY "ao_renewal_quotes_delete" ON public.ao_renewal_quotes
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.agency_workspace_memberships m
      WHERE m.user_id = auth.uid() AND m.status = 'active')
  );

-- ============================================================
-- 7. Backfill 3 orphan AO tasks that have assignee_id = NULL
-- ============================================================

UPDATE public.tasks
SET
  assignee_id = created_by,
  updated_at  = now()
WHERE
  entity_type  = 'ao_renewal'
  AND assignee_id IS NULL
  AND created_by IS NOT NULL;
