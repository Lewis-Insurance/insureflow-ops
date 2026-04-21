-- Fix Payment Date Timezone Issues
-- Migration: 20260105100000_fix_payment_date_timezone.sql
--
-- Problem: The get_or_create_day_sheet function uses CURRENT_DATE which is UTC server time.
-- When users in Eastern timezone record payments after 7pm, they get assigned to the wrong day.
--
-- Solution: Modify the function to accept an explicit date parameter from the client.

-- ============================================================================
-- UPDATE get_or_create_day_sheet TO ACCEPT DATE PARAMETER
-- ============================================================================

CREATE OR REPLACE FUNCTION get_or_create_day_sheet(p_org_id UUID, p_date DATE DEFAULT NULL)
RETURNS UUID AS $$
DECLARE
    v_sheet_id UUID;
    v_target_date DATE;
BEGIN
    -- Use provided date or fall back to CURRENT_DATE (for backwards compatibility)
    v_target_date := COALESCE(p_date, CURRENT_DATE);

    -- Try to get existing open sheet for the target date
    SELECT id INTO v_sheet_id
    FROM day_sheets
    WHERE org_id = p_org_id
      AND sheet_date = v_target_date
      AND status = 'open'
      AND deleted_at IS NULL;

    -- Create if not exists
    IF v_sheet_id IS NULL THEN
        INSERT INTO day_sheets (org_id, sheet_date, opened_by)
        VALUES (p_org_id, v_target_date, auth.uid())
        RETURNING id INTO v_sheet_id;
    END IF;

    RETURN v_sheet_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FIX EXISTING PAYMENTS - REASSOCIATE WITH CORRECT DAY SHEETS
-- ============================================================================

-- Step 1: Create day sheets for any dates that need them
-- This finds payments where received_date doesn't match their day_sheet's sheet_date
INSERT INTO day_sheets (org_id, sheet_date, opened_by, status)
SELECT DISTINCT
    pp.org_id,
    pp.received_date,
    pp.received_by,
    'open'
FROM premium_payments pp
JOIN day_sheets ds ON pp.day_sheet_id = ds.id
WHERE pp.received_date != ds.sheet_date
  AND pp.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM day_sheets ds2
    WHERE ds2.org_id = pp.org_id
      AND ds2.sheet_date = pp.received_date
      AND ds2.deleted_at IS NULL
  )
ON CONFLICT (org_id, sheet_date) DO NOTHING;

-- Step 2: Update payments to point to the correct day sheet (by received_date)
UPDATE premium_payments pp
SET day_sheet_id = (
    SELECT ds.id
    FROM day_sheets ds
    WHERE ds.org_id = pp.org_id
      AND ds.sheet_date = pp.received_date
      AND ds.deleted_at IS NULL
    LIMIT 1
)
FROM day_sheets old_ds
WHERE pp.day_sheet_id = old_ds.id
  AND pp.received_date != old_ds.sheet_date
  AND pp.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM day_sheets ds
    WHERE ds.org_id = pp.org_id
      AND ds.sheet_date = pp.received_date
      AND ds.deleted_at IS NULL
  );

-- Step 3: Recalculate totals for all affected day sheets
-- First, reset all day sheet totals to 0
UPDATE day_sheets ds
SET
    total_cash = 0,
    total_checks = 0,
    total_credit_cards = 0,
    total_debit_cards = 0,
    total_ach = 0,
    total_agency_bill = 0,
    total_other = 0,
    grand_total = 0,
    payment_count = 0,
    check_count = 0
WHERE ds.deleted_at IS NULL;

-- Then recalculate based on actual payments
UPDATE day_sheets ds
SET
    total_cash = COALESCE(totals.total_cash, 0),
    total_checks = COALESCE(totals.total_checks, 0),
    total_credit_cards = COALESCE(totals.total_credit_cards, 0),
    total_debit_cards = COALESCE(totals.total_debit_cards, 0),
    total_ach = COALESCE(totals.total_ach, 0),
    total_agency_bill = COALESCE(totals.total_agency_bill, 0),
    total_other = COALESCE(totals.total_other, 0),
    grand_total = COALESCE(totals.grand_total, 0),
    payment_count = COALESCE(totals.payment_count, 0),
    check_count = COALESCE(totals.check_count, 0)
FROM (
    SELECT
        pp.day_sheet_id,
        SUM(CASE WHEN pm.type = 'cash' THEN pp.amount ELSE 0 END) as total_cash,
        SUM(CASE WHEN pm.type = 'check' THEN pp.amount ELSE 0 END) as total_checks,
        SUM(CASE WHEN pm.type = 'credit_card' THEN pp.amount ELSE 0 END) as total_credit_cards,
        SUM(CASE WHEN pm.type = 'debit_card' THEN pp.amount ELSE 0 END) as total_debit_cards,
        SUM(CASE WHEN pm.type = 'ach' THEN pp.amount ELSE 0 END) as total_ach,
        SUM(CASE WHEN pm.type = 'agency_bill' THEN pp.amount ELSE 0 END) as total_agency_bill,
        SUM(CASE WHEN pm.type IN ('finance_company', 'other') THEN pp.amount ELSE 0 END) as total_other,
        SUM(pp.amount) as grand_total,
        COUNT(pp.id) as payment_count,
        COUNT(pp.check_number) as check_count
    FROM premium_payments pp
    JOIN payment_methods pm ON pp.payment_method_id = pm.id
    WHERE pp.status = 'recorded'
      AND pp.deleted_at IS NULL
    GROUP BY pp.day_sheet_id
) totals
WHERE ds.id = totals.day_sheet_id
  AND ds.deleted_at IS NULL;

-- Step 4: Clean up any day sheets that now have no payments
-- (Mark as deleted if they have 0 payments and were created as part of this migration fix)
-- Actually, let's keep them but just note that they're empty - users may want to see the history

COMMENT ON FUNCTION get_or_create_day_sheet(UUID, DATE) IS 'Gets or creates a day sheet for the specified date. Pass explicit date to avoid UTC timezone issues.';
