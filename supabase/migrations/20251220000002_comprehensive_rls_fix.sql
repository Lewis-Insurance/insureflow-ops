-- ============================================
-- COMPREHENSIVE RLS FIX FOR ACORD FORMS
-- This migration drops ALL conflicting policies and creates clean ones
-- Run in SQL Editor, then RESTART the Supabase project to clear schema cache
-- ============================================

-- ============================================
-- 1. DROP ALL EXISTING POLICIES ON KEY TABLES
-- ============================================

-- Drop all policies on accounts table
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'accounts' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.accounts', pol.policyname);
  END LOOP;
END $$;

-- Drop all policies on acord_forms table
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'acord_forms' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.acord_forms', pol.policyname);
  END LOOP;
END $$;

-- Drop all policies on acord_templates table
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'acord_templates' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.acord_templates', pol.policyname);
  END LOOP;
END $$;

-- ============================================
-- 2. ENSURE RLS IS ENABLED ON ALL TABLES
-- ============================================

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acord_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acord_templates ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 3. CREATE CLEAN, SIMPLE POLICIES
-- ============================================

-- Accounts: All authenticated users can access
CREATE POLICY "authenticated_users_accounts" ON public.accounts
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- ACORD Forms: All authenticated users can access
CREATE POLICY "authenticated_users_acord_forms" ON public.acord_forms
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- ACORD Templates: All authenticated users can read, write
CREATE POLICY "authenticated_users_acord_templates" ON public.acord_templates
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- ============================================
-- 4. VERIFY POLICIES ARE IN PLACE
-- ============================================

-- This will show the policies we just created
DO $$
DECLARE
  accts_count INT;
  forms_count INT;
  templates_count INT;
BEGIN
  SELECT COUNT(*) INTO accts_count FROM pg_policies WHERE tablename = 'accounts' AND schemaname = 'public';
  SELECT COUNT(*) INTO forms_count FROM pg_policies WHERE tablename = 'acord_forms' AND schemaname = 'public';
  SELECT COUNT(*) INTO templates_count FROM pg_policies WHERE tablename = 'acord_templates' AND schemaname = 'public';

  RAISE NOTICE 'Policies created: accounts=%, acord_forms=%, acord_templates=%', accts_count, forms_count, templates_count;
END $$;

-- ============================================
-- 5. FIX: Ensure foreign key relationships are properly defined
-- ============================================

-- Verify the FK from acord_forms to acord_templates exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_type = 'FOREIGN KEY'
    AND table_name = 'acord_forms'
    AND constraint_name LIKE '%template%'
  ) THEN
    RAISE NOTICE 'WARNING: Foreign key from acord_forms to acord_templates may be missing';
  ELSE
    RAISE NOTICE 'FK from acord_forms.template_id to acord_templates exists';
  END IF;
END $$;

-- ============================================
-- 6. GRANT USAGE ON SCHEMA
-- ============================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ============================================
-- IMPORTANT: After running this migration:
-- 1. Go to Supabase Dashboard > Settings > API
-- 2. Click "Reload schema cache" or restart the project
-- ============================================
