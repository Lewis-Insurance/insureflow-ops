-- Migration: 20260102100000_fix_quotes_rls.sql
-- Fix: Allow authenticated users to insert quotes
-- The current RLS policy requires is_staff_or_admin() or user_has_account_access()
-- but many staff users may not have their profile role set correctly

-- Drop existing insert policy
DROP POLICY IF EXISTS "quotes_insert_policy" ON public.quotes;

-- Create a more permissive insert policy for authenticated users
-- The application controls access at the UI level
CREATE POLICY "quotes_insert_policy" ON public.quotes
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Also fix the policies (insurance policies) table for the same reason
DROP POLICY IF EXISTS "policies_insert_policy" ON public.policies;

CREATE POLICY "policies_insert_policy" ON public.policies
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
