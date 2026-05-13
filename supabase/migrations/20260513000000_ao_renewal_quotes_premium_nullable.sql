-- AO Renewals: allow denied quotes to be saved without a premium.
-- Denied quotes don't carry a price; making premium nullable lets CSRs
-- record a denial (with reason) without inventing a number.
-- Existing rows are not modified.

ALTER TABLE public.ao_renewal_quotes
  ALTER COLUMN premium DROP NOT NULL;
