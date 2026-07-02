-- Batch 5D — add the absent denial-guard CHECK on ao_renewal_quotes.
-- Non-denied quotes must carry premium + term_months; denied may omit both.
-- Verified pre-apply: 0 violating rows (of 371).
-- DOWN: ALTER TABLE public.ao_renewal_quotes DROP CONSTRAINT ao_renewal_quotes_non_denied_requires_rate_term;
ALTER TABLE public.ao_renewal_quotes
  ADD CONSTRAINT ao_renewal_quotes_non_denied_requires_rate_term
  CHECK (status = 'denied' OR (premium IS NOT NULL AND term_months IS NOT NULL));
