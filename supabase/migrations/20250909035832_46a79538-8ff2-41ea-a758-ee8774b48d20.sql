-- Fix the enum value issue in unified customer migration

-- Update the unified_customer_search function to use correct enum values
CREATE OR REPLACE FUNCTION public.unified_customer_search(
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0,
  p_sort text DEFAULT 'updated_at_desc'::text
)
RETURNS TABLE(
  id uuid,
  account_id uuid,
  name text,
  display_name text,
  org_name text,
  type text,
  email text,
  phone text,
  primary_email text,
  primary_phone text,
  city text,
  state text,
  postal_code text,
  status text,
  notes_summary text,
  policies_count integer,
  balance numeric,
  last_contact_at timestamp with time zone,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  rank real
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  filter_q text;
  filter_type text;
  filter_city text;
  filter_state text;
BEGIN
  -- Extract filter values
  filter_q := p_filters->>'q';
  filter_type := p_filters->>'type';
  filter_city := p_filters->>'city';
  filter_state := p_filters->>'state';

  RETURN QUERY
  SELECT
    a.id,
    a.id as account_id,
    a.name,
    COALESCE(ip.display_name, a.name) as display_name,
    ip.org_name,
    COALESCE(ip.type, a.type::text) as type,
    a.email,
    a.phone,
    COALESCE(a.email, (SELECT ie.email FROM public.insured_emails ie WHERE ie.account_id = a.id ORDER BY ie.is_primary DESC, ie.created_at ASC LIMIT 1)) as primary_email,
    COALESCE(a.phone, (SELECT ipn.e164 FROM public.insured_phones ipn WHERE ipn.account_id = a.id ORDER BY ipn.is_primary DESC, ipn.created_at ASC LIMIT 1)) as primary_phone,
    a.city,
    a.state,
    a.zip_code as postal_code,
    a.account_status::text as status,
    a.notes as notes_summary,
    COALESCE((SELECT count(*)::int FROM public.policies pol WHERE pol.account_id = a.id), 0) as policies_count,
    null::numeric as balance,
    ip.last_contact_at,
    a.created_at,
    a.updated_at,
    CASE 
      WHEN filter_q IS NOT NULL AND filter_q != '' THEN 
        ts_rank(a.search_vector, plainto_tsquery('simple', filter_q))
      ELSE 0.0
    END as rank
  FROM public.accounts a
  LEFT JOIN public.insured_profiles ip ON ip.account_id = a.id
  WHERE 
    a.deleted_at IS NULL
    AND (filter_q IS NULL OR filter_q = '' OR (
      a.search_vector @@ plainto_tsquery('simple', filter_q) OR
      a.name ILIKE '%' || filter_q || '%' OR
      a.email ILIKE '%' || filter_q || '%' OR
      a.phone ILIKE '%' || filter_q || '%' OR
      COALESCE(ip.display_name, '') ILIKE '%' || filter_q || '%' OR
      COALESCE(ip.org_name, '') ILIKE '%' || filter_q || '%'
    ))
    AND (filter_type IS NULL OR filter_type = '' OR a.type::text = filter_type)
    AND (filter_city IS NULL OR filter_city = '' OR a.city ILIKE '%' || filter_city || '%')
    AND (filter_state IS NULL OR filter_state = '' OR a.state ILIKE '%' || filter_state || '%')
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
$$;