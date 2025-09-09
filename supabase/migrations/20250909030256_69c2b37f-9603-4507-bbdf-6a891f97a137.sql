-- Add search vector to accounts for full-text search
ALTER TABLE public.accounts 
ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Backfill search vector for existing accounts
UPDATE public.accounts a
SET search_vector = 
    setweight(to_tsvector('simple', coalesce(a.name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(a.email, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(a.phone, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(a.tin_last4, '')), 'D');

-- Create trigger function to maintain search vector
CREATE OR REPLACE FUNCTION public.accounts_search_vector_tg()
RETURNS trigger 
LANGUAGE plpgsql 
AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('simple', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.email, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.phone, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(NEW.tin_last4, '')), 'D');
  RETURN NEW;
END;
$$;

-- Create trigger to automatically update search vector
DROP TRIGGER IF EXISTS accounts_search_vector_tg ON public.accounts;
CREATE TRIGGER accounts_search_vector_tg
  BEFORE INSERT OR UPDATE OF name, email, phone, tin_last4 ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.accounts_search_vector_tg();

-- Add GIN index for search performance
CREATE INDEX IF NOT EXISTS accounts_search_vector_gin 
ON public.accounts USING gin (search_vector);

-- Canonical customers search function
CREATE OR REPLACE FUNCTION public.customers_search_v1(
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_limit int DEFAULT 25,
  p_offset int DEFAULT 0,
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
  updated_at timestamptz,
  rank real
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    a.id as account_id,
    COALESCE(ip.display_name, a.name) as display_name,
    ip.org_name,
    COALESCE(ip.type, a.type::text) as type,
    (SELECT ia.city FROM public.insured_addresses ia WHERE ia.account_id = a.id AND ia.is_primary = true LIMIT 1) as city,
    (SELECT ia.state FROM public.insured_addresses ia WHERE ia.account_id = a.id AND ia.is_primary = true LIMIT 1) as state,
    (SELECT ie.email FROM public.insured_emails ie WHERE ie.account_id = a.id ORDER BY ie.is_primary DESC, ie.created_at ASC LIMIT 1) as primary_email,
    (SELECT ipn.e164 FROM public.insured_phones ipn WHERE ipn.account_id = a.id ORDER BY ipn.is_primary DESC, ipn.created_at ASC LIMIT 1) as primary_phone,
    COALESCE((SELECT count(*)::int FROM public.policies pol WHERE pol.account_id = a.id), 0) as policies_count,
    null::numeric as balance,
    ip.last_contact_at,
    ip.created_at,
    ip.updated_at,
    CASE 
      WHEN filter_q IS NOT NULL AND filter_q != '' THEN 
        ts_rank(a.search_vector, plainto_tsquery('simple', filter_q))
      ELSE 0.0
    END as rank
  FROM public.accounts a
  LEFT JOIN public.insured_profiles ip ON ip.account_id = a.id
  WHERE 
    (filter_q IS NULL OR filter_q = '' OR (
      a.search_vector @@ plainto_tsquery('simple', filter_q) OR
      COALESCE(ip.display_name, a.name) ILIKE '%' || filter_q || '%' OR
      ip.org_name ILIKE '%' || filter_q || '%'
    ))
    AND (filter_type IS NULL OR filter_type = '' OR COALESCE(ip.type, a.type::text) = filter_type)
    AND (filter_city IS NULL OR filter_city = '' OR EXISTS (
      SELECT 1 FROM public.insured_addresses ia 
      WHERE ia.account_id = a.id AND ia.city ILIKE '%' || filter_city || '%'
    ))
    AND (filter_state IS NULL OR filter_state = '' OR EXISTS (
      SELECT 1 FROM public.insured_addresses ia 
      WHERE ia.account_id = a.id AND ia.state ILIKE '%' || filter_state || '%'
    ))
  ORDER BY
    CASE WHEN p_sort = 'rank_desc' AND filter_q IS NOT NULL AND filter_q != '' THEN 
      ts_rank(a.search_vector, plainto_tsquery('simple', filter_q)) 
    END DESC NULLS LAST,
    CASE WHEN p_sort = 'name_asc' THEN COALESCE(ip.display_name, a.name) END ASC NULLS LAST,
    CASE WHEN p_sort = 'name_desc' THEN COALESCE(ip.display_name, a.name) END DESC NULLS LAST,
    CASE WHEN p_sort = 'updated_at_asc' THEN COALESCE(ip.updated_at, a.updated_at) END ASC NULLS LAST,
    CASE WHEN p_sort = 'updated_at_desc' THEN COALESCE(ip.updated_at, a.updated_at) END DESC NULLS LAST,
    a.id
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.customers_search_v1(jsonb, int, int, text) TO authenticated, anon, service_role;