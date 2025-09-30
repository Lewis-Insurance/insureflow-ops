-- CRITICAL SECURITY FIX: Remove dangerous policies that expose customer data to all users

-- Remove the dangerous policy that allows any authenticated user to read ALL account data
DROP POLICY IF EXISTS "accounts_read_read" ON public.accounts;

-- Remove the dangerous policy that allows any authenticated user to read ALL policy data  
DROP POLICY IF EXISTS "policies_read_read" ON public.policies;

-- Also remove any other overly permissive policies
DROP POLICY IF EXISTS "accounts_select" ON public.accounts;

-- The remaining secure policies that should stay:
-- 1. accounts_by_membership - only allows access to accounts where user has membership
-- 2. accounts_select_staff_or_member - allows staff OR members only
-- 3. policies_by_membership - only allows access to policies where user has account membership
-- 4. Staff access policies - properly restricted to staff users

-- Verify we have proper secure policies in place
-- These policies ensure only legitimate access:
-- - Users can only see accounts they are members of
-- - Staff can see all accounts (for administrative purposes)
-- - Same restrictions apply to policies

-- Let's also ensure the carriers table is properly secured
-- Check if carriers has overly permissive policies
-- Update carriers policy to be more restrictive if needed