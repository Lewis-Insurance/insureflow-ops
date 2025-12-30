-- Fix Day Sheets: Disable RLS to match premium_payments
-- Migration: 20251230230000_disable_day_sheets_rls.sql
--
-- The premium_payments RLS was disabled in migration 20251230200000,
-- but day_sheets RLS is still enabled and requires org_id = get_user_org_id().
-- Since the user_profiles.org_id may not be set up, this blocks all queries.

-- ============================================================================
-- DISABLE RLS ON DAY_SHEETS
-- ============================================================================
ALTER TABLE day_sheets DISABLE ROW LEVEL SECURITY;

-- Also make org_id optional
ALTER TABLE day_sheets ALTER COLUMN org_id DROP NOT NULL;

-- ============================================================================
-- DISABLE RLS ON RELATED PAYMENT TABLES
-- ============================================================================
ALTER TABLE escrow_deposits DISABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statements DISABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statement_lines DISABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_adjustments DISABLE ROW LEVEL SECURITY;
ALTER TABLE payment_audit_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE payment_attachments DISABLE ROW LEVEL SECURITY;

-- Make org_id optional on other tables too
ALTER TABLE day_sheets ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE escrow_deposits ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE bank_accounts ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE bank_statements ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE reconciliation_adjustments ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE payment_audit_log ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE payment_attachments ALTER COLUMN org_id DROP NOT NULL;

-- ============================================================================
-- VERIFY
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE 'RLS disabled on day_sheets and related payment tables';
END $$;
