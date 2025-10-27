-- Create quotes table for AO renewals
CREATE TABLE IF NOT EXISTS public.ao_renewal_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  renewal_id UUID NOT NULL REFERENCES public.ao_renewals(id) ON DELETE CASCADE,
  carrier TEXT NOT NULL,
  premium NUMERIC(10, 2) NOT NULL,
  term_months INTEGER NOT NULL CHECK (term_months IN (6, 12)),
  status TEXT NOT NULL DEFAULT 'quoted' CHECK (status IN ('quoted', 'denied', 'selected', 'expired')),
  denial_reason TEXT,
  document_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id)
);

-- Create index for faster queries
CREATE INDEX idx_ao_renewal_quotes_renewal_id ON public.ao_renewal_quotes(renewal_id);
CREATE INDEX idx_ao_renewal_quotes_carrier ON public.ao_renewal_quotes(carrier);
CREATE INDEX idx_ao_renewal_quotes_status ON public.ao_renewal_quotes(status);

-- Enable RLS
ALTER TABLE public.ao_renewal_quotes ENABLE ROW LEVEL SECURITY;

-- RLS Policies - All authenticated users can manage quotes
CREATE POLICY "All authenticated users can view quotes"
  ON public.ao_renewal_quotes
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "All authenticated users can create quotes"
  ON public.ao_renewal_quotes
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "All authenticated users can update quotes"
  ON public.ao_renewal_quotes
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "All authenticated users can delete quotes"
  ON public.ao_renewal_quotes
  FOR DELETE
  TO authenticated
  USING (true);

-- Create storage bucket for quote documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ao-renewal-quotes',
  'ao-renewal-quotes',
  false,
  10485760, -- 10MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/jpg', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for quote documents
CREATE POLICY "Authenticated users can upload quote documents"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'ao-renewal-quotes');

CREATE POLICY "Authenticated users can view quote documents"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'ao-renewal-quotes');

CREATE POLICY "Authenticated users can update quote documents"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'ao-renewal-quotes');

CREATE POLICY "Authenticated users can delete quote documents"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'ao-renewal-quotes');

-- Create analytics view for quote comparison
CREATE OR REPLACE VIEW public.ao_quotes_analytics AS
SELECT 
  q.carrier,
  COUNT(*) as total_quotes,
  COUNT(CASE WHEN q.status = 'quoted' THEN 1 END) as quoted_count,
  COUNT(CASE WHEN q.status = 'denied' THEN 1 END) as denied_count,
  COUNT(CASE WHEN q.status = 'selected' THEN 1 END) as selected_count,
  AVG(q.premium) as avg_premium,
  MIN(q.premium) as min_premium,
  MAX(q.premium) as max_premium,
  AVG(CASE WHEN q.term_months = 6 THEN q.premium * 2 ELSE q.premium END) as avg_annual_premium,
  COUNT(CASE WHEN q.term_months = 6 THEN 1 END) as six_month_count,
  COUNT(CASE WHEN q.term_months = 12 THEN 1 END) as twelve_month_count,
  ROUND((COUNT(CASE WHEN q.status = 'denied' THEN 1 END)::NUMERIC / COUNT(*)::NUMERIC) * 100, 2) as denial_rate_pct
FROM public.ao_renewal_quotes q
GROUP BY q.carrier;

-- Create view for Auto-Owners comparison
CREATE OR REPLACE VIEW public.ao_quotes_comparison AS
SELECT 
  r.id as renewal_id,
  r.customer_name,
  r.policy_number,
  r.current_premium as ao_premium,
  r.current_carrier,
  q.carrier as quote_carrier,
  q.premium as quote_premium,
  q.term_months,
  q.status as quote_status,
  CASE 
    WHEN q.term_months = 6 THEN q.premium * 2 
    ELSE q.premium 
  END as annualized_premium,
  CASE 
    WHEN q.term_months = 6 THEN (q.premium * 2) - COALESCE(r.current_premium, 0)
    ELSE q.premium - COALESCE(r.current_premium, 0)
  END as premium_difference,
  CASE 
    WHEN r.current_premium IS NOT NULL AND r.current_premium > 0 THEN
      ROUND(
        ((CASE WHEN q.term_months = 6 THEN q.premium * 2 ELSE q.premium END - r.current_premium) 
        / r.current_premium * 100)::NUMERIC, 
        2
      )
    ELSE NULL
  END as savings_pct,
  q.created_at as quote_date
FROM public.ao_renewals r
LEFT JOIN public.ao_renewal_quotes q ON q.renewal_id = r.id
WHERE q.id IS NOT NULL;

-- Create view for denial analysis
CREATE OR REPLACE VIEW public.ao_quotes_denial_analysis AS
SELECT 
  carrier,
  denial_reason,
  COUNT(*) as denial_count,
  AVG(premium) as avg_attempted_premium,
  MIN(created_at) as first_denial,
  MAX(created_at) as last_denial
FROM public.ao_renewal_quotes
WHERE status = 'denied' AND denial_reason IS NOT NULL
GROUP BY carrier, denial_reason
ORDER BY carrier, denial_count DESC;

-- Update trigger for ao_renewal_quotes
CREATE OR REPLACE FUNCTION public.update_ao_renewal_quotes_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_ao_renewal_quotes_timestamp
  BEFORE UPDATE ON public.ao_renewal_quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ao_renewal_quotes_timestamp();