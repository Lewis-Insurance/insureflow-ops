-- Drop and recreate any triggers that might reference insurance_needs
-- First, let's check if there are any triggers we need to fix

-- Drop the existing trigger if it exists
DROP TRIGGER IF EXISTS track_lead_changes ON public.leads;
DROP TRIGGER IF EXISTS log_lead_insurance_change ON public.leads;

-- Recreate the function if it exists, fixing the column name
CREATE OR REPLACE FUNCTION public.log_lead_insurance_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Use insurance_types, not insurance_needs
  IF OLD.insurance_types IS DISTINCT FROM NEW.insurance_types THEN
    INSERT INTO public.lead_activities (
      lead_id,
      activity_type,
      title,
      description,
      old_value,
      new_value,
      created_by,
      metadata
    ) VALUES (
      NEW.id,
      'insurance_types_change',
      'Insurance Types Changed',
      'Insurance types updated',
      OLD.insurance_types::text,
      NEW.insurance_types::text,
      NEW.assigned_to,
      jsonb_build_object(
        'old_types', COALESCE(OLD.insurance_types, ARRAY[]::text[]),
        'new_types', COALESCE(NEW.insurance_types, ARRAY[]::text[]),
        'timestamp', timezone('utc'::text, now())
      )
    );
  END IF;
  RETURN NEW;
END;
$$;