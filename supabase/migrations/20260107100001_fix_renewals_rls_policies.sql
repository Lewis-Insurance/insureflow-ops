-- Migration: Fix RLS policies for renewals table
-- Purpose: Change from non-existent account_memberships to agency_workspace_memberships
-- This fixes the "Failed to update status" error when changing renewal status

-- Drop the existing incorrect policies on renewals table
DROP POLICY IF EXISTS "Users can view renewals for their accounts" ON public.renewals;
DROP POLICY IF EXISTS "Staff can insert renewals" ON public.renewals;
DROP POLICY IF EXISTS "Staff can update renewals" ON public.renewals;
DROP POLICY IF EXISTS "Staff can delete renewals" ON public.renewals;

-- Create correct SELECT policy using agency_workspace_memberships
CREATE POLICY "Users can view renewals for their workspace accounts"
  ON public.renewals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      JOIN public.agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE a.id = renewals.account_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
    )
  );

-- Create correct INSERT policy
CREATE POLICY "Staff can insert renewals"
  ON public.renewals
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.accounts a
      JOIN public.agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE a.id = renewals.account_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
        AND awm.role IN ('owner', 'admin', 'producer', 'csr')
    )
  );

-- Create correct UPDATE policy
CREATE POLICY "Staff can update renewals"
  ON public.renewals
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      JOIN public.agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE a.id = renewals.account_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
        AND awm.role IN ('owner', 'admin', 'producer', 'csr')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.accounts a
      JOIN public.agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE a.id = renewals.account_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
        AND awm.role IN ('owner', 'admin', 'producer', 'csr')
    )
  );

-- Create correct DELETE policy
CREATE POLICY "Staff can delete renewals"
  ON public.renewals
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      JOIN public.agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE a.id = renewals.account_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
        AND awm.role IN ('owner', 'admin')
    )
  );

-- Also fix the renewal_risk_history table if it has the same issue
DROP POLICY IF EXISTS "Users can view risk history for their accounts" ON public.renewal_risk_history;

CREATE POLICY "Users can view risk history for their workspace accounts"
  ON public.renewal_risk_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.renewals r
      JOIN public.accounts a ON a.id = r.account_id
      JOIN public.agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE r.id = renewal_risk_history.renewal_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
    )
  );

-- Fix renewal_campaigns table if it exists and has the same issue
DROP POLICY IF EXISTS "Users can view campaigns for their accounts" ON public.renewal_campaigns;
DROP POLICY IF EXISTS "Staff can manage campaigns" ON public.renewal_campaigns;

CREATE POLICY "Users can view campaigns for their workspace accounts"
  ON public.renewal_campaigns
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.renewals r
      JOIN public.accounts a ON a.id = r.account_id
      JOIN public.agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE r.id = renewal_campaigns.renewal_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
    )
  );

CREATE POLICY "Staff can manage campaigns"
  ON public.renewal_campaigns
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.renewals r
      JOIN public.accounts a ON a.id = r.account_id
      JOIN public.agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE r.id = renewal_campaigns.renewal_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
        AND awm.role IN ('owner', 'admin', 'producer', 'csr')
    )
  );
