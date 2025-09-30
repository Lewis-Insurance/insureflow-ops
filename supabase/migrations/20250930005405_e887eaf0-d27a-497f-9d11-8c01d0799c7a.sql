-- SECURITY FIX: Drop problematic views that bypass RLS policies (with dependencies)
-- These views act as "Security Definer Views" by exposing data without proper access control

-- First drop functions that depend on the views
DROP FUNCTION IF EXISTS public.customers_search(text, uuid, integer, integer);

-- Now drop the problematic views that bypass RLS and expose sensitive data directly
DROP VIEW IF EXISTS public.v_user_policies CASCADE;
DROP VIEW IF EXISTS public.v_user_accounts CASCADE; 
DROP VIEW IF EXISTS public.customers_unified CASCADE;
DROP VIEW IF EXISTS public.v_contacts CASCADE;
DROP VIEW IF EXISTS public.v_accounts CASCADE;
DROP VIEW IF EXISTS public.insureds CASCADE;

-- These views were allowing users to access data by joining tables directly,
-- bypassing the RLS policies that should control access to sensitive customer information.
-- Applications should use the secure RLS-protected tables directly or the secure functions
-- like get_user_policies_secure() and get_user_claims_secure() that properly enforce access control.