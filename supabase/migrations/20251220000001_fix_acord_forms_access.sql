-- Fix ACORD Forms Access
-- The acord_forms query joins to accounts, which may fail if RLS blocks it
-- This migration ensures acord_forms access works for all authenticated staff AND admins

-- 1. Update is_staff() to be comprehensive (admins are implicitly staff)
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

-- 2. Create explicit is_admin() function
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

GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- 3. Ensure acord_forms policy allows staff AND admin access
DROP POLICY IF EXISTS acord_forms_all ON acord_forms;
DROP POLICY IF EXISTS "Staff can access acord forms" ON acord_forms;
CREATE POLICY "Staff and admin can access acord forms" ON acord_forms
FOR ALL USING (public.is_staff() OR public.is_admin())
WITH CHECK (public.is_staff() OR public.is_admin());

-- 4. Ensure acord_templates is readable by all authenticated users
DROP POLICY IF EXISTS acord_templates_read ON acord_templates;
DROP POLICY IF EXISTS "Anyone can read acord templates" ON acord_templates;
CREATE POLICY "Anyone can read acord templates" ON acord_templates
FOR SELECT USING (true);

-- 5. Ensure accounts can be read via foreign key relationships
DROP POLICY IF EXISTS "accounts_read_for_fk_joins" ON accounts;
DROP POLICY IF EXISTS "staff_only_accounts_access" ON accounts;
CREATE POLICY "Staff and admin accounts access" ON accounts
FOR ALL USING (public.is_staff() OR public.is_admin())
WITH CHECK (public.is_staff() OR public.is_admin());
