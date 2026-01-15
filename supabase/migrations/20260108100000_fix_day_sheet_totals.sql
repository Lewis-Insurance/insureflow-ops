-- Migration: Fix Day Sheet Totals for Jan 6-7 and Future
-- Problem: Day sheets exist but show $0 totals despite having payments
-- Solution:
--   1. Ensure day sheets exist for all dates with payments
--   2. Re-associate payments with correct day sheets based on received_date
--   3. Recalculate all day sheet totals

-- =============================================================================
-- STEP 1: Create day sheets for any dates that have payments but no sheet
-- =============================================================================

INSERT INTO day_sheets (org_id, sheet_date, status, opened_at)
SELECT DISTINCT
    pp.org_id,
    pp.received_date,
    'open',
    MIN(pp.created_at)
FROM premium_payments pp
WHERE pp.deleted_at IS NULL
  AND pp.org_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM day_sheets ds
    WHERE ds.org_id = pp.org_id
      AND ds.sheet_date = pp.received_date
      AND ds.deleted_at IS NULL
  )
GROUP BY pp.org_id, pp.received_date
ON CONFLICT (org_id, sheet_date) DO NOTHING;

-- =============================================================================
-- STEP 2: Re-associate payments with correct day sheets by received_date
-- This fixes any payments that might be linked to the wrong day sheet
-- =============================================================================

UPDATE premium_payments pp
SET day_sheet_id = ds.id
FROM day_sheets ds
WHERE pp.org_id = ds.org_id
  AND pp.received_date = ds.sheet_date
  AND ds.deleted_at IS NULL
  AND pp.deleted_at IS NULL
  AND (pp.day_sheet_id IS NULL OR pp.day_sheet_id != ds.id);

-- =============================================================================
-- STEP 3: Recalculate totals for ALL day sheets
-- =============================================================================

DO $$
DECLARE
    ds_record RECORD;
    v_totals RECORD;
BEGIN
    FOR ds_record IN
        SELECT ds.id
        FROM day_sheets ds
        WHERE ds.deleted_at IS NULL
    LOOP
        -- Calculate totals using the calculate_day_sheet_totals function
        SELECT * INTO v_totals FROM calculate_day_sheet_totals(ds_record.id);

        -- Update the day sheet with calculated totals
        UPDATE day_sheets SET
            total_cash = COALESCE(v_totals.total_cash, 0),
            total_checks = COALESCE(v_totals.total_checks, 0),
            total_credit_cards = COALESCE(v_totals.total_credit_cards, 0),
            total_debit_cards = COALESCE(v_totals.total_debit_cards, 0),
            total_ach = COALESCE(v_totals.total_ach, 0),
            total_agency_bill = COALESCE(v_totals.total_agency_bill, 0),
            total_other = COALESCE(v_totals.total_other, 0),
            grand_total = COALESCE(v_totals.grand_total, 0),
            payment_count = COALESCE(v_totals.payment_count, 0),
            check_count = COALESCE(v_totals.check_count, 0),
            updated_at = NOW()
        WHERE id = ds_record.id;
    END LOOP;
END $$;

-- =============================================================================
-- STEP 4: Create RPC function for manual recalculation (admin use)
-- =============================================================================

CREATE OR REPLACE FUNCTION recalculate_day_sheet_totals(p_day_sheet_id UUID DEFAULT NULL)
RETURNS TABLE (
    day_sheet_id UUID,
    sheet_date DATE,
    old_total NUMERIC,
    new_total NUMERIC,
    payment_count INTEGER
) AS $$
DECLARE
    ds_record RECORD;
    v_totals RECORD;
    v_old_total NUMERIC;
BEGIN
    FOR ds_record IN
        SELECT ds.id, ds.sheet_date, ds.grand_total
        FROM day_sheets ds
        WHERE ds.deleted_at IS NULL
          AND (p_day_sheet_id IS NULL OR ds.id = p_day_sheet_id)
    LOOP
        v_old_total := ds_record.grand_total;

        -- Calculate totals
        SELECT * INTO v_totals FROM calculate_day_sheet_totals(ds_record.id);

        -- Update the day sheet
        UPDATE day_sheets SET
            total_cash = COALESCE(v_totals.total_cash, 0),
            total_checks = COALESCE(v_totals.total_checks, 0),
            total_credit_cards = COALESCE(v_totals.total_credit_cards, 0),
            total_debit_cards = COALESCE(v_totals.total_debit_cards, 0),
            total_ach = COALESCE(v_totals.total_ach, 0),
            total_agency_bill = COALESCE(v_totals.total_agency_bill, 0),
            total_other = COALESCE(v_totals.total_other, 0),
            grand_total = COALESCE(v_totals.grand_total, 0),
            payment_count = COALESCE(v_totals.payment_count, 0),
            check_count = COALESCE(v_totals.check_count, 0),
            updated_at = NOW()
        WHERE id = ds_record.id;

        -- Return results
        day_sheet_id := ds_record.id;
        sheet_date := ds_record.sheet_date;
        old_total := v_old_total;
        new_total := COALESCE(v_totals.grand_total, 0);
        payment_count := COALESCE(v_totals.payment_count, 0);
        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION recalculate_day_sheet_totals IS 'Recalculates day sheet totals. Call with NULL to recalculate all, or pass specific day_sheet_id.';

-- Grant to authenticated users (staff can call this)
GRANT EXECUTE ON FUNCTION recalculate_day_sheet_totals(UUID) TO authenticated;
