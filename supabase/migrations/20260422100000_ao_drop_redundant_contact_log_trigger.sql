-- Fix B-v2-1: Drop the new redundant trigger added in 20260421110000.
-- The pre-existing update_renewal_from_contact_log() trigger already syncs
-- last_contact_date AND status from ao_renewal_contact_log to ao_renewals.
-- The new trigger and function are redundant and race the pre-existing one.

DROP TRIGGER IF EXISTS trg_ao_renewal_contact_log_stamp_date ON public.ao_renewal_contact_log;
DROP FUNCTION IF EXISTS public.update_ao_renewal_last_contact_date();
