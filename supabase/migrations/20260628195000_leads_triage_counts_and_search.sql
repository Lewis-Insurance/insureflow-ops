-- Leads list: server-side cohort counts + paginated search, mirroring
-- get_customer_triage_counts / unified_customer_search. Scoped by deleted_at only.

CREATE OR REPLACE FUNCTION public.get_lead_triage_counts()
RETURNS TABLE(
  total integer,
  new_leads integer,
  hot integer,
  qualified integer,
  quoted integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH l AS (SELECT status, lead_score FROM public.leads WHERE deleted_at IS NULL)
  SELECT
    (SELECT count(*)::int FROM l),
    (SELECT count(*)::int FROM l WHERE status = 'new'),
    (SELECT count(*)::int FROM l WHERE lead_score >= 70),
    (SELECT count(*)::int FROM l WHERE status = 'qualified'),
    (SELECT count(*)::int FROM l WHERE status = 'quoted');
$function$;

GRANT EXECUTE ON FUNCTION public.get_lead_triage_counts() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.search_leads(p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 250, p_offset integer DEFAULT 0, p_sort text DEFAULT 'score_desc'::text)
RETURNS TABLE(
  id uuid,
  first_name text,
  last_name text,
  company_name text,
  email text,
  phone text,
  status text,
  lead_score integer,
  insurance_types text[],
  current_carrier text,
  last_contact_at timestamp with time zone,
  next_follow_up_date date,
  account_id uuid,
  converted_account_id uuid,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  filter_q text;
  filter_cohort text;
  filter_status text;
BEGIN
  filter_q := p_filters->>'q';
  filter_cohort := p_filters->>'cohort';
  filter_status := p_filters->>'status';

  RETURN QUERY
  SELECT
    l.id,
    l.first_name,
    l.last_name,
    l.company_name,
    l.email,
    l.phone,
    l.status::text as status,
    l.lead_score,
    l.insurance_types::text[] as insurance_types,
    l.current_carrier,
    l.last_contact_at,
    l.next_follow_up_date,
    l.account_id,
    l.converted_account_id,
    l.created_at,
    l.updated_at
  FROM public.leads l
  WHERE
    l.deleted_at IS NULL
    AND (filter_q IS NULL OR filter_q = '' OR (
      l.first_name ILIKE '%' || filter_q || '%' OR
      l.last_name ILIKE '%' || filter_q || '%' OR
      l.email ILIKE '%' || filter_q || '%' OR
      l.phone ILIKE '%' || filter_q || '%' OR
      l.company_name ILIKE '%' || filter_q || '%'
    ))
    AND (filter_status IS NULL OR filter_status = '' OR l.status::text = filter_status)
    AND (
      filter_cohort IS NULL OR filter_cohort = '' OR filter_cohort = 'all'
      OR (filter_cohort = 'new' AND l.status = 'new')
      OR (filter_cohort = 'hot' AND l.lead_score >= 70)
      OR (filter_cohort = 'qualified' AND l.status = 'qualified')
      OR (filter_cohort = 'quoted' AND l.status = 'quoted')
    )
  ORDER BY
    CASE WHEN p_sort = 'score_desc' THEN l.lead_score END DESC NULLS LAST,
    CASE WHEN p_sort = 'created_desc' THEN l.created_at END DESC NULLS LAST,
    CASE WHEN p_sort = 'name_asc' THEN l.last_name END ASC NULLS LAST,
    l.id
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.search_leads(jsonb, integer, integer, text) TO anon, authenticated, service_role;
