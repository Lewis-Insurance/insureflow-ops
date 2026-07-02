-- Fix orphaned customer records (missing agency_workspace_id / account_memberships)
-- e.g. customers added via AddCustomerModal before workspace scoping was enforced

-- 1. Backfill agency_workspace_id using the primary agency workspace
UPDATE public.accounts a
SET agency_workspace_id = (
  SELECT aw.id
  FROM public.agency_workspaces aw
  ORDER BY aw.created_at ASC
  LIMIT 1
)
WHERE a.agency_workspace_id IS NULL
  AND a.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM public.agency_workspaces);

-- 2. Backfill account_type from type when missing
UPDATE public.accounts
SET account_type = CASE
  WHEN type IN ('commercial_business', 'business', 'commercial', 'corporate') THEN 'business'::public.account_type_new
  ELSE 'individual'::public.account_type_new
END
WHERE account_type IS NULL
  AND deleted_at IS NULL;

-- 3. Create owner memberships for accounts that have none
INSERT INTO public.account_memberships (account_id, user_id, role)
SELECT
  a.id,
  COALESCE(a.owner_agent_id, aw.owner_id),
  'owner'
FROM public.accounts a
JOIN public.agency_workspaces aw ON aw.id = a.agency_workspace_id
WHERE a.deleted_at IS NULL
  AND a.agency_workspace_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.account_memberships am
    WHERE am.account_id = a.id
  )
ON CONFLICT DO NOTHING;

-- 4. Scope unified_customer_search to the caller's agency workspaces (staff see all)
CREATE OR REPLACE FUNCTION public.unified_customer_search(
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0,
  p_sort text DEFAULT 'updated_at_desc'
)
RETURNS TABLE (
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
SET search_path = public
AS $$
DECLARE
  filter_q text;
  filter_type text;
  filter_city text;
  filter_state text;
BEGIN
  filter_q := p_filters->>'q';
  filter_type := p_filters->>'type';
  filter_city := p_filters->>'city';
  filter_state := p_filters->>'state';

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
    END as rank
  FROM public.accounts a
  WHERE
    a.deleted_at IS NULL
    AND (
      public.is_staff()
      OR a.agency_workspace_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.agency_workspace_memberships awm
        WHERE awm.user_id = auth.uid()
          AND awm.agency_workspace_id = a.agency_workspace_id
          AND awm.status = 'active'
      )
      OR EXISTS (
        SELECT 1
        FROM public.account_memberships am
        WHERE am.account_id = a.id
          AND am.user_id = auth.uid()
      )
    )
    AND (filter_q IS NULL OR filter_q = '' OR (
      a.search_vector @@ plainto_tsquery('simple', filter_q) OR
      a.name ILIKE '%' || filter_q || '%' OR
      a.email ILIKE '%' || filter_q || '%' OR
      a.phone ILIKE '%' || filter_q || '%'
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
