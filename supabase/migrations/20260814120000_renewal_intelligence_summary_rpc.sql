-- Renewal Intelligence dashboard: server-side cohort counts so summary tiles and
-- risk distribution chips stay accurate beyond PostgREST max_rows (1000).
-- Mirrors get_policy_triage_counts / get_customer_triage_counts.

DROP FUNCTION IF EXISTS public.get_renewal_intelligence_summary();

CREATE OR REPLACE FUNCTION public.get_renewal_intelligence_summary()
RETURNS TABLE(
  total_renewals integer,
  renewals_next_30_days integer,
  critical_risk integer,
  high_risk integer,
  medium_risk integer,
  low_risk integer,
  avg_risk_score integer,
  active_campaigns integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH open_renewals AS (
    SELECT r.risk_level, r.risk_score, r.renewal_date
    FROM public.renewals r
    JOIN public.accounts a ON a.id = r.account_id
    WHERE r.status IN ('upcoming', 'in_progress')
      AND a.deleted_at IS NULL
      AND public.is_agency_member(a.agency_workspace_id)
  )
  SELECT
    (SELECT count(*)::int FROM open_renewals),
    (SELECT count(*)::int FROM open_renewals
       WHERE renewal_date >= current_date
         AND renewal_date <= current_date + 30),
    (SELECT count(*)::int FROM open_renewals WHERE risk_level = 'critical'),
    (SELECT count(*)::int FROM open_renewals WHERE risk_level = 'high'),
    (SELECT count(*)::int FROM open_renewals WHERE risk_level = 'medium'),
    (SELECT count(*)::int FROM open_renewals WHERE risk_level = 'low'),
    (SELECT COALESCE(round(avg(risk_score))::int, 0) FROM open_renewals),
    (SELECT count(*)::int
       FROM public.renewal_campaigns rc
       JOIN public.renewals r ON r.id = rc.renewal_id
       JOIN public.accounts a ON a.id = r.account_id
       WHERE rc.status = 'active'
         AND a.deleted_at IS NULL
         AND public.is_agency_member(a.agency_workspace_id))
  WHERE public.is_staff();
$function$;

REVOKE EXECUTE ON FUNCTION public.get_renewal_intelligence_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_renewal_intelligence_summary() TO authenticated, service_role;
