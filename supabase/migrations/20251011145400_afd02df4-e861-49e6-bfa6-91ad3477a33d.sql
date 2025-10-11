-- Create enum for batch processing status
CREATE TYPE batch_status AS ENUM ('queued', 'processing', 'completed', 'failed');

-- Create document processing queue table
CREATE TABLE IF NOT EXISTS public.document_processing_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  storage_path TEXT,
  status batch_status NOT NULL DEFAULT 'queued',
  priority INTEGER DEFAULT 0,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  error_message TEXT,
  ocr_result JSONB,
  metadata JSONB DEFAULT '{}'::jsonb,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_queue_batch_id ON public.document_processing_queue(batch_id);
CREATE INDEX IF NOT EXISTS idx_queue_status ON public.document_processing_queue(status);
CREATE INDEX IF NOT EXISTS idx_queue_account_id ON public.document_processing_queue(account_id);
CREATE INDEX IF NOT EXISTS idx_queue_created_at ON public.document_processing_queue(created_at DESC);

-- Create composite index for queue processing
CREATE INDEX IF NOT EXISTS idx_queue_processing ON public.document_processing_queue(status, priority DESC, created_at ASC) 
WHERE status = 'queued';

-- Enable RLS
ALTER TABLE public.document_processing_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own queue items"
ON public.document_processing_queue
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.account_memberships m
    WHERE m.account_id = document_processing_queue.account_id 
    AND m.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert queue items"
ON public.document_processing_queue
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.account_memberships m
    WHERE m.account_id = document_processing_queue.account_id 
    AND m.user_id = auth.uid()
    AND m.role IN ('owner', 'staff')
  )
);

CREATE POLICY "System can update queue items"
ON public.document_processing_queue
FOR UPDATE
USING (true)
WITH CHECK (true);

-- Create function to update timestamp
CREATE OR REPLACE FUNCTION update_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_queue_timestamp
BEFORE UPDATE ON public.document_processing_queue
FOR EACH ROW
EXECUTE FUNCTION update_queue_updated_at();

-- Create batch summary view
CREATE OR REPLACE VIEW document_batch_summary AS
SELECT 
  batch_id,
  account_id,
  COUNT(*) as total_files,
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) FILTER (WHERE status = 'processing') as processing,
  COUNT(*) FILTER (WHERE status = 'queued') as queued,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  MIN(created_at) as batch_started,
  MAX(completed_at) as batch_completed
FROM public.document_processing_queue
GROUP BY batch_id, account_id;