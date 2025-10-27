-- Fix the trigger to handle status as text instead of enum
CREATE OR REPLACE FUNCTION public.update_renewal_from_contact_log()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.ao_renewals
  SET 
    last_contact_date = NEW.contact_date,
    status = COALESCE(NEW.status, status),
    updated_at = now()
  WHERE id = NEW.renewal_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;