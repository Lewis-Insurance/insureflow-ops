-- Migration: Fix policies INSERT and communications call logging
-- Date: 2026-02-09
-- Purpose: Two bugs preventing Add Policy and Log Call on customer page
--
-- Bug 1: policies INSERT triggers bump_ip_search_from_related() which runs as
--   SECURITY INVOKER and UPDATEs insured_profiles. That table's RLS requires
--   account_memberships but staff use agency_workspace_memberships → RLS error.
--   Fix: Make the trigger function SECURITY DEFINER (it just updates search vectors).
--
-- Bug 2: insured_profiles RLS uses account_memberships (customer portal) but staff
--   only have agency_workspace_memberships. Fix: Add workspace-based policy.

-- ============================================================
-- PART 1: FIX THE ROOT CAUSE - bump_ip_search_from_related trigger
-- ============================================================

-- Recreate as SECURITY DEFINER so it bypasses RLS when updating search vectors
CREATE OR REPLACE FUNCTION public.bump_ip_search_from_related()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare v_account uuid;
begin
  v_account := coalesce(new.account_id, old.account_id);
  if v_account is null then
    return null;
  end if;

  -- Update ONLY the search_vector to avoid firing the BEFORE trigger
  update public.insured_profiles ip
  set search_vector = public.compute_insured_search_vector(v_account)
  where ip.account_id = v_account;

  return null;
end
$$;

-- ============================================================
-- PART 2: FIX insured_profiles RLS for staff users
-- ============================================================
-- Add workspace-based policies so staff can read/write insured_profiles
-- without needing account_memberships rows

-- Staff SELECT: workspace members can view insured profiles for their accounts
DO $$
BEGIN
  -- Only create if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'insured_profiles'
    AND policyname = 'insured_profiles_select_by_workspace'
    AND schemaname = 'public'
  ) THEN
    EXECUTE 'CREATE POLICY "insured_profiles_select_by_workspace"
      ON public.insured_profiles
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.accounts a
          JOIN public.agency_workspace_memberships awm
            ON awm.agency_workspace_id = a.agency_workspace_id
          WHERE a.id = insured_profiles.account_id
            AND awm.user_id = auth.uid()
            AND awm.status = ''active''
        )
      )';
  END IF;
END $$;

-- Staff ALL: workspace members with staff roles can write insured profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'insured_profiles'
    AND policyname = 'insured_profiles_write_by_workspace'
    AND schemaname = 'public'
  ) THEN
    EXECUTE 'CREATE POLICY "insured_profiles_write_by_workspace"
      ON public.insured_profiles
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.accounts a
          JOIN public.agency_workspace_memberships awm
            ON awm.agency_workspace_id = a.agency_workspace_id
          WHERE a.id = insured_profiles.account_id
            AND awm.user_id = auth.uid()
            AND awm.status = ''active''
            AND awm.role IN (''owner'', ''admin'', ''producer'', ''csr'')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.accounts a
          JOIN public.agency_workspace_memberships awm
            ON awm.agency_workspace_id = a.agency_workspace_id
          WHERE a.id = insured_profiles.account_id
            AND awm.user_id = auth.uid()
            AND awm.status = ''active''
            AND awm.role IN (''owner'', ''admin'', ''producer'', ''csr'')
        )
      )';
  END IF;
END $$;

-- ============================================================
-- PART 3: VERIFY
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE 'Fixed: bump_ip_search_from_related is now SECURITY DEFINER';
  RAISE NOTICE 'Fixed: insured_profiles now has workspace-based RLS policies';
  RAISE NOTICE 'Verify with: SELECT policyname, cmd FROM pg_policies WHERE tablename = ''insured_profiles'';';
END $$;
