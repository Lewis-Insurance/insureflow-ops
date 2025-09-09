-- Add type column to insured_profiles if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'insured_profiles' 
                   AND column_name = 'type') THEN
        ALTER TABLE public.insured_profiles 
        ADD COLUMN type text;
    END IF;
END $$;

-- Simple insureds search function
CREATE OR REPLACE FUNCTION public.insureds_search_v1(
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_limit int DEFAULT 25,
  p_after_updated_at timestamptz DEFAULT null,
  p_after_id uuid DEFAULT null,
  p_sort text DEFAULT 'updated_at_desc'
)
RETURNS TABLE (
  account_id uuid,
  display_name text,
  org_name text,
  type text,
  city text,
  state text,
  primary_email text,
  primary_phone text,
  policies_count int,
  balance numeric,
  last_contact_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  query_text text;
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
    a.id as account_id,
    ip.display_name,
    ip.org_name,
    ip.type,
    (SELECT ia.city FROM public.insured_addresses ia WHERE ia.account_id = a.id AND ia.is_primary = true LIMIT 1) as city,
    (SELECT ia.state FROM public.insured_addresses ia WHERE ia.account_id = a.id AND ia.is_primary = true LIMIT 1) as state,
    (SELECT ie.email FROM public.insured_emails ie WHERE ie.account_id = a.id ORDER BY ie.is_primary DESC, ie.created_at ASC LIMIT 1) as primary_email,
    (SELECT ipn.e164 FROM public.insured_phones ipn WHERE ipn.account_id = a.id ORDER BY ipn.is_primary DESC, ipn.created_at ASC LIMIT 1) as primary_phone,
    COALESCE((SELECT count(*)::int FROM public.policies pol WHERE pol.account_id = a.id), 0) as policies_count,
    null::numeric as balance,
    ip.last_contact_at,
    ip.created_at,
    ip.updated_at
  FROM public.accounts a
  JOIN public.insured_profiles ip ON ip.account_id = a.id
  WHERE 
    (filter_q IS NULL OR filter_q = '' OR (
      ip.display_name ILIKE '%' || filter_q || '%' OR
      ip.org_name ILIKE '%' || filter_q || '%'
    ))
    AND (filter_type IS NULL OR filter_type = '' OR ip.type = filter_type)
  ORDER BY
    CASE WHEN p_sort = 'name_asc' THEN ip.display_name END ASC NULLS LAST,
    CASE WHEN p_sort = 'name_desc' THEN ip.display_name END DESC NULLS LAST,
    CASE WHEN p_sort = 'updated_at_asc' THEN ip.updated_at END ASC NULLS LAST,
    CASE WHEN p_sort = 'updated_at_desc' THEN ip.updated_at END DESC NULLS LAST,
    a.id
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.insureds_search_v1(jsonb, int, timestamptz, uuid, text) TO authenticated;