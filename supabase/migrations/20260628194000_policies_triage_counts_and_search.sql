-- Phase 3 Part A: Policies list. Server-side cohort counts + paginated search,
-- modeled on get_customer_triage_counts / unified_customer_search. Scoped by
-- deleted_at only (matches the Customers RPC; no workspace scoping in this app).

CREATE OR REPLACE FUNCTION public.get_policy_triage_counts()
RETURNS TABLE(
  total integer,
  expiring_30d integer,
  lapsed integer,
  no_renewal_date integer,
  recently_bound integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH p AS (SELECT status, expiration_date, created_at FROM public.policies WHERE deleted_at IS NULL)
  SELECT
    (SELECT count(*)::int FROM p),
    (SELECT count(*)::int FROM p WHERE status = 'active' AND expiration_date >= current_date AND expiration_date < current_date + 30),
    (SELECT count(*)::int FROM p WHERE status <> 'active'),
    (SELECT count(*)::int FROM p WHERE expiration_date IS NULL),
    (SELECT count(*)::int FROM p WHERE created_at >= now() - interval '30 days');
$function$;

GRANT EXECUTE ON FUNCTION public.get_policy_triage_counts() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.search_policies(p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 250, p_offset integer DEFAULT 0, p_sort text DEFAULT 'expiration_asc'::text)
RETURNS TABLE(
  id uuid,
  account_id uuid,
  named_insured text,
  policy_number text,
  carrier text,
  line text,
  status text,
  premium numeric,
  expiration_date date,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  filter_q text;
  filter_cohort text;
  filter_carrier text;
  filter_status text;
BEGIN
  filter_q := p_filters->>'q';
  filter_cohort := p_filters->>'cohort';
  filter_carrier := p_filters->>'carrier';
  filter_status := p_filters->>'status';

  RETURN QUERY
  SELECT
    pol.id,
    pol.account_id,
    COALESCE(NULLIF(btrim(pol.named_insured), ''), a.name, 'Unnamed') as named_insured,
    pol.policy_number,
    pol.carrier,
    COALESCE(pol.line_canonical, pol.line_of_business::text) as line,
    pol.status::text as status,
    pol.premium,
    pol.expiration_date,
    pol.created_at
  FROM public.policies pol
  LEFT JOIN public.accounts a ON a.id = pol.account_id
  WHERE
    pol.deleted_at IS NULL
    AND (filter_q IS NULL OR filter_q = '' OR (
      pol.policy_number ILIKE '%' || filter_q || '%' OR
      pol.carrier ILIKE '%' || filter_q || '%' OR
      pol.named_insured ILIKE '%' || filter_q || '%' OR
      a.name ILIKE '%' || filter_q || '%'
    ))
    AND (filter_carrier IS NULL OR filter_carrier = '' OR pol.carrier ILIKE '%' || filter_carrier || '%')
    AND (filter_status IS NULL OR filter_status = '' OR pol.status::text = filter_status)
    AND (
      filter_cohort IS NULL OR filter_cohort = '' OR filter_cohort = 'all'
      OR (filter_cohort = 'expiring_30d' AND pol.status = 'active' AND pol.expiration_date >= current_date AND pol.expiration_date < current_date + 30)
      OR (filter_cohort = 'lapsed' AND pol.status <> 'active')
      OR (filter_cohort = 'no_renewal_date' AND pol.expiration_date IS NULL)
      OR (filter_cohort = 'recently_bound' AND pol.created_at >= now() - interval '30 days')
    )
  ORDER BY
    CASE WHEN p_sort = 'expiration_asc' THEN pol.expiration_date END ASC NULLS LAST,
    CASE WHEN p_sort = 'expiration_desc' THEN pol.expiration_date END DESC NULLS LAST,
    CASE WHEN p_sort = 'premium_desc' THEN pol.premium END DESC NULLS LAST,
    CASE WHEN p_sort = 'created_desc' THEN pol.created_at END DESC NULLS LAST,
    pol.id
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.search_policies(jsonb, integer, integer, text) TO anon, authenticated, service_role;
