-- Drop and recreate analytics views with proper column structure

DROP VIEW IF EXISTS public.ao_quotes_analytics CASCADE;
DROP VIEW IF EXISTS public.ao_quotes_comparison CASCADE;

-- Recreate ao_quotes_analytics view with all required fields
CREATE VIEW public.ao_quotes_analytics AS
SELECT 
  q.carrier,
  COUNT(*) as total_quotes,
  COUNT(CASE WHEN q.status = 'quoted' THEN 1 END) as quoted_count,
  COUNT(CASE WHEN q.status = 'denied' THEN 1 END) as denied_count,
  COUNT(CASE WHEN q.status = 'selected' THEN 1 END) as selected_count,
  COUNT(CASE WHEN q.status = 'expired' THEN 1 END) as expired_count,
  AVG(q.premium) as avg_premium,
  AVG(CASE WHEN q.term_months = 6 THEN q.premium * 2 ELSE q.premium END) as avg_annual_premium,
  MIN(q.premium) as min_premium,
  MAX(q.premium) as max_premium,
  ROUND((COUNT(CASE WHEN q.status = 'denied' THEN 1 END)::NUMERIC / NULLIF(COUNT(*), 0)::NUMERIC) * 100, 2) as denial_rate_pct,
  ROUND((COUNT(CASE WHEN q.status = 'selected' THEN 1 END)::NUMERIC / NULLIF(COUNT(*), 0)::NUMERIC) * 100, 2) as selection_rate_pct,
  COUNT(CASE WHEN q.term_months = 6 THEN 1 END) as six_month_count,
  COUNT(CASE WHEN q.term_months = 12 THEN 1 END) as twelve_month_count
FROM public.ao_renewal_quotes q
GROUP BY q.carrier
ORDER BY total_quotes DESC;

-- Recreate ao_quotes_comparison view with proper column names
CREATE VIEW public.ao_quotes_comparison AS
SELECT 
  r.id as renewal_id,
  r.policy_number,
  r.customer_name as insured_name,
  r.current_premium as auto_owners_premium,
  q.carrier,
  q.premium as quote_premium,
  CASE 
    WHEN q.term_months = 6 THEN q.premium * 2 
    ELSE q.premium 
  END as quote_annual_premium,
  CASE 
    WHEN q.term_months = 6 THEN COALESCE(r.current_premium, 0) - (q.premium * 2)
    ELSE COALESCE(r.current_premium, 0) - q.premium
  END as savings,
  CASE 
    WHEN r.current_premium IS NOT NULL AND r.current_premium > 0 THEN
      ROUND(
        ((COALESCE(r.current_premium, 0) - CASE WHEN q.term_months = 6 THEN q.premium * 2 ELSE q.premium END) 
        / r.current_premium * 100)::NUMERIC, 
        2
      )
    ELSE 0
  END as savings_pct,
  q.status,
  q.term_months,
  q.created_at as quote_date
FROM public.ao_renewals r
INNER JOIN public.ao_renewal_quotes q ON q.renewal_id = r.id
ORDER BY r.policy_number, q.created_at DESC;