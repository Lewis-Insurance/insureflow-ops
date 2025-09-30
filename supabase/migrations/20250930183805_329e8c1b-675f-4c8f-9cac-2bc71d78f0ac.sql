-- Make is_staff() SECURITY DEFINER to avoid RLS recursion on agents/profiles
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'extensions', 'public'
AS $function$
  select coalesce(
    -- Check JWT role claim
    (auth.jwt() ->> 'role') in ('staff','admin') OR
    -- Check profiles table (bypass RLS via SECURITY DEFINER)
    exists(select 1 from public.profiles p where p.id = auth.uid() and p.is_staff = true) OR
    -- Check agents table (bypass RLS via SECURITY DEFINER)
    exists(select 1 from public.agents a where a.user_id = auth.uid() and a.role in ('staff','admin')),
    false
  );
$function$;