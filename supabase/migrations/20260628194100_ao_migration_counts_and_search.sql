-- Phase 3 Part B: Auto-Owners migration view. Server-side cohort counts +
-- paginated search over ao_renewals (the real AO book moving off Auto-Owners).

CREATE OR REPLACE FUNCTION public.get_ao_migration_counts()
RETURNS TABLE(
  total integer,
  not_started integer,
  quote_out integer,
  bound_elsewhere integer,
  lapsing_week integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    (SELECT count(*)::int FROM public.ao_renewals),
    (SELECT count(*)::int FROM public.ao_renewals WHERE status = 'pending'),
    (SELECT count(*)::int FROM public.ao_renewals WHERE status IN ('quoted','contacted')),
    (SELECT count(*)::int FROM public.ao_renewals WHERE status = 'moved'),
    (SELECT count(*)::int FROM public.ao_renewals
       WHERE renewal_date >= current_date AND renewal_date < current_date + 7
         AND status IN ('pending','contacted','quoted'));
$function$;

GRANT EXECUTE ON FUNCTION public.get_ao_migration_counts() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.search_ao_renewals(p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 250, p_offset integer DEFAULT 0, p_sort text DEFAULT 'renewal_asc'::text)
RETURNS TABLE(
  id uuid,
  account_id uuid,
  customer_name text,
  policy_number text,
  policy_type text,
  current_carrier text,
  renewal_date date,
  current_premium numeric,
  status text,
  moved_carrier text,
  best_alternative_carrier text,
  last_contact_date timestamp with time zone,
  follow_up_date date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  filter_q text;
  filter_cohort text;
BEGIN
  filter_q := p_filters->>'q';
  filter_cohort := p_filters->>'cohort';

  RETURN QUERY
  SELECT
    r.id,
    r.account_id,
    COALESCE(NULLIF(btrim(r.customer_name), ''), 'Unnamed') as customer_name,
    r.policy_number,
    r.policy_type,
    r.current_carrier,
    r.renewal_date,
    r.current_premium,
    r.status,
    r.moved_carrier,
    r.best_alternative_carrier,
    r.last_contact_date,
    r.follow_up_date
  FROM public.ao_renewals r
  WHERE
    (filter_q IS NULL OR filter_q = '' OR (
      r.customer_name ILIKE '%' || filter_q || '%' OR
      r.policy_number ILIKE '%' || filter_q || '%'
    ))
    AND (
      filter_cohort IS NULL OR filter_cohort = '' OR filter_cohort = 'all'
      OR (filter_cohort = 'not_started' AND r.status = 'pending')
      OR (filter_cohort = 'quote_out' AND r.status IN ('quoted','contacted'))
      OR (filter_cohort = 'bound_elsewhere' AND r.status = 'moved')
      OR (filter_cohort = 'lapsing_week' AND r.renewal_date >= current_date AND r.renewal_date < current_date + 7 AND r.status IN ('pending','contacted','quoted'))
    )
  ORDER BY
    CASE WHEN p_sort = 'renewal_asc' THEN r.renewal_date END ASC NULLS LAST,
    CASE WHEN p_sort = 'renewal_desc' THEN r.renewal_date END DESC NULLS LAST,
    r.id
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.search_ao_renewals(jsonb, integer, integer, text) TO anon, authenticated, service_role;
