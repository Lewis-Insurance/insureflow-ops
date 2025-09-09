-- ============================================================================
-- UNIFIED CUSTOMER/INSURED/CLIENT DATA MODEL - FIXED
-- ============================================================================

-- Drop existing functions that will conflict
DROP FUNCTION IF EXISTS public.customers_search(text, uuid, integer, integer);
DROP FUNCTION IF EXISTS public.customers_search_v1(jsonb, integer, integer, text);
DROP FUNCTION IF EXISTS public.insureds_search_v1(jsonb, integer, timestamp with time zone, uuid, text);

-- First, migrate any data from customers table to accounts if they don't exist
DO $$
DECLARE
  customer_record RECORD;
BEGIN
  -- Check if customers table exists and has data
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'customers' AND table_schema = 'public') THEN
    -- Migrate customer data to accounts table
    FOR customer_record IN SELECT * FROM public.customers LOOP
      INSERT INTO public.accounts (
        id,
        name,
        email,
        phone,
        address_line1,
        address_line2,
        city,
        state,
        zip_code,
        type,
        account_status,
        notes,
        created_at,
        updated_at,
        team_id,
        custom
      ) VALUES (
        customer_record.id,
        customer_record.name,
        customer_record.email,
        customer_record.phone,
        customer_record.address_line1,
        customer_record.address_line2,
        customer_record.city,
        customer_record.state,
        customer_record.postal_code,
        CASE 
          WHEN customer_record.type = 'business' THEN 'business'::account_type_v2
          ELSE 'household'::account_type_v2
        END,
        CASE 
          WHEN customer_record.status = 'active' THEN 'active'::account_status
          WHEN customer_record.status = 'inactive' THEN 'inactive'::account_status
          ELSE 'lead'::account_status
        END,
        customer_record.notes_summary,
        customer_record.created_at,
        customer_record.updated_at,
        customer_record.account_id, -- Use as team_id if different from id
        jsonb_build_object('external_ref', customer_record.external_ref)
      ) ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        updated_at = EXCLUDED.updated_at;
    END LOOP;
  END IF;
END $$;

-- Create a unified view that presents accounts as "customers" for backward compatibility
CREATE OR REPLACE VIEW public.customers_unified AS
SELECT 
  a.id,
  a.id as account_id,
  a.name,
  a.email,
  a.phone,
  a.address_line1,
  a.address_line2,
  a.city,
  a.state,
  a.zip_code as postal_code,
  'US' as country,
  a.type::text,
  a.account_status::text as status,
  a.notes as notes_summary,
  a.created_at,
  a.updated_at,
  a.search_vector,
  a.custom->>'external_ref' as external_ref
FROM public.accounts a
WHERE a.deleted_at IS NULL;

-- Create unified search function that works for customers/insureds/clients
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

-- Recreate customers_search function using unified view
CREATE OR REPLACE FUNCTION public.customers_search(
  q text, 
  p_account_id uuid, 
  limit_count integer DEFAULT 50, 
  offset_count integer DEFAULT 0
)
RETURNS SETOF customers_unified
LANGUAGE sql
STABLE
AS $$
  SELECT * FROM public.customers_unified
  WHERE (p_account_id IS NULL OR account_id = p_account_id)
    AND (
      q IS NULL
      OR search_vector @@ websearch_to_tsquery('simple', q)
      OR name ILIKE '%' || q || '%'
      OR email ILIKE '%' || q || '%'
      OR phone ILIKE '%' || q || '%'
    )
  ORDER BY updated_at DESC
  LIMIT GREATEST(1, limit_count) 
  OFFSET GREATEST(0, offset_count);
$$;

-- Recreate customers_search_v1 using unified function
CREATE OR REPLACE FUNCTION public.customers_search_v1(
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0,
  p_sort text DEFAULT 'updated_at_desc'::text
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
  updated_at timestamp with time zone,
  rank real
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    u.account_id,
    u.display_name,
    u.org_name,
    u.type,
    u.city,
    u.state,
    u.primary_email,
    u.primary_phone,
    u.policies_count,
    u.balance,
    u.last_contact_at,
    u.created_at,
    u.updated_at,
    u.rank
  FROM public.unified_customer_search(p_filters, p_limit, p_offset, p_sort) u;
$$;

-- Recreate insureds_search_v1 using unified function (for backward compatibility)
CREATE OR REPLACE FUNCTION public.insureds_search_v1(
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_limit integer DEFAULT 25,
  p_after_updated_at timestamp with time zone DEFAULT NULL,
  p_after_id uuid DEFAULT NULL,
  p_sort text DEFAULT 'updated_at_desc'::text
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
LANGUAGE sql
STABLE
AS $$
  SELECT 
    u.account_id,
    u.display_name,
    u.org_name,
    u.type,
    u.city,
    u.state,
    u.primary_email,
    u.primary_phone,
    u.policies_count,
    u.balance,
    u.last_contact_at,
    u.created_at,
    u.updated_at
  FROM public.unified_customer_search(
    p_filters, 
    p_limit, 
    COALESCE((p_after_updated_at IS NOT NULL)::int * p_limit, 0), -- Convert cursor to offset
    p_sort
  ) u;
$$;

-- Mark the customers table as deprecated if it exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'customers' AND table_schema = 'public') THEN
    COMMENT ON TABLE public.customers IS 'DEPRECATED: Use accounts table and customers_unified view instead. Data has been migrated to accounts.';
  END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_accounts_search_vector ON public.accounts USING gin(search_vector);
CREATE INDEX IF NOT EXISTS idx_accounts_type_status ON public.accounts(type, account_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_accounts_updated_at ON public.accounts(updated_at DESC) WHERE deleted_at IS NULL;