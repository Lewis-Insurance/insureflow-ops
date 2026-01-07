-- Create RPC function for bulk priority recalculation
-- Called by the daily scheduled job

CREATE OR REPLACE FUNCTION public.recalculate_all_ao_priorities()
RETURNS INTEGER AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    -- Update all records where priority doesn't match calculated value
    WITH updated AS (
        UPDATE public.ao_renewals
        SET priority = calculate_ao_renewal_priority(renewal_date),
            updated_at = now()
        WHERE priority IS DISTINCT FROM calculate_ao_renewal_priority(renewal_date)
        RETURNING id
    )
    SELECT COUNT(*) INTO v_updated_count FROM updated;

    RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.recalculate_all_ao_priorities IS 'Recalculate priority for all ao_renewals based on current date. Returns count of updated records.';

-- Grant execute to service role for edge function access
GRANT EXECUTE ON FUNCTION public.recalculate_all_ao_priorities() TO service_role;
