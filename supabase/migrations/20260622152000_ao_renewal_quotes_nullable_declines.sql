-- Allow AO renewal carrier declines to be recorded without quote premium/term.
-- Non-denied quote statuses must still provide both values.
ALTER TABLE public.ao_renewal_quotes
  ALTER COLUMN premium DROP NOT NULL,
  ALTER COLUMN term_months DROP NOT NULL;

ALTER TABLE public.ao_renewal_quotes
  DROP CONSTRAINT IF EXISTS ao_renewal_quotes_non_denied_requires_rate_term;

ALTER TABLE public.ao_renewal_quotes
  ADD CONSTRAINT ao_renewal_quotes_non_denied_requires_rate_term
  CHECK (
    status = 'denied'
    OR (premium IS NOT NULL AND term_months IS NOT NULL)
  );
