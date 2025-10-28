-- Add ALL missing columns to document_analysis table
ALTER TABLE public.document_analysis 
ADD COLUMN IF NOT EXISTS ocr_text TEXT,
ADD COLUMN IF NOT EXISTS analysis_result JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Add comments
COMMENT ON COLUMN public.document_analysis.ocr_text IS 'OCR extracted text from document';
COMMENT ON COLUMN public.document_analysis.analysis_result IS 'Structured AI analysis results';
COMMENT ON COLUMN public.document_analysis.processing_status IS 'Status: pending, processing, completed, failed';
COMMENT ON COLUMN public.document_analysis.completed_at IS 'Timestamp when analysis completed';

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_document_analysis_status 
ON public.document_analysis(processing_status);

CREATE INDEX IF NOT EXISTS idx_document_analysis_document_id 
ON public.document_analysis(document_id);