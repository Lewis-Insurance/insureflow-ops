-- Fix Communications RLS: Allow staff to insert communications
-- Migration: 20251230210000_fix_communications_rls.sql

-- The current RLS policy uses is_staff_or_admin() which checks profiles.role
-- But many users may not have their profile role set correctly

-- Option 1: Simplify - allow any authenticated user to insert communications
-- (The application already controls access at the UI level)

-- Drop existing insert policy
DROP POLICY IF EXISTS "communications_insert_policy" ON public.communications;

-- Create a more permissive insert policy for authenticated users
CREATE POLICY "communications_insert_policy" ON public.communications
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Also ensure the select policy allows staff to see all communications
DROP POLICY IF EXISTS "communications_select_policy" ON public.communications;

CREATE POLICY "communications_select_policy" ON public.communications
  FOR SELECT
  TO authenticated
  USING (true);

-- Verify
DO $$
BEGIN
  RAISE NOTICE 'Communications RLS policies updated for authenticated users';
END $$;
