-- Migration: Create global_search_v1 RPC function
-- Purpose: Unified search across accounts, contacts, businesses, policies with proper carrier JOIN
-- This replaces the broken client-side queries that referenced non-existent 'carrier' field

-- Drop existing function if exists
DROP FUNCTION IF EXISTS global_search_v1(TEXT, INT);

-- Create the global search function
CREATE OR REPLACE FUNCTION global_search_v1(
  p_search_term TEXT,
  p_limit INT DEFAULT 50
) RETURNS TABLE (
  entity_type TEXT,
  id UUID,
  label TEXT,
  subtitle TEXT,
  email TEXT,
  phone TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search_pattern TEXT;
  v_user_id UUID;
BEGIN
  -- Get current user for RLS checks
  v_user_id := auth.uid();

  -- Early return if no user or empty search
  IF v_user_id IS NULL OR p_search_term IS NULL OR trim(p_search_term) = '' THEN
    RETURN;
  END IF;

  -- Prepare search pattern (case-insensitive ILIKE)
  v_search_pattern := '%' || trim(p_search_term) || '%';

  RETURN QUERY

  -- Search Accounts
  SELECT
    'account'::TEXT AS entity_type,
    a.id,
    COALESCE(a.name, 'Unnamed Account') AS label,
    CASE
      WHEN a.city IS NOT NULL AND a.state IS NOT NULL THEN a.city || ', ' || a.state
      ELSE NULL
    END AS subtitle,
    a.email,
    a.phone
  FROM accounts a
  INNER JOIN agency_workspace_memberships awm
    ON awm.agency_workspace_id = a.agency_workspace_id
    AND awm.user_id = v_user_id
    AND awm.status = 'active'
  WHERE a.deleted_at IS NULL
    AND (
      a.name ILIKE v_search_pattern
      OR a.email ILIKE v_search_pattern
      OR a.phone ILIKE v_search_pattern
      OR a.city ILIKE v_search_pattern
      OR a.state ILIKE v_search_pattern
      OR a.zip_code ILIKE v_search_pattern
      OR a.address_line1 ILIKE v_search_pattern
      OR a.address_line2 ILIKE v_search_pattern
      OR a.tin_last4 ILIKE v_search_pattern
      OR a.notes ILIKE v_search_pattern
    )

  UNION ALL

  -- Search Contacts
  SELECT
    'contact'::TEXT AS entity_type,
    c.id,
    COALESCE(
      NULLIF(trim(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), ''),
      'Unnamed Contact'
    ) AS label,
    NULL AS subtitle,
    c.email_primary AS email,
    COALESCE(c.phone_mobile, c.phone_home, c.phone_work) AS phone
  FROM contacts c
  INNER JOIN accounts a ON a.id = c.account_id
  INNER JOIN agency_workspace_memberships awm
    ON awm.agency_workspace_id = a.agency_workspace_id
    AND awm.user_id = v_user_id
    AND awm.status = 'active'
  WHERE c.deleted_at IS NULL
    AND (
      c.first_name ILIKE v_search_pattern
      OR c.last_name ILIKE v_search_pattern
      OR c.email_primary ILIKE v_search_pattern
      OR c.phone_mobile ILIKE v_search_pattern
      OR c.phone_home ILIKE v_search_pattern
      OR c.phone_work ILIKE v_search_pattern
      OR c.ssn_last4 ILIKE v_search_pattern
      OR CAST(c.date_of_birth AS TEXT) ILIKE v_search_pattern
    )

  UNION ALL

  -- Search Businesses
  SELECT
    'business'::TEXT AS entity_type,
    b.id,
    COALESCE(b.legal_name, b.dba, 'Unnamed Business') AS label,
    b.dba AS subtitle,
    NULL AS email,
    NULL AS phone
  FROM businesses b
  INNER JOIN accounts a ON a.id = b.account_id
  INNER JOIN agency_workspace_memberships awm
    ON awm.agency_workspace_id = a.agency_workspace_id
    AND awm.user_id = v_user_id
    AND awm.status = 'active'
  WHERE b.deleted_at IS NULL
    AND (
      b.legal_name ILIKE v_search_pattern
      OR b.dba ILIKE v_search_pattern
    )

  UNION ALL

  -- Search Policies (with proper carrier JOIN)
  SELECT
    'policy'::TEXT AS entity_type,
    p.id,
    CASE
      WHEN p.policy_number IS NOT NULL THEN 'Policy #' || p.policy_number
      ELSE COALESCE(p.named_insured, 'Unnamed Policy')
    END AS label,
    COALESCE(car.name, 'Unknown Carrier') || ' - ' || COALESCE(p.line_of_business, 'Unknown Line') ||
      CASE WHEN a.name IS NOT NULL THEN ' (' || a.name || ')' ELSE '' END AS subtitle,
    NULL AS email,
    NULL AS phone
  FROM policies p
  LEFT JOIN carriers car ON car.id = p.carrier_id
  INNER JOIN accounts a ON a.id = p.account_id
  INNER JOIN agency_workspace_memberships awm
    ON awm.agency_workspace_id = a.agency_workspace_id
    AND awm.user_id = v_user_id
    AND awm.status = 'active'
  WHERE p.deleted_at IS NULL
    AND (
      p.policy_number ILIKE v_search_pattern
      OR p.named_insured ILIKE v_search_pattern
      OR p.line_of_business ILIKE v_search_pattern
      OR car.name ILIKE v_search_pattern
    )

  LIMIT p_limit;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION global_search_v1(TEXT, INT) TO authenticated;

-- Add comment
COMMENT ON FUNCTION global_search_v1 IS 'Unified global search across accounts, contacts, businesses, and policies with RLS enforcement';

-- Create indexes to optimize search performance (if they don't exist)
CREATE INDEX IF NOT EXISTS idx_accounts_name_search ON accounts USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_accounts_email_search ON accounts USING gin(email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_first_name_search ON contacts USING gin(first_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_last_name_search ON contacts USING gin(last_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_policies_policy_number_search ON policies USING gin(policy_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_policies_named_insured_search ON policies USING gin(named_insured gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_businesses_legal_name_search ON businesses USING gin(legal_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_carriers_name_search ON carriers USING gin(name gin_trgm_ops);
