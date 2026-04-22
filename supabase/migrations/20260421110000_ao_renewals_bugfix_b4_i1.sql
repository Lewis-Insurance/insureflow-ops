-- B4: Trigger to stamp last_contact_date on ao_renewals whenever a contact log entry is inserted.
-- Belt-and-suspenders alongside the client-side update in AORenewalContactLog.tsx.
CREATE OR REPLACE FUNCTION update_ao_renewal_last_contact_date()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE ao_renewals
  SET last_contact_date = NEW.contact_date,
      updated_at = now()
  WHERE id = NEW.renewal_id
    AND (last_contact_date IS NULL OR NEW.contact_date >= last_contact_date);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ao_renewal_contact_log_stamp_date ON ao_renewal_contact_log;
CREATE TRIGGER trg_ao_renewal_contact_log_stamp_date
  AFTER INSERT ON ao_renewal_contact_log
  FOR EACH ROW EXECUTE FUNCTION update_ao_renewal_last_contact_date();

-- I1: Additive permissive policy so that tasks with entity_type='ao_renewal'
-- are visible and updatable by any active agency staff member.
-- Postgres combines permissive policies with OR, so this extends the existing set
-- without touching the existing policy definitions.
DROP POLICY IF EXISTS "ao_renewal_tasks_staff_select" ON public.tasks;
CREATE POLICY "ao_renewal_tasks_staff_select" ON public.tasks
  FOR SELECT USING (
    entity_type = 'ao_renewal'
    AND EXISTS (
      SELECT 1 FROM agency_workspace_memberships awm
      WHERE awm.user_id = auth.uid()
        AND awm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "ao_renewal_tasks_staff_update" ON public.tasks;
CREATE POLICY "ao_renewal_tasks_staff_update" ON public.tasks
  FOR UPDATE USING (
    entity_type = 'ao_renewal'
    AND EXISTS (
      SELECT 1 FROM agency_workspace_memberships awm
      WHERE awm.user_id = auth.uid()
        AND awm.status = 'active'
    )
  );
