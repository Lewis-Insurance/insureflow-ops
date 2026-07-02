-- "Needs me today" chrome panel: server-side counts from REAL signals only.
-- renewals_due uses the SAME definition as get_policy_triage_counts.expiring_30d so
-- the rail panel agrees with the Policies triage strip. Missed-calls and
-- quotes-to-send are intentionally omitted (no real signal exists yet).
CREATE OR REPLACE FUNCTION public.get_needs_me_today()
RETURNS TABLE(
  renewals_due integer,
  overdue_tasks integer,
  new_leads integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    (SELECT count(*)::int FROM public.policies
       WHERE deleted_at IS NULL AND status = 'active'
         AND expiration_date >= current_date AND expiration_date < current_date + 30),
    (SELECT count(*)::int FROM public.tasks
       WHERE status IN ('pending','in_progress') AND due_at IS NOT NULL AND due_at < now()),
    (SELECT count(*)::int FROM public.leads
       WHERE deleted_at IS NULL AND status = 'new');
$function$;

GRANT EXECUTE ON FUNCTION public.get_needs_me_today() TO anon, authenticated, service_role;
