-- Secure contacts table: restrict SELECT to account membership or staff
-- 1) Ensure RLS is enabled
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- 2) Drop overly-permissive SELECT policies (any authenticated user)
DROP POLICY IF EXISTS "contacts_read" ON public.contacts;
DROP POLICY IF EXISTS "contacts_read_read" ON public.contacts;

-- 3) Create strict SELECT policies
-- Allow staff to view all contacts
CREATE POLICY "contacts_select_staff"
ON public.contacts
FOR SELECT
USING (public.is_staff());

-- Allow users to view contacts only for accounts they are a member of
CREATE POLICY "contacts_select_by_membership"
ON public.contacts
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.account_memberships m
    WHERE m.account_id = public.contacts.account_id
      AND m.user_id = auth.uid()
  )
);

-- Keep existing write policy (staff only) intact. No changes to INSERT/UPDATE/DELETE.
