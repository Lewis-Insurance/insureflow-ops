-- Fix Payment Methods: Disable RLS and seed default methods
-- Migration: 20251230200000_fix_payment_methods_and_seed.sql

-- ============================================================================
-- DISABLE RLS ON PAYMENT METHODS (it's a lookup table, similar to lines_of_business)
-- ============================================================================
ALTER TABLE payment_methods DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- MAKE ORG_ID OPTIONAL FOR NOW
-- ============================================================================
ALTER TABLE payment_methods ALTER COLUMN org_id DROP NOT NULL;

-- ============================================================================
-- DROP THE UNIQUE CONSTRAINT ON ORG_ID, NAME (allow global defaults)
-- ============================================================================
ALTER TABLE payment_methods DROP CONSTRAINT IF EXISTS payment_methods_org_id_name_key;

-- Add a new unique constraint on just name for global methods
ALTER TABLE payment_methods ADD CONSTRAINT payment_methods_name_unique UNIQUE (name);

-- ============================================================================
-- SEED DEFAULT PAYMENT METHODS (global, org_id = NULL)
-- ============================================================================
INSERT INTO payment_methods (name, type, requires_reference, requires_check_number, display_order, is_active)
VALUES
    ('Cash', 'cash', false, false, 1, true),
    ('Personal Check', 'check', false, true, 2, true),
    ('Business Check', 'check', false, true, 3, true),
    ('Credit Card', 'credit_card', true, false, 4, true),
    ('Debit Card', 'debit_card', true, false, 5, true),
    ('ACH/EFT', 'ach', true, false, 6, true),
    ('Agency Bill', 'agency_bill', true, false, 7, true),
    ('Finance Company', 'finance_company', true, false, 8, true)
ON CONFLICT (name) DO UPDATE SET
    type = EXCLUDED.type,
    requires_reference = EXCLUDED.requires_reference,
    requires_check_number = EXCLUDED.requires_check_number,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active;

-- ============================================================================
-- Also disable RLS on premium_payments for now (simplify)
-- ============================================================================
ALTER TABLE premium_payments DISABLE ROW LEVEL SECURITY;

-- Make org_id optional in premium_payments too
ALTER TABLE premium_payments ALTER COLUMN org_id DROP NOT NULL;

-- ============================================================================
-- VERIFY
-- ============================================================================
DO $$
DECLARE
  method_count INT;
BEGIN
  SELECT COUNT(*) INTO method_count FROM payment_methods WHERE is_active = true;
  RAISE NOTICE 'Active payment methods: %', method_count;
END $$;
