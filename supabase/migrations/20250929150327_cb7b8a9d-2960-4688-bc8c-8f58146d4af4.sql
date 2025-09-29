-- Fix the is_staff() function to check profiles table
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'extensions', 'public'
AS $function$
  select coalesce(
    -- Check JWT role claim
    (auth.jwt() ->> 'role') in ('staff','admin') OR
    -- Check profiles table
    exists(select 1 from public.profiles p where p.id = auth.uid() and p.is_staff = true) OR
    -- Check agents table
    exists(select 1 from public.agents a where a.user_id = auth.uid() and a.role in ('staff','admin')),
    false
  );
$function$;

-- Create account membership for the authenticated user so they can access customer accounts
INSERT INTO public.account_memberships (account_id, user_id, role)
SELECT 
  a.id as account_id,
  '40b27b11-44c7-4201-a12b-0f72a1a63fa3' as user_id,
  'staff' as role
FROM public.accounts a
WHERE a.deleted_at IS NULL
ON CONFLICT (account_id, user_id) DO UPDATE SET role = 'staff';