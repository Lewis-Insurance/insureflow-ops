-- Check and update accounts RLS policies correctly

-- Drop all existing accounts policies to ensure clean slate
DROP POLICY IF EXISTS "accounts_staff_rw" ON public.accounts;
DROP POLICY IF EXISTS "accounts_staff_read" ON public.accounts; 
DROP POLICY IF EXISTS "accounts_by_membership" ON public.accounts;
DROP POLICY IF EXISTS "accounts_write_by_membership" ON public.accounts;
DROP POLICY IF EXISTS "accounts_update_by_membership" ON public.accounts;

-- Create new staff read-write policy (covers all operations for staff)
CREATE POLICY "accounts_staff_rw"
ON public.accounts
FOR ALL 
TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

-- Create customer read policy (unchanged from original intent)
CREATE POLICY "accounts_by_membership"
ON public.accounts
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.account_memberships m
  WHERE m.account_id = accounts.id
    AND m.user_id = auth.uid()
));

-- Create separate insert and update policies for membership-based access
CREATE POLICY "accounts_write_by_membership"
ON public.accounts
FOR INSERT
TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.account_memberships m
  WHERE m.account_id = accounts.id
    AND m.user_id = auth.uid()
    AND m.role IN ('owner','staff')
));

CREATE POLICY "accounts_update_by_membership"
ON public.accounts
FOR UPDATE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.account_memberships m
  WHERE m.account_id = accounts.id
    AND m.user_id = auth.uid()
    AND m.role IN ('owner','staff')
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.account_memberships m
  WHERE m.account_id = accounts.id
    AND m.user_id = auth.uid()
    AND m.role IN ('owner','staff')
));