-- Complete fix: Break ALL circular RLS dependencies
-- Problem: accounts → is_member() → account_memberships → is_staff() → profiles → is_staff() → loop

-- Step 1: Simplify is_staff() to ONLY check profiles (no circular reference possible)
DROP FUNCTION IF EXISTS public.is_staff() CASCADE;

CREATE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- Only check profiles table, which has no policies calling is_staff()
  SELECT EXISTS (
    SELECT 1 
    FROM public.profiles 
    WHERE id = auth.uid() 
    AND (is_staff = true OR role IN ('admin', 'staff'))
  );
$$;

-- Step 2: Ensure profiles table RLS doesn't create recursion
DROP POLICY IF EXISTS "profiles_all_access" ON profiles;
DROP POLICY IF EXISTS "profiles_select_self" ON profiles;
DROP POLICY IF EXISTS "profiles_update_self" ON profiles;

-- Users can always read their own profile (no function calls)
CREATE POLICY "profiles_select_self" 
ON profiles FOR SELECT 
USING (id = auth.uid());

-- Users can update their own profile (no function calls)
CREATE POLICY "profiles_update_self" 
ON profiles FOR UPDATE 
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Staff can do everything with profiles
CREATE POLICY "profiles_all_staff"
ON profiles FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.id = auth.uid() 
    AND (p.is_staff = true OR p.role IN ('admin', 'staff'))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.id = auth.uid() 
    AND (p.is_staff = true OR p.role IN ('admin', 'staff'))
  )
);