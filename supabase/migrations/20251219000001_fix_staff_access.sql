-- Fix staff access: Ensure is_staff() function includes all staff roles
-- This migration ensures staff members can access the dashboard and all data

-- 1. Update the is_staff() function to be comprehensive and include all staff-like roles
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
    AND (
      is_staff = true
      OR role IN ('staff', 'admin', 'owner', 'csr', 'producer', 'accounting', 'agent')
    )
  );
$$;

-- 2. Create is_admin() function if it doesn't exist or update it
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'owner')
  );
$$;

-- 3. Ensure profiles table has required columns with defaults
DO $$
BEGIN
  -- Add is_staff column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'is_staff'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN is_staff BOOLEAN DEFAULT false;
  END IF;
END $$;

-- 4. Update is_staff for users with staff-like roles (sync is_staff column with role)
UPDATE public.profiles
SET is_staff = true
WHERE role IN ('staff', 'admin', 'owner', 'csr', 'producer', 'accounting', 'agent')
AND (is_staff IS NULL OR is_staff = false);

-- 5. Grant execute on functions to authenticated users
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- 6. Ensure RLS policies exist for staff access on key tables
-- Drop and recreate policies for accounts if they don't include staff properly
DROP POLICY IF EXISTS "staff_only_accounts_access" ON public.accounts;
CREATE POLICY "staff_only_accounts_access"
ON public.accounts FOR ALL
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- Ensure policies table has staff access
DROP POLICY IF EXISTS "staff_all_policies_access" ON public.policies;
CREATE POLICY "staff_all_policies_access"
ON public.policies FOR ALL
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- Ensure leads table has staff access
DROP POLICY IF EXISTS "staff_all_leads_access" ON public.leads;
CREATE POLICY "staff_all_leads_access"
ON public.leads FOR ALL
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- Ensure tasks table has staff access
DROP POLICY IF EXISTS "Staff can manage all tasks" ON public.tasks;
DROP POLICY IF EXISTS "Staff can access tasks" ON public.tasks;
CREATE POLICY "staff_all_tasks_access"
ON public.tasks FOR ALL
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- 7. Log what we fixed
DO $$
DECLARE
  staff_count INT;
BEGIN
  SELECT COUNT(*) INTO staff_count
  FROM public.profiles
  WHERE role IN ('staff', 'admin', 'owner', 'csr', 'producer', 'accounting', 'agent');

  RAISE NOTICE 'Fixed is_staff() function and updated % staff member profiles', staff_count;
END $$;
