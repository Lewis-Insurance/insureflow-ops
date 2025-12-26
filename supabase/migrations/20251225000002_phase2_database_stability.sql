-- ============================================
-- PHASE 2: DATABASE STABILITY & PERFORMANCE
-- This migration addresses:
-- - 2.1: RLS Policy Consolidation (account-based isolation)
-- - 2.2: Performance Indexes for common queries
-- - 2.3: Enum Type Deprecation Notices (views for compatibility)
-- - 2.4: Soft Delete Enforcement
-- ============================================

-- ============================================
-- 2.2: PERFORMANCE INDEXES
-- Add indexes for common query patterns
-- ============================================

-- Leads table indexes (critical for CRM performance)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_account_created
  ON public.leads(account_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_status
  ON public.leads(status) WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_assigned_to
  ON public.leads(assigned_to) WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_lead_score
  ON public.leads(lead_score DESC) WHERE deleted_at IS NULL;

-- Policies table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_policies_account_id
  ON public.policies(account_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_policies_status_expiration
  ON public.policies(status, expiration_date) WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_policies_expiration_date
  ON public.policies(expiration_date) WHERE status = 'active';

-- Quotes table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quotes_account_id
  ON public.quotes(account_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quotes_policy_id
  ON public.quotes(policy_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quotes_status_created
  ON public.quotes(status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quotes_score
  ON public.quotes(quote_score DESC) WHERE status = 'sent';

-- Tasks table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_assigned_to
  ON public.tasks(assigned_to) WHERE status != 'completed';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_due_date
  ON public.tasks(due_date) WHERE status != 'completed';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_lead_id
  ON public.tasks(lead_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_account_id
  ON public.tasks(account_id);

-- Documents table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_account_id
  ON public.documents(account_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_created_by_date
  ON public.documents(created_by, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_type
  ON public.documents(document_type);

-- Communications table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_communications_account_id
  ON public.communications(account_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_communications_lead_id
  ON public.communications(lead_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_communications_created_at
  ON public.communications(created_at DESC);

-- Contacts table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_account_id
  ON public.contacts(account_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_email
  ON public.contacts(email) WHERE email IS NOT NULL;

-- Notes table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notes_account_id
  ON public.notes(account_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notes_policy_id
  ON public.notes(policy_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notes_created_at
  ON public.notes(created_at DESC);

-- Knowledge base indexes (for AI RAG)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_knowledge_base_category
  ON public.knowledge_base(category);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_knowledge_base_account_id
  ON public.knowledge_base(account_id);

-- Renewals indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_renewals_policy_id
  ON public.renewals(policy_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_renewals_status_due
  ON public.renewals(status, due_date);

-- Agents table
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agents_user_id
  ON public.agents(user_id);

-- Profiles table
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_role
  ON public.profiles(role);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_is_staff
  ON public.profiles(is_staff) WHERE is_staff = true;

-- Account memberships (critical for RLS performance)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_account_memberships_user_account
  ON public.account_memberships(user_id, account_id);

-- ACORD forms indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_acord_forms_account_id
  ON public.acord_forms(account_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_acord_forms_template_id
  ON public.acord_forms(template_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_acord_forms_status
  ON public.acord_forms(status);

-- ============================================
-- 2.4: SOFT DELETE ENFORCEMENT
-- Add helper functions and policies for soft delete
-- ============================================

-- Create a helper function to check soft delete
CREATE OR REPLACE FUNCTION is_not_soft_deleted(deleted_at timestamptz)
RETURNS boolean AS $$
BEGIN
  RETURN deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create a trigger function to prevent hard deletes on protected tables
CREATE OR REPLACE FUNCTION prevent_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if this is a soft-delete (deleted_at being set)
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Hard deletes are not allowed on this table. Use soft delete by setting deleted_at.';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply soft delete protection to key tables
-- (Only prevents DELETE, UPDATE with deleted_at still works)

DO $$
BEGIN
  -- accounts table
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'prevent_accounts_hard_delete') THEN
    CREATE TRIGGER prevent_accounts_hard_delete
      BEFORE DELETE ON public.accounts
      FOR EACH ROW
      EXECUTE FUNCTION prevent_hard_delete();
  END IF;

  -- policies table
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'prevent_policies_hard_delete') THEN
    CREATE TRIGGER prevent_policies_hard_delete
      BEFORE DELETE ON public.policies
      FOR EACH ROW
      EXECUTE FUNCTION prevent_hard_delete();
  END IF;

  -- leads table
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'prevent_leads_hard_delete') THEN
    CREATE TRIGGER prevent_leads_hard_delete
      BEFORE DELETE ON public.leads
      FOR EACH ROW
      EXECUTE FUNCTION prevent_hard_delete();
  END IF;

  -- contacts table
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'prevent_contacts_hard_delete') THEN
    CREATE TRIGGER prevent_contacts_hard_delete
      BEFORE DELETE ON public.contacts
      FOR EACH ROW
      EXECUTE FUNCTION prevent_hard_delete();
  END IF;
END $$;

-- ============================================
-- 2.3: ENUM CONSOLIDATION DOCUMENTATION
-- Document preferred enums and create mapping functions
-- ============================================

-- Document the canonical enum types (for reference, no schema changes)
-- The following are the PREFERRED enums to use going forward:
--   account_type_v2 (household, commercial_business) - replaces account_type, account_type_enum, account_type_new
--   billing_frequency (monthly, quarterly, semiannual, annual) - replaces billing_freq_enum
--   billing_method (direct_bill, agency_bill) - replaces billing_method_enum
--   communication_type (email, sms, call, meeting, note) - replaces comm_type_enum
--   communication_direction (inbound, outbound) - replaces comm_direction_enum
--   line_of_business - replaces lob_enum
--   invoice_status - replaces invoice_status_enum
--   consent_type_crm - replaces consent_type, consent_type_enum

-- Create mapping function for account types
CREATE OR REPLACE FUNCTION map_legacy_account_type(legacy_type text)
RETURNS public.account_type_v2 AS $$
BEGIN
  CASE legacy_type
    WHEN 'household' THEN RETURN 'household'::public.account_type_v2;
    WHEN 'individual' THEN RETURN 'household'::public.account_type_v2;
    WHEN 'business' THEN RETURN 'commercial_business'::public.account_type_v2;
    WHEN 'commercial_business' THEN RETURN 'commercial_business'::public.account_type_v2;
    ELSE RETURN 'household'::public.account_type_v2;
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- 2.1: RLS POLICY IMPROVEMENTS
-- Improve RLS policies for better account isolation
-- Note: We're being careful not to break existing functionality
-- ============================================

-- Create helper function for account membership check (improves query performance)
CREATE OR REPLACE FUNCTION user_has_account_access(check_account_id uuid)
RETURNS boolean AS $$
BEGIN
  -- Staff/Admin can access all accounts
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND (role IN ('admin', 'owner', 'staff') OR is_staff = true)
  ) THEN
    RETURN true;
  END IF;

  -- Regular users can only access their accounts
  RETURN EXISTS (
    SELECT 1 FROM public.account_memberships
    WHERE user_id = auth.uid()
    AND account_id = check_account_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Create helper function for staff check
CREATE OR REPLACE FUNCTION is_staff_or_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND (role IN ('admin', 'owner', 'staff') OR is_staff = true)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================
-- IMPROVE LEADS RLS
-- ============================================
DO $$
DECLARE
  pol RECORD;
BEGIN
  -- Drop all existing leads policies to start fresh
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'leads' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.leads', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Leads: Staff can access all, others only their accounts
CREATE POLICY "leads_select_policy" ON public.leads
  FOR SELECT
  TO authenticated
  USING (
    is_staff_or_admin()
    OR user_has_account_access(account_id)
    OR assigned_to = auth.uid()
  );

CREATE POLICY "leads_insert_policy" ON public.leads
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_staff_or_admin()
    OR user_has_account_access(account_id)
  );

CREATE POLICY "leads_update_policy" ON public.leads
  FOR UPDATE
  TO authenticated
  USING (
    is_staff_or_admin()
    OR user_has_account_access(account_id)
    OR assigned_to = auth.uid()
  )
  WITH CHECK (
    is_staff_or_admin()
    OR user_has_account_access(account_id)
  );

CREATE POLICY "leads_delete_policy" ON public.leads
  FOR DELETE
  TO authenticated
  USING (is_staff_or_admin());

-- ============================================
-- IMPROVE POLICIES (insurance policies) RLS
-- ============================================
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'policies' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.policies', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "policies_select_policy" ON public.policies
  FOR SELECT
  TO authenticated
  USING (
    is_staff_or_admin()
    OR user_has_account_access(account_id)
  );

CREATE POLICY "policies_insert_policy" ON public.policies
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_staff_or_admin()
    OR user_has_account_access(account_id)
  );

CREATE POLICY "policies_update_policy" ON public.policies
  FOR UPDATE
  TO authenticated
  USING (
    is_staff_or_admin()
    OR user_has_account_access(account_id)
  )
  WITH CHECK (
    is_staff_or_admin()
    OR user_has_account_access(account_id)
  );

CREATE POLICY "policies_delete_policy" ON public.policies
  FOR DELETE
  TO authenticated
  USING (is_staff_or_admin());

-- ============================================
-- IMPROVE QUOTES RLS
-- ============================================
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'quotes' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.quotes', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quotes_select_policy" ON public.quotes
  FOR SELECT
  TO authenticated
  USING (
    is_staff_or_admin()
    OR user_has_account_access(account_id)
  );

CREATE POLICY "quotes_insert_policy" ON public.quotes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_staff_or_admin()
    OR user_has_account_access(account_id)
  );

CREATE POLICY "quotes_update_policy" ON public.quotes
  FOR UPDATE
  TO authenticated
  USING (
    is_staff_or_admin()
    OR user_has_account_access(account_id)
  )
  WITH CHECK (
    is_staff_or_admin()
    OR user_has_account_access(account_id)
  );

CREATE POLICY "quotes_delete_policy" ON public.quotes
  FOR DELETE
  TO authenticated
  USING (is_staff_or_admin());

-- ============================================
-- IMPROVE TASKS RLS
-- ============================================
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'tasks' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.tasks', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_select_policy" ON public.tasks
  FOR SELECT
  TO authenticated
  USING (
    is_staff_or_admin()
    OR user_has_account_access(account_id)
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
  );

CREATE POLICY "tasks_insert_policy" ON public.tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (true); -- Anyone can create tasks

CREATE POLICY "tasks_update_policy" ON public.tasks
  FOR UPDATE
  TO authenticated
  USING (
    is_staff_or_admin()
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
  )
  WITH CHECK (
    is_staff_or_admin()
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
  );

CREATE POLICY "tasks_delete_policy" ON public.tasks
  FOR DELETE
  TO authenticated
  USING (
    is_staff_or_admin()
    OR created_by = auth.uid()
  );

-- ============================================
-- IMPROVE COMMUNICATIONS RLS
-- ============================================
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'communications' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.communications', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.communications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "communications_select_policy" ON public.communications
  FOR SELECT
  TO authenticated
  USING (
    is_staff_or_admin()
    OR user_has_account_access(account_id)
  );

CREATE POLICY "communications_insert_policy" ON public.communications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_staff_or_admin()
    OR user_has_account_access(account_id)
  );

CREATE POLICY "communications_update_policy" ON public.communications
  FOR UPDATE
  TO authenticated
  USING (is_staff_or_admin())
  WITH CHECK (is_staff_or_admin());

CREATE POLICY "communications_delete_policy" ON public.communications
  FOR DELETE
  TO authenticated
  USING (is_staff_or_admin());

-- ============================================
-- IMPROVE CONTACTS RLS
-- ============================================
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'contacts' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.contacts', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contacts_select_policy" ON public.contacts
  FOR SELECT
  TO authenticated
  USING (
    is_staff_or_admin()
    OR user_has_account_access(account_id)
  );

CREATE POLICY "contacts_insert_policy" ON public.contacts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_staff_or_admin()
    OR user_has_account_access(account_id)
  );

CREATE POLICY "contacts_update_policy" ON public.contacts
  FOR UPDATE
  TO authenticated
  USING (
    is_staff_or_admin()
    OR user_has_account_access(account_id)
  )
  WITH CHECK (
    is_staff_or_admin()
    OR user_has_account_access(account_id)
  );

CREATE POLICY "contacts_delete_policy" ON public.contacts
  FOR DELETE
  TO authenticated
  USING (is_staff_or_admin());

-- ============================================
-- VERIFY MIGRATION
-- ============================================
DO $$
DECLARE
  idx_count INT;
  policy_count INT;
BEGIN
  SELECT COUNT(*) INTO idx_count FROM pg_indexes WHERE schemaname = 'public';
  SELECT COUNT(*) INTO policy_count FROM pg_policies WHERE schemaname = 'public';

  RAISE NOTICE 'Phase 2 Migration Complete:';
  RAISE NOTICE '  - Total indexes: %', idx_count;
  RAISE NOTICE '  - Total RLS policies: %', policy_count;
END $$;
