-- Day Sheet Date dimension + paid_to integrity hardening
-- Migration: 20260630170000_day_sheet_date_and_paid_to_guards.sql
--
-- Goals (per ops request):
--   1. Add premium_payments.day_sheet_date -- the date that decides WHICH day
--      sheet a payment belongs to, decoupled from received_date (when the
--      customer actually paid). A payment is sometimes taken one day but booked
--      onto another day's sheet.
--   2. Backfill day_sheet_date with ZERO movement: copy the date of the day
--      sheet each payment is already linked to; fall back to received_date for
--      payments not on a sheet. (Verified on prod: 768/950 linked, 764 already
--      equal received_date, 4 genuine off-day cases, 182 unlinked.)
--   3. Repoint day-sheet assignment from received_date -> day_sheet_date and
--      make it re-link on UPDATE, so editing the date moves the payment.
--   4. Harden paid_to: backfill any NULL, reassign the lone Finance Company
--      payment to ACH/EFT, and enforce that paid_to is present and compatible
--      with the method type -- so a payment can never silently drop off the
--      day-sheet escrow/company split again.
--
-- NOTE: no explicit BEGIN/COMMIT -- this is applied via Supabase migration
-- tooling which wraps the whole file in a single transaction. The final DO
-- block RAISEs on any inconsistency, rolling the whole thing back.

-- ============================================================================
-- 1. day_sheet_date column (nullable for backfill; trigger guarantees fill)
-- ============================================================================
ALTER TABLE premium_payments
    ADD COLUMN IF NOT EXISTS day_sheet_date DATE;

COMMENT ON COLUMN premium_payments.day_sheet_date IS
    'Date that determines which day sheet this payment lands on. Defaults to received_date but can differ (payment taken one day, booked to another). Drives day_sheet_id via tr_ensure_payment_day_sheet.';

-- Zero-movement backfill: keep every payment on the exact sheet it is on now.
UPDATE premium_payments pp
SET day_sheet_date = ds.sheet_date
FROM day_sheets ds
WHERE pp.day_sheet_id = ds.id
  AND pp.day_sheet_date IS NULL;

-- Payments not linked to any sheet -> use received_date.
UPDATE premium_payments
SET day_sheet_date = received_date
WHERE day_sheet_date IS NULL;

-- ============================================================================
-- 2. paid_to hardening: reassign Finance Company -> ACH/EFT, backfill NULLs
-- ============================================================================
-- Reassign the (now deactivated) Finance Company / Agency Bill payments to
-- ACH/EFT so they count in the method breakdown. paid_to stays 'company'.
-- The AFTER-update totals trigger recomputes the affected day sheet.
UPDATE premium_payments
SET payment_method_id = (SELECT id FROM payment_methods WHERE name = 'ACH/EFT' ORDER BY created_at LIMIT 1)
WHERE payment_method_id IN (
    SELECT id FROM payment_methods WHERE type IN ('finance_company', 'agency_bill')
);

-- Backfill any remaining NULL paid_to from the (post-reassign) method type.
UPDATE premium_payments pp
SET paid_to = CASE WHEN pm.type IN ('cash', 'check') THEN 'escrow' ELSE 'company' END
FROM payment_methods pm
WHERE pp.payment_method_id = pm.id
  AND pp.paid_to IS NULL;

-- Catch-all for any orphaned rows (no matching method) so NOT NULL can be set.
UPDATE premium_payments SET paid_to = 'company' WHERE paid_to IS NULL;

-- ============================================================================
-- 3. Repoint day-sheet assignment to day_sheet_date (+ re-link on UPDATE)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ensure_payment_day_sheet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_org_id UUID;
    v_day_sheet_id UUID;
    v_target_date DATE;
BEGIN
    -- Step 1: Ensure org_id is set (unchanged logic).
    IF NEW.org_id IS NULL THEN
        IF NEW.policy_id IS NOT NULL THEN
            SELECT a.agency_workspace_id INTO v_org_id
            FROM policies p
            JOIN accounts a ON p.account_id = a.id
            WHERE p.id = NEW.policy_id;
        END IF;

        IF v_org_id IS NULL AND NEW.account_id IS NOT NULL THEN
            SELECT agency_workspace_id INTO v_org_id
            FROM accounts
            WHERE id = NEW.account_id;
        END IF;

        IF v_org_id IS NOT NULL THEN
            NEW.org_id := v_org_id;
        END IF;
    END IF;

    -- Step 2: day_sheet_date drives assignment; default it to received_date.
    IF NEW.day_sheet_date IS NULL THEN
        NEW.day_sheet_date := NEW.received_date;
    END IF;
    v_target_date := NEW.day_sheet_date;

    -- Step 3: (Re)link to the day sheet for v_target_date when needed:
    --   * INSERT with no explicit day_sheet_id, or
    --   * UPDATE where day_sheet_date changed.
    IF NEW.org_id IS NOT NULL AND v_target_date IS NOT NULL AND (
         (TG_OP = 'INSERT' AND NEW.day_sheet_id IS NULL) OR
         (TG_OP = 'UPDATE' AND NEW.day_sheet_date IS DISTINCT FROM OLD.day_sheet_date)
       ) THEN
        SELECT id INTO v_day_sheet_id
        FROM day_sheets
        WHERE org_id = NEW.org_id
          AND sheet_date = v_target_date
          AND deleted_at IS NULL
        LIMIT 1;

        IF v_day_sheet_id IS NULL THEN
            INSERT INTO day_sheets (org_id, sheet_date, status, opened_at)
            VALUES (NEW.org_id, v_target_date, 'open', NOW())
            ON CONFLICT (org_id, sheet_date) DO UPDATE SET updated_at = NOW()
            RETURNING id INTO v_day_sheet_id;
        END IF;

        NEW.day_sheet_id := v_day_sheet_id;
    END IF;

    RETURN NEW;
END;
$function$;

-- Recreate the trigger so it also fires on UPDATE (was INSERT-only).
DROP TRIGGER IF EXISTS tr_ensure_payment_day_sheet ON premium_payments;
CREATE TRIGGER tr_ensure_payment_day_sheet
    BEFORE INSERT OR UPDATE ON premium_payments
    FOR EACH ROW EXECUTE FUNCTION ensure_payment_day_sheet();

-- ============================================================================
-- 4. paid_to integrity: derive-if-missing + method compatibility guard
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_payment_paid_to()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_type TEXT;
BEGIN
    SELECT type INTO v_type FROM payment_methods WHERE id = NEW.payment_method_id;

    -- Derive paid_to from the method when not supplied.
    IF NEW.paid_to IS NULL THEN
        IF v_type IN ('cash', 'check') THEN
            NEW.paid_to := 'escrow';
        ELSIF v_type IN ('credit_card', 'ach') THEN
            NEW.paid_to := 'company';
        ELSE
            RAISE EXCEPTION 'Cannot derive paid_to for payment method type %; set paid_to explicitly', v_type;
        END IF;
    END IF;

    -- Enforce method/paid_to compatibility.
    IF NEW.paid_to = 'company' AND v_type NOT IN ('credit_card', 'ach') THEN
        RAISE EXCEPTION 'Paid to Company requires a Credit Card or ACH/EFT method (got %)', v_type;
    ELSIF NEW.paid_to = 'escrow' AND v_type NOT IN ('cash', 'check') THEN
        RAISE EXCEPTION 'Paid to Escrow requires Cash or a Check method (got %)', v_type;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_enforce_payment_paid_to ON premium_payments;
CREATE TRIGGER tr_enforce_payment_paid_to
    BEFORE INSERT OR UPDATE ON premium_payments
    FOR EACH ROW EXECUTE FUNCTION enforce_payment_paid_to();

-- ============================================================================
-- 5. Lock both columns down now that every row is populated and consistent
-- ============================================================================
ALTER TABLE premium_payments ALTER COLUMN day_sheet_date SET NOT NULL;
ALTER TABLE premium_payments ALTER COLUMN paid_to SET NOT NULL;

-- ============================================================================
-- VERIFY (fail loudly -> rolls back the whole migration)
-- ============================================================================
DO $$
DECLARE
    v_null_dsd INT;
    v_null_pt INT;
    v_incompat INT;
BEGIN
    SELECT COUNT(*) INTO v_null_dsd FROM premium_payments WHERE day_sheet_date IS NULL;
    SELECT COUNT(*) INTO v_null_pt  FROM premium_payments WHERE paid_to IS NULL;
    SELECT COUNT(*) INTO v_incompat
    FROM premium_payments pp
    JOIN payment_methods pm ON pm.id = pp.payment_method_id
    WHERE pp.deleted_at IS NULL
      AND ((pp.paid_to = 'company' AND pm.type NOT IN ('credit_card', 'ach'))
        OR (pp.paid_to = 'escrow'  AND pm.type NOT IN ('cash', 'check')));

    IF v_null_dsd > 0 OR v_null_pt > 0 OR v_incompat > 0 THEN
        RAISE EXCEPTION 'Integrity check failed: % null day_sheet_date, % null paid_to, % incompatible paid_to',
            v_null_dsd, v_null_pt, v_incompat;
    END IF;

    RAISE NOTICE 'OK: day_sheet_date + paid_to backfilled, locked NOT NULL, and consistent with method types.';
END $$;
