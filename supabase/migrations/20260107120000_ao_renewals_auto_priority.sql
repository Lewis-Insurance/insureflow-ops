-- Auto-calculate priority for ao_renewals based on days until renewal_date
-- Priority rules:
--   Urgent: <= 7 days (or past due)
--   High: 8-30 days
--   Normal: 31-60 days
--   Low: > 60 days

-- =============================================================================
-- PART 1: Create priority calculation function
-- =============================================================================

CREATE OR REPLACE FUNCTION public.calculate_ao_renewal_priority(p_renewal_date DATE)
RETURNS TEXT AS $$
DECLARE
    v_days_until INTEGER;
BEGIN
    v_days_until := p_renewal_date - CURRENT_DATE;

    IF v_days_until <= 7 THEN
        RETURN 'urgent';
    ELSIF v_days_until <= 30 THEN
        RETURN 'high';
    ELSIF v_days_until <= 60 THEN
        RETURN 'normal';
    ELSE
        RETURN 'low';
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.calculate_ao_renewal_priority IS 'Calculate priority based on days until renewal: <=7=urgent, 8-30=high, 31-60=normal, >60=low';

-- =============================================================================
-- PART 2: Create trigger to auto-set priority on INSERT/UPDATE
-- =============================================================================

CREATE OR REPLACE FUNCTION public.tr_ao_renewals_auto_priority()
RETURNS TRIGGER AS $$
BEGIN
    -- Auto-calculate priority based on renewal_date
    NEW.priority := calculate_ao_renewal_priority(NEW.renewal_date);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS tr_ao_renewals_auto_priority ON public.ao_renewals;

-- Create trigger for INSERT and UPDATE
CREATE TRIGGER tr_ao_renewals_auto_priority
    BEFORE INSERT OR UPDATE OF renewal_date ON public.ao_renewals
    FOR EACH ROW
    EXECUTE FUNCTION public.tr_ao_renewals_auto_priority();

COMMENT ON TRIGGER tr_ao_renewals_auto_priority ON public.ao_renewals IS 'Auto-calculate priority when renewal is created or renewal_date changes';

-- =============================================================================
-- PART 3: Recalculate priority for ALL existing records
-- =============================================================================

UPDATE public.ao_renewals
SET priority = calculate_ao_renewal_priority(renewal_date);

-- =============================================================================
-- PART 4: Create index for priority queries (if not exists)
-- =============================================================================

-- Index already exists from original migration, but verify
CREATE INDEX IF NOT EXISTS idx_ao_renewals_priority ON public.ao_renewals(priority);

-- =============================================================================
-- Summary
-- =============================================================================
-- - Created calculate_ao_renewal_priority() function
-- - Created trigger to auto-set priority on INSERT and UPDATE of renewal_date
-- - Recalculated all existing records
-- - Priority is now automatically maintained based on days until renewal
