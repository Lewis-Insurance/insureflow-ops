-- Migration: Fix audit trigger issues and cleanup conflicting RLS policies
-- Purpose: Add missing created_by columns (required by audit triggers) and remove old conflicting policies

-- 1. Add the missing created_by column to policies table (required by log_audit() trigger)
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- 2. Add the missing created_by column to renewals table (also has audit trigger)
ALTER TABLE public.renewals ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- 3. Drop all conflicting old RLS policies that reference non-existent tables
DROP POLICY IF EXISTS "policies_by_membership" ON public.policies;
DROP POLICY IF EXISTS "policies_update_by_membership" ON public.policies;
DROP POLICY IF EXISTS "policies_select_policy" ON public.policies;
DROP POLICY IF EXISTS "policies_insert_policy" ON public.policies;
DROP POLICY IF EXISTS "policies_write_by_membership" ON public.policies;
DROP POLICY IF EXISTS "allow_authenticated_insert_policies" ON public.policies;
DROP POLICY IF EXISTS "staff_all_policies_access" ON public.policies;

-- 3. Ensure the correct policies from migration 20260107100002 exist
-- (These use agency_workspace_memberships which is the correct table)

-- Note: The correct policies are:
-- - "Users can view policies for their workspace accounts" (SELECT)
-- - "Staff can insert policies" (INSERT)
-- - "Staff can update policies" (UPDATE)
-- - "Staff can delete policies" (DELETE)

-- Add comments explaining the created_by columns
COMMENT ON COLUMN public.policies.created_by IS 'User who created the policy record - required by audit trigger';
COMMENT ON COLUMN public.renewals.created_by IS 'User who created the renewal record - required by audit trigger';
