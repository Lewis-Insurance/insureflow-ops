-- Drop any existing triggers that reference insurance_needs
DROP TRIGGER IF EXISTS track_lead_changes ON public.leads;
DROP TRIGGER IF EXISTS track_lead_insurance_changes ON public.leads;
DROP TRIGGER IF EXISTS log_lead_changes ON public.leads;
DROP TRIGGER IF EXISTS audit_lead_changes ON public.leads;

-- Drop the problematic function
DROP FUNCTION IF EXISTS public.log_lead_insurance_change() CASCADE;
DROP FUNCTION IF EXISTS public.track_lead_changes() CASCADE;

-- Recreate the function with correct column name (insurance_types)
CREATE OR REPLACE FUNCTION public.log_lead_insurance_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.insurance_types IS DISTINCT FROM NEW.insurance_types THEN
    INSERT INTO public.lead_activity (
      lead_id,
      activity_type,
      description,
      metadata,
      created_at
    ) VALUES (
      NEW.id,
      'field_changed',
      'Insurance types updated',
      jsonb_build_object(
        'field', 'insurance_types',
        'old_value', OLD.insurance_types,
        'new_value', NEW.insurance_types
      ),
      now()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger if needed
-- CREATE TRIGGER track_lead_insurance_changes
--   AFTER UPDATE ON public.leads
--   FOR EACH ROW
--   EXECUTE FUNCTION public.log_lead_insurance_change();