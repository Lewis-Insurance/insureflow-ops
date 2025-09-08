-- Update accounts RLS policies (retry after deadlock)

-- Drop existing policies
DROP POLICY IF EXISTS "accounts_staff_read" ON public.accounts;
DROP POLICY IF EXISTS "accounts_write_by_membership" ON public.accounts;
DROP POLICY IF EXISTS "accounts_update_by_membership" ON public.accounts;

-- Create new staff read-write policy (non-restrictive)
CREATE POLICY "accounts_staff_rw"
ON public.accounts
FOR ALL 
TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

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