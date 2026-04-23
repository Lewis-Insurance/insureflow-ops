-- Fix A: Drop the silent renewal-status writer trigger and the redundant
-- last_contact_date trigger. Keep trg_ao_renewal_last_contact_date →
-- sync_ao_renewal_last_contact_date() which has the "only if newer" guard.

-- 1. Drop the silent status writer (sets ao_renewals.status from contact log)
DROP TRIGGER IF EXISTS update_renewal_last_contact ON ao_renewal_contact_log;
DROP FUNCTION IF EXISTS update_renewal_from_contact_log() CASCADE;

-- 2. Drop the redundant last_contact_date updater (unconditional, no guard)
DROP TRIGGER IF EXISTS update_renewal_last_contact_trigger ON ao_renewal_contact_log;
DROP FUNCTION IF EXISTS update_renewal_last_contact() CASCADE;

-- Verify keeper trigger still present:
-- trg_ao_renewal_last_contact_date → sync_ao_renewal_last_contact_date()
