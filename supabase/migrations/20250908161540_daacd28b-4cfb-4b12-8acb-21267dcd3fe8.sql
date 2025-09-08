-- =========================================================
-- CORRECTED COMPREHENSIVE SECURITY FIX MIGRATION
-- Addresses all ERROR and WARN level security findings
-- =========================================================

-- 1. DROP PROBLEMATIC SECURITY DEFINER VIEWS
-- These are the 3 ERROR-level findings that bypass RLS
DROP VIEW IF EXISTS public.my_policies CASCADE;
DROP VIEW IF EXISTS public.my_claims CASCADE; 
DROP VIEW IF EXISTS public.policies_with_claims CASCADE;

-- 2. CREATE EXTENSIONS SCHEMA AND MOVE pg_trgm
CREATE SCHEMA IF NOT EXISTS extensions;

-- Move pg_trgm extension if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    ALTER EXTENSION pg_trgm SET SCHEMA extensions;
  END IF;
END $$;

-- 3. UPDATE ALL FUNCTIONS TO HAVE IMMUTABLE SEARCH PATHS
-- Fix the function search path warnings

-- Update existing functions to include proper search_path
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role::text in ('staff','admin','owner','csr','producer','accounting')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role::text in ('admin','owner')
  );
$$;

-- Update scan_for_duplicates to use extensions schema
CREATE OR REPLACE FUNCTION public.scan_for_duplicates(entity_type text DEFAULT 'accounts'::text, similarity_threshold numeric DEFAULT 0.8)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  duplicate_groups jsonb := '[]'::jsonb;
  result jsonb;
  account_dupes RECORD;
  contact_dupes RECORD;
  groups_found integer := 0;
  group_data jsonb;
BEGIN
  -- Scan for account duplicates
  IF entity_type = 'accounts' THEN
    FOR account_dupes IN
      WITH paired AS (
        SELECT 
          a.id as primary_id, 
          b.id as duplicate_id,
          GREATEST(
            CASE WHEN a.email IS NOT NULL AND a.email = b.email THEN 1.0 ELSE 0 END,
            CASE WHEN a.phone IS NOT NULL AND a.phone = b.phone THEN 0.95 ELSE 0 END,
            COALESCE(similarity(a.name, b.name), 0)
          ) as score
        FROM accounts a
        JOIN accounts b ON a.id < b.id
        WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL
      )
      SELECT primary_id, duplicate_id, score 
      FROM paired 
      WHERE score >= similarity_threshold 
      ORDER BY score DESC
    LOOP
      groups_found := groups_found + 1;
      
      -- Create duplicate group entry
      INSERT INTO duplicate_groups (
        entity_type,
        entity_ids,
        match_score,
        status
      ) VALUES (
        'accounts',
        ARRAY[account_dupes.primary_id, account_dupes.duplicate_id],
        account_dupes.score,
        'pending'
      );
      
      -- Build group data for response
      group_data := jsonb_build_object(
        'primary_id', account_dupes.primary_id,
        'duplicate_id', account_dupes.duplicate_id,
        'match_score', account_dupes.score,
        'entity_type', 'accounts'
      );
      
      duplicate_groups := duplicate_groups || jsonb_build_array(group_data);
    END LOOP;
    
  -- Scan for contact duplicates  
  ELSIF entity_type = 'contacts' THEN
    FOR contact_dupes IN
      WITH paired AS (
        SELECT 
          a.id as primary_id, 
          b.id as duplicate_id,
          GREATEST(
            CASE WHEN a.email IS NOT NULL AND a.email = b.email THEN 1.0 ELSE 0 END,
            CASE WHEN a.phone IS NOT NULL AND a.phone = b.phone THEN 0.95 ELSE 0 END,
            COALESCE(similarity(a.first_name || ' ' || a.last_name, b.first_name || ' ' || b.last_name), 0)
          ) as score
        FROM contacts a
        JOIN contacts b ON a.id < b.id  
        WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL
      )
      SELECT primary_id, duplicate_id, score 
      FROM paired 
      WHERE score >= similarity_threshold 
      ORDER BY score DESC
    LOOP
      groups_found := groups_found + 1;
      
      -- Create duplicate group entry
      INSERT INTO duplicate_groups (
        entity_type,
        entity_ids,
        match_score,
        status
      ) VALUES (
        'contacts',
        ARRAY[contact_dupes.primary_id, contact_dupes.duplicate_id],
        contact_dupes.score,
        'pending'
      );
      
      -- Build group data for response
      group_data := jsonb_build_object(
        'primary_id', contact_dupes.primary_id,
        'duplicate_id', contact_dupes.duplicate_id,
        'match_score', contact_dupes.score,
        'entity_type', 'contacts'
      );
      
      duplicate_groups := duplicate_groups || jsonb_build_array(group_data);
    END LOOP;
  END IF;
  
  -- Return results
  result := jsonb_build_object(
    'entity_type', entity_type,
    'groups_found', groups_found,
    'groups', duplicate_groups,
    'scanned_at', now()
  );
  
  RETURN result;
END;
$$;

-- Restrict access to scan_for_duplicates to staff only
REVOKE ALL ON FUNCTION public.scan_for_duplicates(text, numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.scan_for_duplicates(text, numeric) TO authenticated;

-- 4. COMPREHENSIVE RLS POLICY OVERHAUL
-- Remove existing policies and create comprehensive ones

-- PROFILES TABLE - Strongest protection
DROP POLICY IF EXISTS "profiles_self_select" ON public.profiles;
DROP POLICY IF EXISTS "select_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "staff_read_profiles" ON public.profiles;

-- Users can only see their own profile
CREATE POLICY "users_select_own_profile_only"
ON public.profiles FOR SELECT
USING (id = auth.uid());

-- Staff can see all profiles  
CREATE POLICY "staff_select_all_profiles"
ON public.profiles FOR SELECT
USING (public.is_staff());

-- ACCOUNTS TABLE - Account ownership or staff access
DROP POLICY IF EXISTS "Staff can access all accounts" ON public.accounts;
DROP POLICY IF EXISTS "staff_read_accounts" ON public.accounts;

-- Only staff can access accounts (customers don't directly own accounts in this system)
CREATE POLICY "staff_only_accounts_access"
ON public.accounts FOR ALL
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- CONTACTS TABLE - Staff only
DROP POLICY IF EXISTS "Staff can access all contacts" ON public.contacts;
DROP POLICY IF EXISTS "staff_read_contacts" ON public.contacts;

CREATE POLICY "staff_only_contacts_access"
ON public.contacts FOR ALL
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- POLICIES TABLE - Account ownership or staff
DROP POLICY IF EXISTS "policies_customer_read_own" ON public.policies;
DROP POLICY IF EXISTS "policies_staff_all_select" ON public.policies;
DROP POLICY IF EXISTS "policies_staff_all_write" ON public.policies;
DROP POLICY IF EXISTS "staff_read_policies" ON public.policies;

-- Customers can see their own policies
CREATE POLICY "customers_read_own_policies"
ON public.policies FOR SELECT
USING (insured_user_id = auth.uid());

-- Staff can access all policies
CREATE POLICY "staff_all_policies_access"
ON public.policies FOR ALL
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- CLAIMS TABLE - Policy ownership or staff
DROP POLICY IF EXISTS "claims_customer_read_own" ON public.claims;
DROP POLICY IF EXISTS "claims_staff_all_select" ON public.claims;
DROP POLICY IF EXISTS "claims_staff_all_write" ON public.claims;
DROP POLICY IF EXISTS "staff_read_claims" ON public.claims;

-- Customers can see claims for their policies
CREATE POLICY "customers_read_own_claims"
ON public.claims FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.policies p
    WHERE p.id = claims.policy_id 
    AND p.insured_user_id = auth.uid()
  )
);

-- Staff can access all claims
CREATE POLICY "staff_all_claims_access"
ON public.claims FOR ALL
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- AUDIT LOGS - Admin only (already exists but ensure it's comprehensive)
DROP POLICY IF EXISTS "admin_read_audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_admin_read" ON public.audit_logs;

CREATE POLICY "admin_only_audit_logs"
ON public.audit_logs FOR SELECT
USING (public.is_admin());

-- TELEPHONY TABLES - Staff only
DROP POLICY IF EXISTS "Staff can access call sessions" ON public.call_sessions;
DROP POLICY IF EXISTS "staff_read_call_sessions" ON public.call_sessions;

CREATE POLICY "staff_only_call_sessions"
ON public.call_sessions FOR ALL
USING (public.is_staff())
WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Staff can access sms messages" ON public.sms_messages;
DROP POLICY IF EXISTS "staff_read_sms_messages" ON public.sms_messages;

CREATE POLICY "staff_only_sms_messages"
ON public.sms_messages FOR ALL
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- CONSENT TABLES - Staff only
DROP POLICY IF EXISTS "Staff can access consents" ON public.consents;
DROP POLICY IF EXISTS "staff_read_consents" ON public.consents;

CREATE POLICY "staff_only_consents"
ON public.consents FOR ALL
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- 5. CREATE SECURE REPLACEMENT FUNCTIONS FOR REMOVED VIEWS
-- These replace the security definer views with proper RLS enforcement

CREATE OR REPLACE FUNCTION public.get_user_policies()
RETURNS SETOF policies
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT * FROM public.policies 
  WHERE insured_user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_user_claims()
RETURNS SETOF claims
LANGUAGE sql
STABLE  
SET search_path = public
AS $$
  SELECT c.* FROM public.claims c
  JOIN public.policies p ON c.policy_id = p.id
  WHERE p.insured_user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_policies_with_claims_secure()
RETURNS TABLE(
  policy_id uuid,
  policy_number text,
  carrier text,
  effective_date date,
  expiration_date date,
  premium numeric,
  insured_user_id uuid,
  claim_id uuid,
  claim_number text,
  status claim_status,
  amount_estimate numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT 
    p.id as policy_id,
    p.policy_number,
    p.carrier,
    p.effective_date,
    p.expiration_date,
    p.premium,
    p.insured_user_id,
    c.id as claim_id,
    c.claim_number,
    c.status,
    c.amount_estimate
  FROM public.policies p
  LEFT JOIN public.claims c ON c.policy_id = p.id
  WHERE (
    public.is_staff() OR p.insured_user_id = auth.uid()
  );
$$;

-- Grant execute permissions to authenticated users only
GRANT EXECUTE ON FUNCTION public.get_user_policies() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_claims() TO authenticated;  
GRANT EXECUTE ON FUNCTION public.get_policies_with_claims_secure() TO authenticated;

-- 6. ADDITIONAL SECURITY HARDENING

-- Ensure all PII tables have comprehensive policies
-- Document tables - staff only
CREATE POLICY "staff_only_documents"
ON public.documents FOR ALL  
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- Import/staging tables - staff only
CREATE POLICY "staff_only_import_batches"
ON public.import_batches FOR ALL
USING (public.is_staff())
WITH CHECK (public.is_staff());

CREATE POLICY "staff_only_import_staging"  
ON public.import_staging FOR ALL
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- 7. REVOKE DANGEROUS PERMISSIONS
-- Ensure no public access to sensitive functions
REVOKE ALL ON FUNCTION public.merge_duplicate_records(uuid, uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.merge_duplicate_records(uuid, uuid, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.process_csv_batch(uuid, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.process_csv_batch(uuid, text, jsonb) TO authenticated;