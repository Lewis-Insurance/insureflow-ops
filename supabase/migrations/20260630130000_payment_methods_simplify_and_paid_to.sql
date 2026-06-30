-- Payment system simplification + "Paid To" (Company / Escrow) support
-- Migration: 20260630130000_payment_methods_simplify_and_paid_to.sql
--
-- Goals (per ops request):
--   1. Add a `paid_to` dimension to every payment: 'company' or 'escrow'.
--   2. Remove the Debit Card, Agency Bill and Finance Company methods.
--      - All existing "Debit Card" payments are reclassified as "Credit Card".
--      - Agency Bill / Finance Company are expected to have no payments.
--   3. Add a "Money Order/CC" escrow instrument.
--   4. Re-order the surviving methods so escrow instruments come first.
--   5. Backfill `paid_to` for historical payments from their method type:
--        credit_card / ach  -> company
--        cash / check       -> escrow
--
-- Method -> Paid To mapping used by the app:
--   Paid to Company : Credit Card, ACH/EFT                  (types: credit_card, ach)
--   Paid to Escrow  : Cash, Personal Check, Business Check, (types: cash, check)
--                     Money Order/CC

BEGIN;

-- ============================================================================
-- 1. Add the paid_to column (nullable; constrained to the two allowed values)
-- ============================================================================
ALTER TABLE premium_payments
    ADD COLUMN IF NOT EXISTS paid_to TEXT
    CHECK (paid_to IS NULL OR paid_to IN ('company', 'escrow'));

COMMENT ON COLUMN premium_payments.paid_to IS
    'Whether the payment was made to the company or held in escrow. Drives the day-sheet split.';

-- ============================================================================
-- 2. Add the "Money Order/CC" escrow method (idempotent, global / org_id NULL)
-- ============================================================================
INSERT INTO payment_methods (name, type, requires_reference, requires_check_number, display_order, is_active)
VALUES ('Money Order/CC', 'check', false, false, 4, true)
ON CONFLICT (name) DO UPDATE SET
    type = EXCLUDED.type,
    requires_reference = EXCLUDED.requires_reference,
    requires_check_number = EXCLUDED.requires_check_number,
    display_order = EXCLUDED.display_order,
    is_active = true,
    deleted_at = NULL;

-- ============================================================================
-- 3. Reclassify all Debit Card payments as Credit Card
-- ============================================================================
UPDATE premium_payments
SET payment_method_id = (
        SELECT id FROM payment_methods WHERE name = 'Credit Card' ORDER BY created_at LIMIT 1
    )
WHERE payment_method_id IN (
        SELECT id FROM payment_methods WHERE type = 'debit_card'
    );

-- ============================================================================
-- 4. Deactivate the removed methods (soft delete; keep rows for audit/history)
-- ============================================================================
UPDATE payment_methods
SET is_active = false,
    deleted_at = COALESCE(deleted_at, now())
WHERE type IN ('debit_card', 'agency_bill', 'finance_company');

-- ============================================================================
-- 5. Re-order the surviving methods (escrow instruments first, then company)
-- ============================================================================
UPDATE payment_methods SET display_order = 1, is_active = true, deleted_at = NULL WHERE name = 'Cash';
UPDATE payment_methods SET display_order = 2, is_active = true, deleted_at = NULL WHERE name = 'Personal Check';
UPDATE payment_methods SET display_order = 3, is_active = true, deleted_at = NULL WHERE name = 'Business Check';
UPDATE payment_methods SET display_order = 4, is_active = true, deleted_at = NULL WHERE name = 'Money Order/CC';
UPDATE payment_methods SET display_order = 5, is_active = true, deleted_at = NULL WHERE name = 'Credit Card';
UPDATE payment_methods SET display_order = 6, is_active = true, deleted_at = NULL WHERE name = 'ACH/EFT';

-- ============================================================================
-- 6. Backfill paid_to for historical payments from their (post-reclass) method
--    Escrow instruments (cash/check, incl. Money Order/CC) -> escrow.
--    Electronic / agency-side instruments -> company. This also covers the
--    handful of legacy agency_bill / finance_company rows so none are orphaned.
-- ============================================================================
UPDATE premium_payments pp
SET paid_to = CASE
        WHEN pm.type IN ('cash', 'check') THEN 'escrow'
        ELSE 'company'
    END
FROM payment_methods pm
WHERE pp.payment_method_id = pm.id
  AND pp.paid_to IS NULL;

-- ============================================================================
-- VERIFY
-- ============================================================================
DO $$
DECLARE
    active_methods INT;
    null_paid_to INT;
BEGIN
    SELECT COUNT(*) INTO active_methods FROM payment_methods WHERE is_active = true AND deleted_at IS NULL;
    SELECT COUNT(*) INTO null_paid_to FROM premium_payments WHERE paid_to IS NULL AND deleted_at IS NULL;
    RAISE NOTICE 'Active payment methods: % | payments still missing paid_to: %', active_methods, null_paid_to;
END $$;

COMMIT;
