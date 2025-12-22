-- =============================================================================
-- EXPLORE SESSIONS MODULE - Evidence-Backed Document Q&A
-- =============================================================================
-- This migration creates the complete schema for the Explore Insurance Document
-- module with evidence-backed Q&A, session management, and vector search.
-- =============================================================================

-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================================
-- 1. EXPLORE SESSIONS
-- =============================================================================
-- Transient sessions for document exploration, optionally linked to account/policy

CREATE TABLE IF NOT EXISTS public.explore_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Optional linkage to existing records
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  policy_id UUID REFERENCES public.policies(id) ON DELETE SET NULL,
  
  -- Session metadata
  title TEXT,
  description TEXT,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'error')),
  error_message TEXT,
  
  -- Processing stats
  total_documents INT DEFAULT 0,
  processed_documents INT DEFAULT 0,
  total_chunks INT DEFAULT 0,
  total_evidence_items INT DEFAULT 0
);

-- Indexes for explore_sessions
CREATE INDEX IF NOT EXISTS idx_explore_sessions_created_by ON public.explore_sessions(created_by);
CREATE INDEX IF NOT EXISTS idx_explore_sessions_account_id ON public.explore_sessions(account_id);
CREATE INDEX IF NOT EXISTS idx_explore_sessions_policy_id ON public.explore_sessions(policy_id);
CREATE INDEX IF NOT EXISTS idx_explore_sessions_status ON public.explore_sessions(status);
CREATE INDEX IF NOT EXISTS idx_explore_sessions_created_at ON public.explore_sessions(created_at DESC);

-- RLS for explore_sessions
ALTER TABLE public.explore_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS explore_sessions_select ON public.explore_sessions;
CREATE POLICY explore_sessions_select ON public.explore_sessions
  FOR SELECT USING (auth.uid() = created_by);

DROP POLICY IF EXISTS explore_sessions_insert ON public.explore_sessions;
CREATE POLICY explore_sessions_insert ON public.explore_sessions
  FOR INSERT WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS explore_sessions_update ON public.explore_sessions;
CREATE POLICY explore_sessions_update ON public.explore_sessions
  FOR UPDATE USING (auth.uid() = created_by);

DROP POLICY IF EXISTS explore_sessions_delete ON public.explore_sessions;
CREATE POLICY explore_sessions_delete ON public.explore_sessions
  FOR DELETE USING (auth.uid() = created_by);

-- =============================================================================
-- 2. EXPLORE DOCUMENTS
-- =============================================================================
-- Documents uploaded to a session with processing status and classification

CREATE TABLE IF NOT EXISTS public.explore_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.explore_sessions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Storage reference
  storage_provider TEXT NOT NULL DEFAULT 'supabase', -- 'supabase', 'google_drive', etc.
  storage_provider_id TEXT, -- googleDriveId or similar external ID
  storage_path TEXT, -- supabase storage path
  storage_bucket TEXT DEFAULT 'documents',
  
  -- File metadata
  filename TEXT NOT NULL,
  mime_type TEXT,
  file_size BIGINT,
  page_count INT,
  
  -- Document role/label (for multi-doc sessions)
  doc_role TEXT, -- 'A', 'B', 'policy', 'quote', etc.
  doc_type_hint TEXT, -- user-provided hint
  
  -- Classification results (from processing)
  predicted_doc_type TEXT, -- 'policy', 'dec_page', 'quote', 'endorsement', 'loss_run', 'certificate', etc.
  predicted_doc_type_confidence REAL,
  lob_detected TEXT[], -- ['GL', 'AUTO', 'WC', etc.]
  lob_confidence JSONB, -- {"GL": 0.95, "AUTO": 0.80}
  carrier_detected TEXT,
  
  -- Quality assessment
  quality_score REAL, -- 0.0 to 1.0
  quality_issues JSONB, -- {"low_contrast": true, "skewed": false, "handwritten": false}
  azure_confidence REAL, -- overall Azure DI confidence
  
  -- Processing status
  status TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'processing', 'ready', 'error')),
  error_message TEXT,
  processing_started_at TIMESTAMPTZ,
  processing_completed_at TIMESTAMPTZ,
  processing_duration_ms INT,
  
  -- Retry tracking
  attempt_count INT DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  
  -- Stats after processing
  evidence_count INT DEFAULT 0,
  chunk_count INT DEFAULT 0
);

-- Indexes for explore_documents
CREATE INDEX IF NOT EXISTS idx_explore_documents_session_id ON public.explore_documents(session_id);
CREATE INDEX IF NOT EXISTS idx_explore_documents_status ON public.explore_documents(status);
CREATE INDEX IF NOT EXISTS idx_explore_documents_predicted_doc_type ON public.explore_documents(predicted_doc_type);

-- RLS for explore_documents (inherit from session ownership)
ALTER TABLE public.explore_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS explore_documents_select ON public.explore_documents;
CREATE POLICY explore_documents_select ON public.explore_documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.explore_sessions s
      WHERE s.id = explore_documents.session_id
      AND s.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS explore_documents_insert ON public.explore_documents;
CREATE POLICY explore_documents_insert ON public.explore_documents
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.explore_sessions s
      WHERE s.id = explore_documents.session_id
      AND s.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS explore_documents_update ON public.explore_documents;
CREATE POLICY explore_documents_update ON public.explore_documents
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.explore_sessions s
      WHERE s.id = explore_documents.session_id
      AND s.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS explore_documents_delete ON public.explore_documents;
CREATE POLICY explore_documents_delete ON public.explore_documents
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.explore_sessions s
      WHERE s.id = explore_documents.session_id
      AND s.created_by = auth.uid()
    )
  );

-- =============================================================================
-- 3. EVIDENCE ITEMS
-- =============================================================================
-- Individual evidence entries with page/bbox for citation highlighting

CREATE TABLE IF NOT EXISTS public.explore_evidence_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id TEXT NOT NULL, -- stable hash-based ID for deduplication
  document_id UUID NOT NULL REFERENCES public.explore_documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Location
  page_index INT NOT NULL, -- 0-indexed
  bbox JSONB, -- {"x": 0.1, "y": 0.2, "w": 0.3, "h": 0.05} normalized 0..1
  
  -- Content
  snippet_text TEXT NOT NULL, -- short, bounded snippet
  label TEXT, -- extracted label/key if from key-value pair
  
  -- Source info
  source_type TEXT NOT NULL CHECK (source_type IN ('azure_di', 'table', 'kv', 'text_span', 'layout')),
  confidence REAL, -- Azure confidence score
  
  -- Grouping/tags
  tags TEXT[], -- semantic tags for grouping
  related_evidence_ids TEXT[], -- links to related evidence
  
  -- Potential field mapping (for LLM hints)
  potential_field TEXT, -- 'policy_number', 'effective_date', etc.
  
  UNIQUE(document_id, evidence_id)
);

-- Indexes for explore_evidence_items
CREATE INDEX IF NOT EXISTS idx_explore_evidence_items_document_id ON public.explore_evidence_items(document_id);
CREATE INDEX IF NOT EXISTS idx_explore_evidence_items_evidence_id ON public.explore_evidence_items(evidence_id);
CREATE INDEX IF NOT EXISTS idx_explore_evidence_items_page_index ON public.explore_evidence_items(page_index);
CREATE INDEX IF NOT EXISTS idx_explore_evidence_items_potential_field ON public.explore_evidence_items(potential_field);

-- RLS for explore_evidence_items (inherit from document ownership)
ALTER TABLE public.explore_evidence_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS explore_evidence_items_select ON public.explore_evidence_items;
CREATE POLICY explore_evidence_items_select ON public.explore_evidence_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.explore_documents d
      JOIN public.explore_sessions s ON s.id = d.session_id
      WHERE d.id = explore_evidence_items.document_id
      AND s.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS explore_evidence_items_insert ON public.explore_evidence_items;
CREATE POLICY explore_evidence_items_insert ON public.explore_evidence_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.explore_documents d
      JOIN public.explore_sessions s ON s.id = d.session_id
      WHERE d.id = explore_evidence_items.document_id
      AND s.created_by = auth.uid()
    )
  );

-- =============================================================================
-- 4. EXPLORE CHUNKS (for retrieval)
-- =============================================================================
-- Chunked text with embeddings for vector search

CREATE TABLE IF NOT EXISTS public.explore_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.explore_documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Chunk content
  chunk_text TEXT NOT NULL,
  chunk_index INT NOT NULL, -- order within document
  
  -- Location info
  page_start INT, -- starting page (0-indexed)
  page_end INT, -- ending page (0-indexed)
  
  -- Evidence links
  evidence_ids TEXT[] NOT NULL DEFAULT '{}', -- must have at least one
  
  -- Vector embedding (1536 dimensions for OpenAI ada-002, 3072 for text-embedding-3-large)
  embedding vector(1536),
  
  -- Metadata for hybrid search
  token_count INT,
  
  CONSTRAINT chunk_has_evidence CHECK (array_length(evidence_ids, 1) >= 1)
);

-- Indexes for explore_chunks
CREATE INDEX IF NOT EXISTS idx_explore_chunks_document_id ON public.explore_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_explore_chunks_chunk_index ON public.explore_chunks(chunk_index);

-- Vector similarity index using HNSW for fast approximate nearest neighbor search
CREATE INDEX IF NOT EXISTS idx_explore_chunks_embedding ON public.explore_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- RLS for explore_chunks (inherit from document ownership)
ALTER TABLE public.explore_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS explore_chunks_select ON public.explore_chunks;
CREATE POLICY explore_chunks_select ON public.explore_chunks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.explore_documents d
      JOIN public.explore_sessions s ON s.id = d.session_id
      WHERE d.id = explore_chunks.document_id
      AND s.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS explore_chunks_insert ON public.explore_chunks;
CREATE POLICY explore_chunks_insert ON public.explore_chunks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.explore_documents d
      JOIN public.explore_sessions s ON s.id = d.session_id
      WHERE d.id = explore_chunks.document_id
      AND s.created_by = auth.uid()
    )
  );

-- =============================================================================
-- 5. EXPLORE SNAPSHOTS (optional structured extraction)
-- =============================================================================
-- Schema-driven structured data extracted from policy/quote documents

CREATE TABLE IF NOT EXISTS public.explore_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.explore_documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Snapshot version (for schema evolution)
  schema_version TEXT NOT NULL DEFAULT '1.0',
  
  -- The structured snapshot data
  snapshot_json JSONB NOT NULL,
  
  -- Extraction metadata
  extraction_confidence REAL,
  fields_extracted INT,
  fields_with_conflicts INT,
  fields_needing_review INT,
  
  -- Processing info
  model_used TEXT,
  prompt_version TEXT,
  
  UNIQUE(document_id)
);

-- Indexes for explore_snapshots
CREATE INDEX IF NOT EXISTS idx_explore_snapshots_document_id ON public.explore_snapshots(document_id);

-- RLS for explore_snapshots (inherit from document ownership)
ALTER TABLE public.explore_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS explore_snapshots_select ON public.explore_snapshots;
CREATE POLICY explore_snapshots_select ON public.explore_snapshots
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.explore_documents d
      JOIN public.explore_sessions s ON s.id = d.session_id
      WHERE d.id = explore_snapshots.document_id
      AND s.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS explore_snapshots_insert ON public.explore_snapshots;
CREATE POLICY explore_snapshots_insert ON public.explore_snapshots
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.explore_documents d
      JOIN public.explore_sessions s ON s.id = d.session_id
      WHERE d.id = explore_snapshots.document_id
      AND s.created_by = auth.uid()
    )
  );

-- =============================================================================
-- 6. EXPLORE MESSAGES (chat history)
-- =============================================================================
-- Q&A conversation history with citations

CREATE TABLE IF NOT EXISTS public.explore_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.explore_sessions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Message content
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  
  -- Citations for assistant messages
  citations JSONB, -- [{"evidence_id": "...", "document_id": "...", "page": 1, "snippet": "..."}]
  
  -- Metadata
  model_used TEXT,
  tokens_used INT,
  latency_ms INT,
  
  -- For tracking retrieval quality
  chunks_retrieved INT,
  retrieval_scores JSONB -- {"chunk_id": score, ...}
);

-- Indexes for explore_messages
CREATE INDEX IF NOT EXISTS idx_explore_messages_session_id ON public.explore_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_explore_messages_created_at ON public.explore_messages(session_id, created_at);

-- RLS for explore_messages (inherit from session ownership)
ALTER TABLE public.explore_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS explore_messages_select ON public.explore_messages;
CREATE POLICY explore_messages_select ON public.explore_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.explore_sessions s
      WHERE s.id = explore_messages.session_id
      AND s.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS explore_messages_insert ON public.explore_messages;
CREATE POLICY explore_messages_insert ON public.explore_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.explore_sessions s
      WHERE s.id = explore_messages.session_id
      AND s.created_by = auth.uid()
    )
  );

-- =============================================================================
-- 7. HELPER FUNCTIONS
-- =============================================================================

-- Function to search chunks by vector similarity within a session
CREATE OR REPLACE FUNCTION public.search_explore_chunks(
  p_session_id UUID,
  p_embedding vector(1536),
  p_limit INT DEFAULT 10,
  p_threshold REAL DEFAULT 0.5
)
RETURNS TABLE (
  chunk_id UUID,
  document_id UUID,
  chunk_text TEXT,
  page_start INT,
  evidence_ids TEXT[],
  similarity REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id AS chunk_id,
    c.document_id,
    c.chunk_text,
    c.page_start,
    c.evidence_ids,
    (1 - (c.embedding <=> p_embedding))::REAL AS similarity
  FROM public.explore_chunks c
  JOIN public.explore_documents d ON d.id = c.document_id
  WHERE d.session_id = p_session_id
    AND c.embedding IS NOT NULL
    AND (1 - (c.embedding <=> p_embedding)) >= p_threshold
  ORDER BY c.embedding <=> p_embedding
  LIMIT p_limit;
END;
$$;

-- Function to get session summary stats
CREATE OR REPLACE FUNCTION public.get_explore_session_stats(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_documents', COUNT(DISTINCT d.id),
    'ready_documents', COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'ready'),
    'processing_documents', COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'processing'),
    'error_documents', COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'error'),
    'total_evidence_items', SUM(d.evidence_count),
    'total_chunks', SUM(d.chunk_count),
    'total_messages', (
      SELECT COUNT(*) FROM public.explore_messages m WHERE m.session_id = p_session_id
    )
  ) INTO result
  FROM public.explore_documents d
  WHERE d.session_id = p_session_id;
  
  RETURN result;
END;
$$;

-- =============================================================================
-- 8. TRIGGERS
-- =============================================================================

-- Trigger to update session stats when documents change
CREATE OR REPLACE FUNCTION public.update_explore_session_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.explore_sessions
  SET 
    total_documents = (
      SELECT COUNT(*) FROM public.explore_documents WHERE session_id = COALESCE(NEW.session_id, OLD.session_id)
    ),
    processed_documents = (
      SELECT COUNT(*) FROM public.explore_documents 
      WHERE session_id = COALESCE(NEW.session_id, OLD.session_id) AND status = 'ready'
    ),
    total_chunks = (
      SELECT COALESCE(SUM(chunk_count), 0) FROM public.explore_documents 
      WHERE session_id = COALESCE(NEW.session_id, OLD.session_id)
    ),
    total_evidence_items = (
      SELECT COALESCE(SUM(evidence_count), 0) FROM public.explore_documents 
      WHERE session_id = COALESCE(NEW.session_id, OLD.session_id)
    ),
    status = CASE
      WHEN EXISTS (SELECT 1 FROM public.explore_documents WHERE session_id = COALESCE(NEW.session_id, OLD.session_id) AND status = 'error') THEN 'error'
      WHEN EXISTS (SELECT 1 FROM public.explore_documents WHERE session_id = COALESCE(NEW.session_id, OLD.session_id) AND status IN ('uploading', 'processing')) THEN 'processing'
      WHEN NOT EXISTS (SELECT 1 FROM public.explore_documents WHERE session_id = COALESCE(NEW.session_id, OLD.session_id) AND status != 'ready') THEN 'ready'
      ELSE 'pending'
    END,
    updated_at = NOW()
  WHERE id = COALESCE(NEW.session_id, OLD.session_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_explore_session_stats ON public.explore_documents;
CREATE TRIGGER trigger_update_explore_session_stats
  AFTER INSERT OR UPDATE OR DELETE ON public.explore_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_explore_session_stats();

-- Trigger to update updated_at on sessions
CREATE OR REPLACE FUNCTION public.update_explore_session_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_explore_session_updated_at ON public.explore_sessions;
CREATE TRIGGER trigger_explore_session_updated_at
  BEFORE UPDATE ON public.explore_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_explore_session_timestamp();

-- =============================================================================
-- DONE
-- =============================================================================

