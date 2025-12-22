-- Document Q&A token optimization
-- 1) Store per-page OCR text (so Q&A can retrieve only relevant pages)
-- 2) Cache Q&A answers per document + question hash

-- Add per-page OCR cache to document_analysis
ALTER TABLE public.document_analysis
ADD COLUMN IF NOT EXISTS ocr_pages jsonb;

COMMENT ON COLUMN public.document_analysis.ocr_pages IS 'Per-page OCR text: [{"page":1,"text":"..."}, ...]';

-- Q&A cache table (stores answers for repeated questions)
CREATE TABLE IF NOT EXISTS public.document_qa_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  account_id uuid REFERENCES public.accounts(id),
  created_by uuid,
  question text NOT NULL,
  question_hash text NOT NULL,
  answer text NOT NULL,
  evidence_pages int[] DEFAULT '{}'::int[],
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_qa_cache_document_hash
  ON public.document_qa_cache(document_id, question_hash);

CREATE INDEX IF NOT EXISTS idx_document_qa_cache_account
  ON public.document_qa_cache(account_id, created_at DESC);

-- RLS
ALTER TABLE public.document_qa_cache ENABLE ROW LEVEL SECURITY;

-- Users can read cached Q&A for documents in their accounts
DROP POLICY IF EXISTS "Users can view their account's document q&a cache" ON public.document_qa_cache;
CREATE POLICY "Users can view their account's document q&a cache"
  ON public.document_qa_cache
  FOR SELECT
  TO authenticated
  USING (
    account_id IS NULL OR account_id IN (
      SELECT account_id
      FROM public.account_memberships
      WHERE user_id = auth.uid()
    )
  );

-- Users can insert cached Q&A for documents in their accounts
DROP POLICY IF EXISTS "Users can insert document q&a cache for their accounts" ON public.document_qa_cache;
CREATE POLICY "Users can insert document q&a cache for their accounts"
  ON public.document_qa_cache
  FOR INSERT
  TO authenticated
  WITH CHECK (
    account_id IS NULL OR account_id IN (
      SELECT account_id
      FROM public.account_memberships
      WHERE user_id = auth.uid()
    )
  );
