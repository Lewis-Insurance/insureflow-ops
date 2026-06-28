-- Calm Command Customers triage: server-side cohort counts.
-- Recency/balance/leads signals are dead in prod (communications ~empty, no
-- balance source, all accounts status='active'), so triage is sourced from the
-- one rich signal: policies / renewals. Counts are computed server-side so they
-- stay correct once the row list is paginated.
CREATE OR REPLACE FUNCTION public.get_customer_triage_counts()
RETURNS TABLE(
  total integer,
  renewals_30d integer,
  renewals_60d integer,
  overdue integer,
  no_active_policy integer,
  new_30d integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH acc AS (
    SELECT id, created_at FROM public.accounts WHERE deleted_at IS NULL
  )
  SELECT
    (SELECT count(*)::int FROM acc),
    (SELECT count(*)::int FROM acc a WHERE EXISTS (
        SELECT 1 FROM public.policies p
        WHERE p.account_id = a.id AND p.deleted_at IS NULL AND p.status = 'active'
          AND p.expiration_date >= current_date AND p.expiration_date < current_date + 30)),
    (SELECT count(*)::int FROM acc a WHERE EXISTS (
        SELECT 1 FROM public.policies p
        WHERE p.account_id = a.id AND p.deleted_at IS NULL AND p.status = 'active'
          AND p.expiration_date >= current_date AND p.expiration_date < current_date + 60)),
    (SELECT count(*)::int FROM acc a WHERE EXISTS (
        SELECT 1 FROM public.policies p
        WHERE p.account_id = a.id AND p.deleted_at IS NULL AND p.status = 'active'
          AND p.expiration_date < current_date)),
    (SELECT count(*)::int FROM acc a WHERE NOT EXISTS (
        SELECT 1 FROM public.policies p
        WHERE p.account_id = a.id AND p.deleted_at IS NULL AND p.status = 'active')),
    (SELECT count(*)::int FROM acc WHERE created_at >= now() - interval '30 days');
$function$;

GRANT EXECUTE ON FUNCTION public.get_customer_triage_counts() TO anon, authenticated, service_role;
