-- Update the existing insureds_search_v1 function to delegate to customers_search_v1
-- This provides backward compatibility while we migrate to canonical terminology
CREATE OR REPLACE FUNCTION public.insureds_search_v1(
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_limit integer DEFAULT 25,
  p_after_updated_at timestamp with time zone DEFAULT NULL,
  p_after_id uuid DEFAULT NULL,
  p_sort text DEFAULT 'updated_at_desc'
)
RETURNS TABLE(
  account_id uuid,
  display_name text,
  org_name text,
  type text,
  city text,
  state text,
  primary_email text,
  primary_phone text,
  policies_count integer,
  balance numeric,
  last_contact_at timestamp with time zone,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delegate to the canonical customers_search_v1 function
  -- This maintains backward compatibility while we transition
  RETURN QUERY
  SELECT 
    c.account_id,
    c.display_name,
    c.org_name,
    c.type,
    c.city,
    c.state,
    c.primary_email,
    c.primary_phone,
    c.policies_count,
    c.balance,
    c.last_contact_at,
    c.created_at,
    c.updated_at
  FROM public.customers_search_v1(
    p_filters, 
    p_limit, 
    COALESCE((p_after_updated_at IS NOT NULL)::int * p_limit, 0), -- Convert cursor to offset
    p_sort
  ) c;
END;
$$;

-- Ensure proper permissions
GRANT EXECUTE ON FUNCTION public.insureds_search_v1(jsonb, integer, timestamp with time zone, uuid, text) TO authenticated, anon, service_role;