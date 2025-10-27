-- Add term_months to ao_renewals table
ALTER TABLE public.ao_renewals 
ADD COLUMN IF NOT EXISTS term_months integer CHECK (term_months IN (6, 12));

COMMENT ON COLUMN public.ao_renewals.term_months IS 'Policy term length: 6 for semi-annual, 12 for annual';

-- Drop and recreate ao_quotes_comparison view with proper annual premium normalization
DROP VIEW IF EXISTS public.ao_quotes_comparison CASCADE;

CREATE OR REPLACE VIEW public.ao_quotes_comparison AS
SELECT 
  r.id as renewal_id,
  r.policy_number,
  r.customer_name as insured_name,
  r.current_premium as auto_owners_premium,
  -- Calculate Auto-Owners annual premium (normalize based on term)
  CASE 
    WHEN r.term_months = 6 THEN r.current_premium * 2
    WHEN r.term_months = 12 THEN r.current_premium
    ELSE r.current_premium -- fallback if term not set yet
  END as auto_owners_annual_premium,
  r.term_months as auto_owners_term_months,
  q.carrier,
  q.premium as quote_premium,
  q.term_months as quote_term_months,
  -- Calculate quote annual premium
  CASE 
    WHEN q.term_months = 6 THEN q.premium * 2
    WHEN q.term_months = 12 THEN q.premium
    ELSE q.premium
  END as quote_annual_premium,
  q.status,
  -- Calculate savings based on ANNUAL premiums
  CASE 
    WHEN r.term_months IS NOT NULL THEN
      (CASE WHEN r.term_months = 6 THEN r.current_premium * 2 ELSE r.current_premium END) -
      (CASE WHEN q.term_months = 6 THEN q.premium * 2 ELSE q.premium END)
    ELSE 
      r.current_premium - (CASE WHEN q.term_months = 6 THEN q.premium * 2 ELSE q.premium END)
  END as savings,
  -- Calculate savings percentage based on ANNUAL premiums
  CASE 
    WHEN r.term_months IS NOT NULL AND r.current_premium > 0 THEN
      ROUND(
        ((CASE WHEN r.term_months = 6 THEN r.current_premium * 2 ELSE r.current_premium END) -
         (CASE WHEN q.term_months = 6 THEN q.premium * 2 ELSE q.premium END)) * 100.0 /
        (CASE WHEN r.term_months = 6 THEN r.current_premium * 2 ELSE r.current_premium END),
        2
      )
    WHEN r.current_premium > 0 THEN
      ROUND(
        (r.current_premium - (CASE WHEN q.term_months = 6 THEN q.premium * 2 ELSE q.premium END)) * 100.0 / r.current_premium,
        2
      )
    ELSE 0
  END as savings_pct,
  q.created_at,
  q.created_by
FROM public.ao_renewals r
INNER JOIN public.ao_renewal_quotes q ON r.id = q.renewal_id
ORDER BY r.policy_number, q.created_at DESC;

-- Grant permissions
GRANT SELECT ON public.ao_quotes_comparison TO authenticated;

COMMENT ON VIEW public.ao_quotes_comparison IS 'Compares competitive quotes against Auto-Owners baseline, normalized to annual premiums for accurate comparison';