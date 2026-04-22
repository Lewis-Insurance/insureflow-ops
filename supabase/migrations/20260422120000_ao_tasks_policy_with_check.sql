-- Fix B-v2-4: Recreate ao_renewal_tasks_staff_update with explicit WITH CHECK.
-- Without it, Postgres reuses USING as WITH CHECK implicitly, which is correct
-- but non-obvious. Making it explicit documents intent and prevents silent drift.

DROP POLICY IF EXISTS ao_renewal_tasks_staff_update ON public.tasks;

CREATE POLICY ao_renewal_tasks_staff_update ON public.tasks
FOR UPDATE
USING (
  entity_type = 'ao_renewal'
  AND EXISTS (
    SELECT 1 FROM public.agency_workspace_memberships awm
    WHERE awm.user_id = auth.uid() AND awm.status = 'active'
  )
)
WITH CHECK (
  entity_type = 'ao_renewal'
  AND EXISTS (
    SELECT 1 FROM public.agency_workspace_memberships awm
    WHERE awm.user_id = auth.uid() AND awm.status = 'active'
  )
);
