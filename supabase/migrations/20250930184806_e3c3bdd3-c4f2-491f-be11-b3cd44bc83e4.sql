-- Fix recursive profiles policy by removing self-referential query
DROP POLICY IF EXISTS "profiles_all_staff" ON public.profiles;

-- Recreate staff policy using SECURITY DEFINER function to avoid recursion
CREATE POLICY "profiles_all_staff"
ON public.profiles
FOR ALL
USING (public.is_staff())
WITH CHECK (public.is_staff());