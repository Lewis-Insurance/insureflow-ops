-- ============================================================================
-- COI module Phase 0: ACORD engine tenancy hardening.
-- Spec: docs/coi-module/01-disposition-and-roadmap.md Section 4 (R14, D7, D8).
-- Pattern: sec005 leads workspace isolation (20260408100000): add nullable
-- column, backfill via account, oldest-workspace orphan fallback, SET NOT NULL,
-- index, replace policies, derive-on-insert trigger.
--
-- DRIFT RECONCILIATION (live state verified 2026-07-02 on project
-- lrqajzwcmdwahnjyidgv, and it differs from the spec's cited Section 4.1 source):
--   * acord_forms is governed live by policy `authenticated_users_acord_forms`
--     (FOR ALL, USING/CHECK is_staff(), NO workspace check) -- NOT the spec's
--     `acord_forms_all` (auth.uid() IS NOT NULL). We DROP both names via
--     IF EXISTS so the end-state matches the spec's Section 4.2 posture exactly;
--     dropping only the stale spec name would leave the permissive is_staff-only
--     policy alive and (RLS being permissive/OR'd) defeat workspace isolation.
--   * acord_templates is already `authenticated_users_acord_templates`
--     (FOR ALL, is_staff()), which already satisfies the spec's intent of
--     staff-only writes. Templates carry no agency_workspace_id and no PII, so
--     no workspace scoping applies; this migration deliberately leaves the
--     templates policy untouched rather than loosen reads.
-- No design change: the final RLS end-state (workspace-scoped staff RLS + soft
-- delete on acord_forms; parent-scoped child tables) is exactly Section 4.2.
-- ============================================================================

-- 1. Columns -----------------------------------------------------------------
ALTER TABLE public.acord_forms
  ADD COLUMN IF NOT EXISTS agency_workspace_id uuid
    REFERENCES public.agency_workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 2. Backfill from accounts; orphan fallback to the oldest workspace ----------
UPDATE public.acord_forms f
SET agency_workspace_id = a.agency_workspace_id
FROM public.accounts a
WHERE f.account_id = a.id
  AND f.agency_workspace_id IS NULL;

UPDATE public.acord_forms
SET agency_workspace_id = (
  SELECT id FROM public.agency_workspaces ORDER BY created_at LIMIT 1
)
WHERE agency_workspace_id IS NULL;

ALTER TABLE public.acord_forms
  ALTER COLUMN agency_workspace_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_acord_forms_workspace
  ON public.acord_forms (agency_workspace_id);

-- 3. Derive workspace on insert so no client is trusted to supply it ----------
CREATE OR REPLACE FUNCTION public.acord_forms_set_workspace()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.agency_workspace_id IS NULL AND NEW.account_id IS NOT NULL THEN
    SELECT a.agency_workspace_id INTO NEW.agency_workspace_id
    FROM public.accounts a WHERE a.id = NEW.account_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_acord_forms_set_workspace ON public.acord_forms;
CREATE TRIGGER trg_acord_forms_set_workspace
  BEFORE INSERT ON public.acord_forms
  FOR EACH ROW EXECUTE FUNCTION public.acord_forms_set_workspace();

-- 4. Replace acord_forms policies with staff + workspace scoping --------------
DROP POLICY IF EXISTS acord_forms_all ON public.acord_forms;                 -- spec name (absent live)
DROP POLICY IF EXISTS authenticated_users_acord_forms ON public.acord_forms; -- drifted live name
DROP POLICY IF EXISTS acord_forms_select ON public.acord_forms;
DROP POLICY IF EXISTS acord_forms_insert ON public.acord_forms;
DROP POLICY IF EXISTS acord_forms_update ON public.acord_forms;

CREATE POLICY acord_forms_select ON public.acord_forms
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND is_staff() AND is_agency_member(agency_workspace_id));

CREATE POLICY acord_forms_insert ON public.acord_forms
  FOR INSERT TO authenticated
  WITH CHECK (is_staff() AND is_agency_member(agency_workspace_id));

CREATE POLICY acord_forms_update ON public.acord_forms
  FOR UPDATE TO authenticated
  USING (is_staff() AND is_agency_member(agency_workspace_id))
  WITH CHECK (is_staff() AND is_agency_member(agency_workspace_id));

-- Intentionally NO DELETE policy: soft delete only (repo invariant 6).

-- 5. Child tables follow the parent form's workspace -------------------------
DROP POLICY IF EXISTS acord_sections_all ON public.acord_form_sections;
CREATE POLICY acord_sections_all ON public.acord_form_sections
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.acord_forms f
    WHERE f.id = acord_form_sections.acord_form_id
      AND is_staff() AND is_agency_member(f.agency_workspace_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.acord_forms f
    WHERE f.id = acord_form_sections.acord_form_id
      AND is_staff() AND is_agency_member(f.agency_workspace_id)
  ));

DROP POLICY IF EXISTS acord_audit_select ON public.acord_field_audit;
DROP POLICY IF EXISTS acord_audit_insert ON public.acord_field_audit;

CREATE POLICY acord_audit_select ON public.acord_field_audit
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.acord_forms f
    WHERE f.id = acord_field_audit.acord_form_id
      AND is_staff() AND is_agency_member(f.agency_workspace_id)
  ));

CREATE POLICY acord_audit_insert ON public.acord_field_audit
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.acord_forms f
    WHERE f.id = acord_field_audit.acord_form_id
      AND is_staff() AND is_agency_member(f.agency_workspace_id)
  ));
