-- Migration: Auto-link payments to day sheets on INSERT
-- Problem: Payments were being created without org_id or day_sheet_id
-- Solution: Add trigger to automatically set these values

-- =============================================================================
-- TRIGGER FUNCTION: Ensure payment has org_id and day_sheet_id
-- =============================================================================

CREATE OR REPLACE FUNCTION ensure_payment_day_sheet()
RETURNS TRIGGER AS $$
DECLARE
    v_org_id UUID;
    v_day_sheet_id UUID;
BEGIN
    -- Step 1: Ensure org_id is set
    IF NEW.org_id IS NULL THEN
        -- Try to get org_id from the policy's account
        IF NEW.policy_id IS NOT NULL THEN
            SELECT a.agency_workspace_id INTO v_org_id
            FROM policies p
            JOIN accounts a ON p.account_id = a.id
            WHERE p.id = NEW.policy_id;
        END IF;

        -- If still null, try from account directly
        IF v_org_id IS NULL AND NEW.account_id IS NOT NULL THEN
            SELECT agency_workspace_id INTO v_org_id
            FROM accounts
            WHERE id = NEW.account_id;
        END IF;

        -- Set the org_id
        IF v_org_id IS NOT NULL THEN
            NEW.org_id := v_org_id;
        END IF;
    END IF;

    -- Step 2: Ensure day_sheet_id is set (if org_id is available)
    IF NEW.day_sheet_id IS NULL AND NEW.org_id IS NOT NULL AND NEW.received_date IS NOT NULL THEN
        -- Look for existing day sheet
        SELECT id INTO v_day_sheet_id
        FROM day_sheets
        WHERE org_id = NEW.org_id
          AND sheet_date = NEW.received_date
          AND deleted_at IS NULL
        LIMIT 1;

        -- Create if doesn't exist
        IF v_day_sheet_id IS NULL THEN
            INSERT INTO day_sheets (org_id, sheet_date, status, opened_at)
            VALUES (NEW.org_id, NEW.received_date, 'open', NOW())
            ON CONFLICT (org_id, sheet_date) DO UPDATE SET updated_at = NOW()
            RETURNING id INTO v_day_sheet_id;
        END IF;

        NEW.day_sheet_id := v_day_sheet_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- CREATE TRIGGER
-- =============================================================================

DROP TRIGGER IF EXISTS tr_ensure_payment_day_sheet ON premium_payments;

CREATE TRIGGER tr_ensure_payment_day_sheet
    BEFORE INSERT ON premium_payments
    FOR EACH ROW
    EXECUTE FUNCTION ensure_payment_day_sheet();

COMMENT ON FUNCTION ensure_payment_day_sheet() IS 'Automatically sets org_id and day_sheet_id on payment insert if not provided';
COMMENT ON TRIGGER tr_ensure_payment_day_sheet ON premium_payments IS 'Ensures payments are always linked to a day sheet';

-- =============================================================================
-- ALSO: Fix any existing payments without org_id
-- Get org_id from their policy's account
-- =============================================================================

UPDATE premium_payments pp
SET org_id = a.agency_workspace_id
FROM policies p
JOIN accounts a ON p.account_id = a.id
WHERE pp.policy_id = p.id
  AND pp.org_id IS NULL
  AND pp.deleted_at IS NULL;

-- For payments without policy, try account directly
UPDATE premium_payments pp
SET org_id = a.agency_workspace_id
FROM accounts a
WHERE pp.account_id = a.id
  AND pp.org_id IS NULL
  AND pp.deleted_at IS NULL;

-- =============================================================================
-- Link any remaining unlinked payments to day sheets
-- =============================================================================

-- First create day sheets for any dates that need them
INSERT INTO day_sheets (org_id, sheet_date, status, opened_at)
SELECT DISTINCT
    pp.org_id,
    pp.received_date,
    'open',
    NOW()
FROM premium_payments pp
WHERE pp.deleted_at IS NULL
  AND pp.org_id IS NOT NULL
  AND pp.day_sheet_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM day_sheets ds
    WHERE ds.org_id = pp.org_id
      AND ds.sheet_date = pp.received_date
      AND ds.deleted_at IS NULL
  )
ON CONFLICT (org_id, sheet_date) DO NOTHING;

-- Then link payments to their day sheets
UPDATE premium_payments pp
SET day_sheet_id = ds.id
FROM day_sheets ds
WHERE pp.org_id = ds.org_id
  AND pp.received_date = ds.sheet_date
  AND ds.deleted_at IS NULL
  AND pp.deleted_at IS NULL
  AND pp.day_sheet_id IS NULL;

-- Recalculate all day sheet totals
SELECT recalculate_day_sheet_totals(NULL);
