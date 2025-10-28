-- Add analysis_result column to existing document_analysis table
ALTER TABLE public.document_analysis 
ADD COLUMN IF NOT EXISTS analysis_result JSONB DEFAULT '{}'::jsonb;

-- Add comment
COMMENT ON COLUMN public.document_analysis.analysis_result IS 'Structured analysis results from AI processing';

-- Add other potentially missing columns that the Azure function expects
ALTER TABLE public.document_analysis 
ADD COLUMN IF NOT EXISTS raw_ocr_text TEXT;

ALTER TABLE public.document_analysis 
ADD COLUMN IF NOT EXISTS carrier_name TEXT;

ALTER TABLE public.document_analysis 
ADD COLUMN IF NOT EXISTS policy_number TEXT;

ALTER TABLE public.document_analysis 
ADD COLUMN IF NOT EXISTS policy_type TEXT;

ALTER TABLE public.document_analysis 
ADD COLUMN IF NOT EXISTS insured_name TEXT;

ALTER TABLE public.document_analysis 
ADD COLUMN IF NOT EXISTS effective_date DATE;

ALTER TABLE public.document_analysis 
ADD COLUMN IF NOT EXISTS expiration_date DATE;

ALTER TABLE public.document_analysis 
ADD COLUMN IF NOT EXISTS total_premium NUMERIC;

ALTER TABLE public.document_analysis 
ADD COLUMN IF NOT EXISTS payment_frequency TEXT;

ALTER TABLE public.document_analysis 
ADD COLUMN IF NOT EXISTS coverages JSONB;

ALTER TABLE public.document_analysis 
ADD COLUMN IF NOT EXISTS insured_items JSONB;

ALTER TABLE public.document_analysis 
ADD COLUMN IF NOT EXISTS confidence_score INTEGER;

ALTER TABLE public.document_analysis 
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Add indexes for new columns if they don't exist
CREATE INDEX IF NOT EXISTS idx_document_analysis_policy_number ON public.document_analysis(policy_number) WHERE policy_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_document_analysis_carrier_name ON public.document_analysis(carrier_name) WHERE carrier_name IS NOT NULL;