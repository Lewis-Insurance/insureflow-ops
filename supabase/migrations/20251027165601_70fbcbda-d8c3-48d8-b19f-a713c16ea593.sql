-- Add status column to contact log
ALTER TABLE public.ao_renewal_contact_log 
ADD COLUMN status text;

-- Update trigger to also update status if provided
CREATE OR REPLACE FUNCTION public.update_renewal_from_contact_log()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.ao_renewals
  SET 
    last_contact_date = NEW.contact_date,
    status = COALESCE(NEW.status::ao_renewal_status, status),
    updated_at = now()
  WHERE id = NEW.renewal_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS update_renewal_last_contact ON public.ao_renewal_contact_log;

CREATE TRIGGER update_renewal_last_contact
  AFTER INSERT ON public.ao_renewal_contact_log
  FOR EACH ROW
  EXECUTE FUNCTION public.update_renewal_from_contact_log();