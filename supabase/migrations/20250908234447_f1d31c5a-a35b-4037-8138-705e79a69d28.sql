-- Allow staff or account members to SELECT accounts
CREATE POLICY IF NOT EXISTS "accounts_select_staff_or_member"
ON public.accounts
FOR SELECT
USING (
  COALESCE((auth.jwt() ->> 'is_staff')::boolean, false) OR
  EXISTS (
    SELECT 1 FROM public.account_memberships m
    WHERE m.account_id = accounts.id
      AND m.user_id = auth.uid()
  )
);