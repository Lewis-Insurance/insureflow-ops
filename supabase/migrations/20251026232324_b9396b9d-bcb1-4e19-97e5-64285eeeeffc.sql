-- Fix auto_score_lead_trigger to use correct column and function
CREATE OR REPLACE FUNCTION public.auto_score_lead_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_should_score BOOLEAN := FALSE;
BEGIN
    -- Decide when to score
    IF TG_OP = 'INSERT' THEN
        v_should_score := TRUE;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Use correct column names that exist on leads
        v_should_score := (
            OLD.insurance_types IS DISTINCT FROM NEW.insurance_types OR
            OLD.estimated_premium IS DISTINCT FROM NEW.estimated_premium OR
            OLD.decision_timeframe IS DISTINCT FROM NEW.decision_timeframe OR
            OLD.source_id IS DISTINCT FROM NEW.source_id OR
            OLD.last_contact_at IS DISTINCT FROM NEW.last_contact_at OR
            OLD.status IS DISTINCT FROM NEW.status
        );
    END IF;

    -- Inline scoring via existing SQL function (sync)
    IF v_should_score THEN
        PERFORM public.calculate_lead_score(NEW.id);
    END IF;

    RETURN NEW;
END;
$function$;