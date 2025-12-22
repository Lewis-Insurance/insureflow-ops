-- ============================================================================
-- EXPLORE DOCUMENT - MINIMAL DELTA
-- Extends existing tables instead of creating parallel ones
-- ============================================================================

-- ============================================================================
-- 1. EXTEND document_extractions WITH EVIDENCE CATALOG
-- ============================================================================
-- The evidence_catalog stores page/bbox/snippet for each extracted element
-- This enables click-to-highlight in document viewer

ALTER TABLE public.document_extractions 
  ADD COLUMN IF NOT EXISTS evidence_catalog JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS chunk_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS embedding_status TEXT DEFAULT 'pending' 
    CHECK (embedding_status IN ('pending', 'processing', 'ready', 'error', 'skipped'));

COMMENT ON COLUMN public.document_extractions.evidence_catalog IS 
  'Array of evidence items: [{evidence_id, page_index, bbox: {x,y,w,h}, snippet_text, label, confidence, tags}]';

COMMENT ON COLUMN public.document_extractions.chunk_count IS 
  'Number of chunks created in knowledge_base for this extraction';

COMMENT ON COLUMN public.document_extractions.embedding_status IS 
  'Status of pgvector embedding generation for chunks';

-- ============================================================================
-- 2. EXTEND knowledge_base TO LINK CHUNKS TO DOCUMENTS
-- ============================================================================
-- Add document linkage so we can filter retrieval by document/extraction

ALTER TABLE public.knowledge_base
  ADD COLUMN IF NOT EXISTS document_extraction_id UUID REFERENCES public.document_extractions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS page_index INTEGER,
  ADD COLUMN IF NOT EXISTS evidence_ids TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS chunk_index INTEGER DEFAULT 0;

COMMENT ON COLUMN public.knowledge_base.document_extraction_id IS 
  'Links chunk to its source document extraction';

COMMENT ON COLUMN public.knowledge_base.document_id IS 
  'Links chunk to original documents table record';

COMMENT ON COLUMN public.knowledge_base.page_index IS 
  'Starting page index (0-based) for this chunk';

COMMENT ON COLUMN public.knowledge_base.evidence_ids IS 
  'Evidence IDs from evidence_catalog that support this chunk';

COMMENT ON COLUMN public.knowledge_base.chunk_index IS 
  'Order of this chunk within the document';

-- Index for filtering knowledge by document
CREATE INDEX IF NOT EXISTS idx_knowledge_document_extraction 
  ON public.knowledge_base(document_extraction_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_document 
  ON public.knowledge_base(document_id);

-- ============================================================================
-- 3. EXTEND ai_messages WITH CITATIONS
-- ============================================================================
-- Add citations column for evidence-backed answers

ALTER TABLE public.ai_messages
  ADD COLUMN IF NOT EXISTS citations JSONB DEFAULT '[]';

COMMENT ON COLUMN public.ai_messages.citations IS 
  'Evidence citations: [{evidence_id, document_id, page, snippet, confidence}]';

-- ============================================================================
-- 4. CREATE MINIMAL evidence_items TABLE (for bbox highlight)
-- ============================================================================
-- Only if we need fast lookup by evidence_id for highlight navigation
-- Otherwise, evidence_catalog JSONB in document_extractions is sufficient

CREATE TABLE IF NOT EXISTS public.document_evidence_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id TEXT NOT NULL, -- stable hash-based ID
  extraction_id UUID NOT NULL REFERENCES public.document_extractions(id) ON DELETE CASCADE,
  document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
  
  -- Location for highlighting
  page_index INTEGER NOT NULL,
  bbox JSONB, -- {x, y, w, h} normalized 0..1
  
  -- Content
  snippet_text TEXT NOT NULL,
  label TEXT, -- key if from key-value pair
  
  -- Metadata
  source_type TEXT NOT NULL DEFAULT 'azure_di' CHECK (source_type IN ('azure_di', 'table', 'kv', 'text_span', 'layout')),
  confidence REAL,
  tags TEXT[] DEFAULT '{}',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(extraction_id, evidence_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_evidence_items_extraction ON public.document_evidence_items(extraction_id);
CREATE INDEX IF NOT EXISTS idx_evidence_items_evidence_id ON public.document_evidence_items(evidence_id);
CREATE INDEX IF NOT EXISTS idx_evidence_items_page ON public.document_evidence_items(page_index);

-- RLS (inherit from document_extractions access)
ALTER TABLE public.document_evidence_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view evidence items" ON public.document_evidence_items;
CREATE POLICY "Staff can view evidence items" ON public.document_evidence_items
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Staff can insert evidence items" ON public.document_evidence_items;
CREATE POLICY "Staff can insert evidence items" ON public.document_evidence_items
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================================
-- 5. VECTOR SEARCH FUNCTION FOR DOCUMENT Q&A
-- ============================================================================
-- Search knowledge base filtered by document/extraction

CREATE OR REPLACE FUNCTION public.search_document_chunks(
  p_query_embedding vector(768),
  p_document_id UUID DEFAULT NULL,
  p_extraction_id UUID DEFAULT NULL,
  p_match_threshold REAL DEFAULT 0.5,
  p_match_count INT DEFAULT 10
)
RETURNS TABLE (
  chunk_id UUID,
  content TEXT,
  category TEXT,
  page_index INT,
  evidence_ids TEXT[],
  document_extraction_id UUID,
  similarity REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    kb.id AS chunk_id,
    kb.content,
    kb.category,
    kb.page_index,
    kb.evidence_ids,
    kb.document_extraction_id,
    (1 - (kb.embedding <=> p_query_embedding))::REAL AS similarity
  FROM public.knowledge_base kb
  WHERE 
    kb.embedding IS NOT NULL
    AND (p_document_id IS NULL OR kb.document_id = p_document_id)
    AND (p_extraction_id IS NULL OR kb.document_extraction_id = p_extraction_id)
    AND (1 - (kb.embedding <=> p_query_embedding)) >= p_match_threshold
  ORDER BY kb.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;

-- ============================================================================
-- 6. HELPER: GET EVIDENCE BY ID
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_evidence_item(
  p_extraction_id UUID,
  p_evidence_id TEXT
)
RETURNS TABLE (
  evidence_id TEXT,
  page_index INT,
  bbox JSONB,
  snippet_text TEXT,
  label TEXT,
  confidence REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.evidence_id,
    e.page_index,
    e.bbox,
    e.snippet_text,
    e.label,
    e.confidence
  FROM public.document_evidence_items e
  WHERE e.extraction_id = p_extraction_id
    AND e.evidence_id = p_evidence_id;
END;
$$;

-- ============================================================================
-- 7. GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT ON public.document_evidence_items TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_document_chunks TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_evidence_item TO authenticated;

