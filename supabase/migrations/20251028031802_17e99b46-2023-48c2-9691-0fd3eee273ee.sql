-- Create document_analysis table for storing AI OCR and extraction results

CREATE TABLE IF NOT EXISTS public.document_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid,
  file_name text NOT NULL,
  
  -- Policy Information
  carrier_name text,
  policy_number text,
  policy_type text, -- auto, home, commercial, etc.
  insured_name text,
  
  -- Dates
  effective_date date,
  expiration_date date,
  
  -- Financial
  total_premium numeric,
  payment_frequency text, -- annual, semi-annual, quarterly, monthly
  
  -- Coverages (JSONB for flexibility)
  coverages jsonb DEFAULT '[]'::jsonb,
  -- Example: [{"type": "Bodily Injury", "limit": "100/300", "premium": 250}]
  
  -- Vehicles/Properties (JSONB)
  insured_items jsonb DEFAULT '[]'::jsonb,
  -- Example: [{"type": "vehicle", "year": 2020, "make": "Toyota", "model": "Camry"}]
  
  -- Raw Data
  raw_ocr_text text,
  extracted_data jsonb, -- Full AI response
  
  -- Metadata
  confidence_score numeric DEFAULT 0,
  processing_status text DEFAULT 'pending', -- pending, complete, error
  error_message text,
  
  -- Audit
  account_id uuid REFERENCES public.accounts(id),
  created_by uuid, -- Reference to auth.uid() but no FK constraint
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.document_analysis ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their account's document analysis"
  ON public.document_analysis
  FOR SELECT
  TO authenticated
  USING (
    account_id IN (
      SELECT account_id 
      FROM public.account_memberships 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert document analysis for their accounts"
  ON public.document_analysis
  FOR INSERT
  TO authenticated
  WITH CHECK (
    account_id IN (
      SELECT account_id 
      FROM public.account_memberships 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their account's document analysis"
  ON public.document_analysis
  FOR UPDATE
  TO authenticated
  USING (
    account_id IN (
      SELECT account_id 
      FROM public.account_memberships 
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    account_id IN (
      SELECT account_id 
      FROM public.account_memberships 
      WHERE user_id = auth.uid()
    )
  );

-- Indexes for performance
CREATE INDEX idx_document_analysis_account ON public.document_analysis(account_id);
CREATE INDEX idx_document_analysis_policy_number ON public.document_analysis(policy_number);
CREATE INDEX idx_document_analysis_document_id ON public.document_analysis(document_id);
CREATE INDEX idx_document_analysis_created_at ON public.document_analysis(created_at DESC);