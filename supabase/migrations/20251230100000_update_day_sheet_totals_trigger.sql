-- Migration: Add trigger to update day sheet totals in real-time
-- This ensures day_sheets.grand_total, payment_count, etc. are always current

-- Function to update day sheet totals when payments change
CREATE OR REPLACE FUNCTION update_day_sheet_totals()
RETURNS TRIGGER AS $$
DECLARE
    v_day_sheet_id UUID;
    v_totals RECORD;
BEGIN
    -- Determine which day_sheet_id to update
    IF TG_OP = 'DELETE' THEN
        v_day_sheet_id := OLD.day_sheet_id;
    ELSE
        v_day_sheet_id := NEW.day_sheet_id;
    END IF;

    -- Also update old day_sheet_id if it changed
    IF TG_OP = 'UPDATE' AND OLD.day_sheet_id IS DISTINCT FROM NEW.day_sheet_id THEN
        -- Update the old day sheet first
        IF OLD.day_sheet_id IS NOT NULL THEN
            SELECT * INTO v_totals FROM calculate_day_sheet_totals(OLD.day_sheet_id);

            UPDATE day_sheets SET
                total_cash = v_totals.total_cash,
                total_checks = v_totals.total_checks,
                total_credit_cards = v_totals.total_credit_cards,
                total_debit_cards = v_totals.total_debit_cards,
                total_ach = v_totals.total_ach,
                total_agency_bill = v_totals.total_agency_bill,
                total_other = v_totals.total_other,
                grand_total = v_totals.grand_total,
                payment_count = v_totals.payment_count,
                check_count = v_totals.check_count
            WHERE id = OLD.day_sheet_id;
        END IF;
    END IF;

    -- Update the current day sheet totals
    IF v_day_sheet_id IS NOT NULL THEN
        SELECT * INTO v_totals FROM calculate_day_sheet_totals(v_day_sheet_id);

        UPDATE day_sheets SET
            total_cash = v_totals.total_cash,
            total_checks = v_totals.total_checks,
            total_credit_cards = v_totals.total_credit_cards,
            total_debit_cards = v_totals.total_debit_cards,
            total_ach = v_totals.total_ach,
            total_agency_bill = v_totals.total_agency_bill,
            total_other = v_totals.total_other,
            grand_total = v_totals.grand_total,
            payment_count = v_totals.payment_count,
            check_count = v_totals.check_count
        WHERE id = v_day_sheet_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on premium_payments table
DROP TRIGGER IF EXISTS update_day_sheet_totals_on_payment_change ON premium_payments;

CREATE TRIGGER update_day_sheet_totals_on_payment_change
    AFTER INSERT OR UPDATE OR DELETE ON premium_payments
    FOR EACH ROW
    EXECUTE FUNCTION update_day_sheet_totals();

-- Also recalculate totals for all existing day sheets that have payments
-- This is a one-time fix for any day sheets that were created before this trigger
DO $$
DECLARE
    ds_record RECORD;
    v_totals RECORD;
BEGIN
    FOR ds_record IN
        SELECT DISTINCT ds.id
        FROM day_sheets ds
        JOIN premium_payments pp ON pp.day_sheet_id = ds.id
        WHERE ds.deleted_at IS NULL
    LOOP
        SELECT * INTO v_totals FROM calculate_day_sheet_totals(ds_record.id);

        UPDATE day_sheets SET
            total_cash = v_totals.total_cash,
            total_checks = v_totals.total_checks,
            total_credit_cards = v_totals.total_credit_cards,
            total_debit_cards = v_totals.total_debit_cards,
            total_ach = v_totals.total_ach,
            total_agency_bill = v_totals.total_agency_bill,
            total_other = v_totals.total_other,
            grand_total = v_totals.grand_total,
            payment_count = v_totals.payment_count,
            check_count = v_totals.check_count
        WHERE id = ds_record.id;
    END LOOP;
END $$;

COMMENT ON FUNCTION update_day_sheet_totals() IS 'Updates day sheet totals in real-time when payments are inserted, updated, or deleted';
