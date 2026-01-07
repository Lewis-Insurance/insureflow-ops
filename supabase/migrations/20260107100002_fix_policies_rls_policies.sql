-- Migration: Fix RLS policies for policies table
-- Purpose: Change from non-existent account_memberships to agency_workspace_memberships
-- This fixes the "Policy update failed" error when completing a renewal

-- Drop the existing incorrect policies on policies table
DROP POLICY IF EXISTS "Users can view policies for their accounts" ON public.policies;
DROP POLICY IF EXISTS "Staff can insert policies" ON public.policies;
DROP POLICY IF EXISTS "Staff can update policies" ON public.policies;
DROP POLICY IF EXISTS "Staff can delete policies" ON public.policies;

-- Create correct SELECT policy using agency_workspace_memberships
CREATE POLICY "Users can view policies for their workspace accounts"
  ON public.policies
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      JOIN public.agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE a.id = policies.account_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
    )
  );

-- Create correct INSERT policy
CREATE POLICY "Staff can insert policies"
  ON public.policies
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.accounts a
      JOIN public.agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE a.id = policies.account_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
        AND awm.role IN ('owner', 'admin', 'producer', 'csr')
    )
  );

-- Create correct UPDATE policy
CREATE POLICY "Staff can update policies"
  ON public.policies
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      JOIN public.agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE a.id = policies.account_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
        AND awm.role IN ('owner', 'admin', 'producer', 'csr')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.accounts a
      JOIN public.agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE a.id = policies.account_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
        AND awm.role IN ('owner', 'admin', 'producer', 'csr')
    )
  );

-- Create correct DELETE policy
CREATE POLICY "Staff can delete policies"
  ON public.policies
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      JOIN public.agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE a.id = policies.account_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
        AND awm.role IN ('owner', 'admin')
    )
  );
