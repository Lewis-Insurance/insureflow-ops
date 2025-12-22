-- =============================================================================
-- CLIENT INTELLIGENCE: pgvector Setup for Semantic Search
-- =============================================================================
-- Enables semantic search for client context retrieval
-- Supports the CEO Copilot AI feature with citation-backed insights

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================================
-- EMBEDDINGS TABLE
-- =============================================================================
-- Stores vector embeddings for all indexable client content

CREATE TABLE IF NOT EXISTS public.client_context_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Account association (required for access control)
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  
  -- Source identification
  source_type TEXT NOT NULL CHECK (source_type IN (
    'note', 'document', 'policy', 'claim', 'task', 
    'call', 'sms', 'event', 'quote', 'email'
  )),
  source_id UUID NOT NULL,
  source_label TEXT NOT NULL, -- Human-readable label (e.g., "Policy #ABC123")
  
  -- Content
  content TEXT NOT NULL, -- The actual text that was embedded
  content_hash TEXT NOT NULL, -- SHA256 hash for deduplication
  chunk_index INTEGER DEFAULT 0, -- For documents split into chunks
  chunk_total INTEGER DEFAULT 1, -- Total chunks for this source
  
  -- Vector embedding (1536 dimensions for OpenAI text-embedding-3-small)
  embedding vector(1536),
  
  -- Metadata for filtering and display
  metadata JSONB DEFAULT '{}'::jsonb,
  -- Expected metadata fields:
  -- - timestamp: ISO date when the source was created/updated
  -- - snippet: Short preview text for citations
  -- - deep_link: URL path to navigate to source
  -- - relevance_boost: Optional float to boost certain sources
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  indexed_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique content per source (no duplicate chunks)
  UNIQUE (account_id, source_type, source_id, chunk_index)
);

-- Index for fast vector similarity search
CREATE INDEX IF NOT EXISTS idx_embeddings_vector 
  ON public.client_context_embeddings 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Index for filtering by account
CREATE INDEX IF NOT EXISTS idx_embeddings_account 
  ON public.client_context_embeddings(account_id);

-- Index for content hash (deduplication)
CREATE INDEX IF NOT EXISTS idx_embeddings_content_hash 
  ON public.client_context_embeddings(content_hash);

-- Index for source lookup
CREATE INDEX IF NOT EXISTS idx_embeddings_source 
  ON public.client_context_embeddings(source_type, source_id);

-- Composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_embeddings_account_source_type 
  ON public.client_context_embeddings(account_id, source_type);

-- =============================================================================
-- INDEXING JOBS TABLE
-- =============================================================================
-- Tracks background indexing jobs for incremental updates

CREATE TABLE IF NOT EXISTS public.client_context_index_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- What to index
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id UUID NOT NULL,
  
  -- Job status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'completed', 'failed', 'skipped'
  )),
  
  -- Job metadata
  priority INTEGER DEFAULT 0, -- Higher = more urgent
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Prevent duplicate pending jobs
  UNIQUE (account_id, source_type, source_id, status) 
    WHERE status IN ('pending', 'processing')
);

-- Index for processing jobs in order
CREATE INDEX IF NOT EXISTS idx_index_jobs_pending 
  ON public.client_context_index_jobs(status, priority DESC, created_at)
  WHERE status = 'pending';

-- =============================================================================
-- CONTEXT CACHE TABLE
-- =============================================================================
-- Short-term cache for assembled context packs

CREATE TABLE IF NOT EXISTS public.client_context_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  cache_key TEXT NOT NULL, -- Hash of query + filters
  
  -- Cached data
  structured_snapshot JSONB NOT NULL,
  retrieved_chunks JSONB NOT NULL, -- Array of chunk references
  token_count INTEGER NOT NULL,
  
  -- TTL management
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  
  UNIQUE (account_id, cache_key)
);

-- Index for cache lookup
CREATE INDEX IF NOT EXISTS idx_context_cache_lookup 
  ON public.client_context_cache(account_id, cache_key)
  WHERE expires_at > NOW();

-- Index for cache cleanup
CREATE INDEX IF NOT EXISTS idx_context_cache_expires 
  ON public.client_context_cache(expires_at);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.client_context_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_context_index_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_context_cache ENABLE ROW LEVEL SECURITY;

-- Embeddings: Users can only access embeddings for accounts they have access to
DROP POLICY IF EXISTS "users_access_account_embeddings" ON public.client_context_embeddings;
CREATE POLICY "users_access_account_embeddings"
  ON public.client_context_embeddings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = client_context_embeddings.account_id
      AND a.deleted_at IS NULL
      -- Add team/ownership check if needed:
      -- AND (a.owner_agent_id = auth.uid() OR a.team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
    )
  );

-- Index jobs: Service role only (background processing)
DROP POLICY IF EXISTS "service_role_manage_index_jobs" ON public.client_context_index_jobs;
CREATE POLICY "service_role_manage_index_jobs"
  ON public.client_context_index_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Cache: Users can access cache for their accounts
DROP POLICY IF EXISTS "users_access_account_cache" ON public.client_context_cache;
CREATE POLICY "users_access_account_cache"
  ON public.client_context_cache
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = client_context_cache.account_id
      AND a.deleted_at IS NULL
    )
  );

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to search for similar embeddings
CREATE OR REPLACE FUNCTION public.search_client_context(
  p_account_id UUID,
  p_query_embedding vector(1536),
  p_limit INTEGER DEFAULT 20,
  p_source_types TEXT[] DEFAULT NULL,
  p_min_similarity FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id UUID,
  source_type TEXT,
  source_id UUID,
  source_label TEXT,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.source_type,
    e.source_id,
    e.source_label,
    e.content,
    e.metadata,
    1 - (e.embedding <=> p_query_embedding) AS similarity
  FROM public.client_context_embeddings e
  WHERE e.account_id = p_account_id
    AND (p_source_types IS NULL OR e.source_type = ANY(p_source_types))
    AND 1 - (e.embedding <=> p_query_embedding) >= p_min_similarity
  ORDER BY e.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$;

-- Function to clean up expired cache
CREATE OR REPLACE FUNCTION public.cleanup_context_cache()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.client_context_cache
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Function to queue indexing job (upsert)
CREATE OR REPLACE FUNCTION public.queue_context_index_job(
  p_account_id UUID,
  p_source_type TEXT,
  p_source_id UUID,
  p_priority INTEGER DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  job_id UUID;
BEGIN
  INSERT INTO public.client_context_index_jobs (
    account_id, source_type, source_id, priority, status
  )
  VALUES (p_account_id, p_source_type, p_source_id, p_priority, 'pending')
  ON CONFLICT (account_id, source_type, source_id, status) 
    WHERE status IN ('pending', 'processing')
  DO UPDATE SET priority = GREATEST(client_context_index_jobs.priority, p_priority)
  RETURNING id INTO job_id;
  
  RETURN job_id;
END;
$$;

-- =============================================================================
-- TRIGGERS FOR AUTOMATIC INDEXING
-- =============================================================================

-- Generic function to queue indexing when source data changes
CREATE OR REPLACE FUNCTION public.trigger_queue_context_index()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_account_id UUID;
  v_source_type TEXT;
BEGIN
  -- Determine account_id based on table
  CASE TG_TABLE_NAME
    WHEN 'notes' THEN
      v_account_id := COALESCE(NEW.account_id, OLD.account_id);
      v_source_type := 'note';
    WHEN 'documents' THEN
      v_account_id := COALESCE(NEW.account_id, OLD.account_id);
      v_source_type := 'document';
    WHEN 'tasks' THEN
      -- Tasks use entity_id when entity_type = 'account'
      IF COALESCE(NEW.entity_type, OLD.entity_type) = 'account' THEN
        v_account_id := COALESCE(NEW.entity_id, OLD.entity_id)::UUID;
        v_source_type := 'task';
      ELSE
        RETURN COALESCE(NEW, OLD);
      END IF;
    WHEN 'call_sessions' THEN
      v_account_id := COALESCE(NEW.account_id, OLD.account_id);
      v_source_type := 'call';
    WHEN 'sms_messages' THEN
      v_account_id := COALESCE(NEW.account_id, OLD.account_id);
      v_source_type := 'sms';
    WHEN 'events' THEN
      IF COALESCE(NEW.entity_type, OLD.entity_type) = 'account' THEN
        v_account_id := COALESCE(NEW.entity_id, OLD.entity_id)::UUID;
        v_source_type := 'event';
      ELSE
        RETURN COALESCE(NEW, OLD);
      END IF;
    ELSE
      RETURN COALESCE(NEW, OLD);
  END CASE;

  -- Queue the indexing job
  IF v_account_id IS NOT NULL AND TG_OP != 'DELETE' THEN
    PERFORM public.queue_context_index_job(
      v_account_id,
      v_source_type,
      COALESCE(NEW.id, OLD.id),
      CASE TG_OP WHEN 'INSERT' THEN 5 ELSE 3 END -- New content higher priority
    );
  ELSIF TG_OP = 'DELETE' THEN
    -- Remove embeddings for deleted source
    DELETE FROM public.client_context_embeddings
    WHERE source_type = v_source_type AND source_id = OLD.id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Note: Triggers will be created conditionally based on existing tables
-- These are commented out - enable them based on your schema

-- DO $$
-- BEGIN
--   IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notes') THEN
--     DROP TRIGGER IF EXISTS trg_index_notes ON public.notes;
--     CREATE TRIGGER trg_index_notes
--       AFTER INSERT OR UPDATE OR DELETE ON public.notes
--       FOR EACH ROW EXECUTE FUNCTION public.trigger_queue_context_index();
--   END IF;
-- END $$;

COMMENT ON TABLE public.client_context_embeddings IS 'Vector embeddings for semantic search of client context';
COMMENT ON TABLE public.client_context_index_jobs IS 'Background job queue for incremental content indexing';
COMMENT ON TABLE public.client_context_cache IS 'Short-term cache for assembled context packs';

