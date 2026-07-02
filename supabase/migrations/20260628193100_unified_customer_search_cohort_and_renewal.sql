-- Extend unified_customer_search with:
--  (1) a 'cohort' filter (renewals_30d, renewals_60d, overdue, no_active_policy,
--      new_30d) so a triage tile click filters the rows server-side, and
--  (2) a next_expiration_at column (soonest active-policy expiration per account)
--      so the list shows a real renewal countdown in place of the structurally
--      null balance/last_contact_at columns.
-- Return type changes, so drop + recreate (atomic within this migration).
DROP FUNCTION IF EXISTS public.unified_customer_search(jsonb, integer, integer, text);

CREATE FUNCTION public.unified_customer_search(p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0, p_sort text DEFAULT 'updated_at_desc'::text)
 RETURNS TABLE(id uuid, account_id uuid, name text, display_name text, org_name text, type text, email text, phone text, primary_email text, primary_phone text, city text, state text, postal_code text, status text, notes_summary text, policies_count integer, balance numeric, last_contact_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, rank real, next_expiration_at date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  filter_q text;
  filter_type text;
  filter_city text;
  filter_state text;
  filter_cohort text;
BEGIN
  filter_q := p_filters->>'q';
  filter_type := p_filters->>'type';
  filter_city := p_filters->>'city';
  filter_state := p_filters->>'state';
  filter_cohort := p_filters->>'cohort';

  RETURN QUERY
  SELECT
    a.id,
    a.id as account_id,
    a.name,
    a.name as display_name,
    null::text as org_name,
    a.type::text as type,
    a.email,
    a.phone,
    a.email as primary_email,
    a.phone as primary_phone,
    a.city,
    a.state,
    a.zip_code as postal_code,
    a.account_status::text as status,
    a.notes as notes_summary,
    COALESCE((SELECT count(*)::int FROM public.policies pol WHERE pol.account_id = a.id), 0) as policies_count,
    null::numeric as balance,
    null::timestamp with time zone as last_contact_at,
    a.created_at,
    a.updated_at,
    CASE
      WHEN filter_q IS NOT NULL AND filter_q != '' THEN
        ts_rank(a.search_vector, plainto_tsquery('simple', filter_q))
      ELSE 0.0
    END as rank,
    (SELECT min(pol.expiration_date) FROM public.policies pol
       WHERE pol.account_id = a.id AND pol.deleted_at IS NULL AND pol.status = 'active') as next_expiration_at
  FROM public.accounts a
  WHERE
    a.deleted_at IS NULL
    AND (filter_q IS NULL OR filter_q = '' OR (
      a.search_vector @@ plainto_tsquery('simple', filter_q) OR
      a.name ILIKE '%' || filter_q || '%' OR
      a.email ILIKE '%' || filter_q || '%' OR
      a.phone ILIKE '%' || filter_q || '%'
    ))
    AND (filter_type IS NULL OR filter_type = '' OR a.type::text = filter_type)
    AND (filter_city IS NULL OR filter_city = '' OR a.city ILIKE '%' || filter_city || '%')
    AND (filter_state IS NULL OR filter_state = '' OR a.state ILIKE '%' || filter_state || '%')
    AND (
      filter_cohort IS NULL OR filter_cohort = '' OR filter_cohort = 'all'
      OR (filter_cohort = 'renewals_30d' AND EXISTS (
            SELECT 1 FROM public.policies p WHERE p.account_id = a.id AND p.deleted_at IS NULL
              AND p.status = 'active' AND p.expiration_date >= current_date AND p.expiration_date < current_date + 30))
      OR (filter_cohort = 'renewals_60d' AND EXISTS (
            SELECT 1 FROM public.policies p WHERE p.account_id = a.id AND p.deleted_at IS NULL
              AND p.status = 'active' AND p.expiration_date >= current_date AND p.expiration_date < current_date + 60))
      OR (filter_cohort = 'overdue' AND EXISTS (
            SELECT 1 FROM public.policies p WHERE p.account_id = a.id AND p.deleted_at IS NULL
              AND p.status = 'active' AND p.expiration_date < current_date))
      OR (filter_cohort = 'no_active_policy' AND NOT EXISTS (
            SELECT 1 FROM public.policies p WHERE p.account_id = a.id AND p.deleted_at IS NULL
              AND p.status = 'active'))
      OR (filter_cohort = 'new_30d' AND a.created_at >= now() - interval '30 days')
    )
  ORDER BY
    CASE WHEN p_sort = 'rank_desc' AND filter_q IS NOT NULL AND filter_q != '' THEN
      ts_rank(a.search_vector, plainto_tsquery('simple', filter_q))
    END DESC NULLS LAST,
    CASE WHEN p_sort = 'name_asc' THEN a.name END ASC NULLS LAST,
    CASE WHEN p_sort = 'name_desc' THEN a.name END DESC NULLS LAST,
    CASE WHEN p_sort = 'updated_at_asc' THEN a.updated_at END ASC NULLS LAST,
    CASE WHEN p_sort = 'updated_at_desc' THEN a.updated_at END DESC NULLS LAST,
    a.id
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.unified_customer_search(jsonb, integer, integer, text) TO anon, authenticated, service_role;
