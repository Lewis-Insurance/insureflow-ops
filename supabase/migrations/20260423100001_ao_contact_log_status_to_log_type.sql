-- Fix B: Rename ao_renewal_contact_log.status → log_type with proper CHECK.
-- Backfill the 6 existing non-null rows to the closest log-type value:
--   contacted → spoke_with_insured
--   quoted    → quote_presented
--   renewed/lost/cancelled/pending → NULL (these are renewal outcomes, not log types)

-- Step 1: Rename column
ALTER TABLE ao_renewal_contact_log RENAME COLUMN status TO log_type;

-- Step 2: Backfill known mappings
UPDATE ao_renewal_contact_log
SET log_type = CASE log_type
  WHEN 'contacted'  THEN 'spoke_with_insured'
  WHEN 'quoted'     THEN 'quote_presented'
  -- renewal outcome values — not log types; null them out
  ELSE NULL
END
WHERE log_type IS NOT NULL;

-- Step 3: Add CHECK constraint
ALTER TABLE ao_renewal_contact_log
  ADD CONSTRAINT ao_renewal_contact_log_log_type_check
  CHECK (
    log_type IS NULL OR log_type IN (
      'voicemail',
      'spoke_with_insured',
      'no_answer',
      'email_sent',
      'text_sent',
      'quote_presented',
      'quote_sent',
      'follow_up_scheduled',
      'other'
    )
  );
