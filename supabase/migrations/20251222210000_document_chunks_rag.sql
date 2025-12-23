-- Document Q&A RAG: store per-document chunks + embeddings for cheap follow-up questions.
-- Assumes pgvector extension exists; create if missing.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  account_id uuid,
  storage_bucket text,
  storage_path text,
  chunk_index int NOT NULL,
  page_start int,
  page_end int,
  content text NOT NULL,
  content_hash text NOT NULL,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One embedding per chunk per document
CREATE UNIQUE INDEX IF NOT EXISTS uq_document_chunks_doc_chunk
ON public.document_chunks(document_id, chunk_index);

CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id
ON public.document_chunks(document_id);

CREATE INDEX IF NOT EXISTS idx_document_chunks_account_id
ON public.document_chunks(account_id);

CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding
ON public.document_chunks USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

-- Users can read chunks for documents in their account (via account_memberships)
DO $$
BEGIN
  DROP POLICY IF EXISTS "document_chunks_read" ON public.document_chunks;
  CREATE POLICY "document_chunks_read"
  ON public.document_chunks
  FOR SELECT
  TO authenticated
  USING (
    account_id IS NULL OR EXISTS (
      SELECT 1 FROM public.account_memberships m
      WHERE m.account_id = document_chunks.account_id
      AND m.user_id = auth.uid()
    )
  );
EXCEPTION
  WHEN undefined_table THEN
    -- In case account_memberships isn't present in some environments
    NULL;
END $$;

-- Only service role writes chunks (edge functions)
DO $$
BEGIN
  DROP POLICY IF EXISTS "document_chunks_write_service_role" ON public.document_chunks;
  CREATE POLICY "document_chunks_write_service_role"
  ON public.document_chunks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
EXCEPTION
  WHEN insufficient_privilege THEN
    -- Supabase may not allow explicit service_role policy creation in some setups; ignore.
    NULL;
END $$;

-- Similarity search RPC
CREATE OR REPLACE FUNCTION public.match_document_chunks(
  query_embedding vector(1536),
  match_count int DEFAULT 8,
  filter_document_id uuid DEFAULT NULL,
  filter_account_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  chunk_index int,
  page_start int,
  page_end int,
  content text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.chunk_index,
    dc.page_start,
    dc.page_end,
    dc.content,
    1 - (dc.embedding <=> query_embedding) as similarity
  FROM public.document_chunks dc
  WHERE
    dc.embedding IS NOT NULL
    AND (filter_document_id IS NULL OR dc.document_id = filter_document_id)
    AND (filter_account_id IS NULL OR dc.account_id = filter_account_id)
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;


