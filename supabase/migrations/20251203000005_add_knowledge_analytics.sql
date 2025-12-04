-- Migration: Add Knowledge Analytics System
-- Description: Track usage patterns, search trends, and knowledge effectiveness
-- Date: 2024-12-03
-- Author: Claude CEO Co-Pilot

-- =============================================================================
-- PART 1: Create knowledge usage tracking table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.knowledge_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Knowledge reference
  knowledge_id UUID REFERENCES public.knowledge_base(id) ON DELETE CASCADE,

  -- Usage context
  action_type TEXT NOT NULL CHECK (action_type IN ('view', 'search_result', 'ai_response', 'edit', 'helpful_vote', 'unhelpful_vote')),
  search_query TEXT, -- Original search query if applicable
  context_type TEXT, -- 'ai_chat', 'search', 'browse', 'recommendation'

  -- User info
  user_id UUID REFERENCES auth.users(id),
  session_id TEXT, -- Track anonymous sessions

  -- Metadata
  response_time_ms INTEGER, -- How long the retrieval took
  relevance_score NUMERIC(5,4), -- Embedding similarity score
  was_helpful BOOLEAN, -- User feedback if provided

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.knowledge_usage_logs IS 'Tracks all knowledge entry interactions for analytics';
COMMENT ON COLUMN public.knowledge_usage_logs.action_type IS 'Type of interaction: view, search_result, ai_response, edit, vote';
COMMENT ON COLUMN public.knowledge_usage_logs.relevance_score IS 'Embedding similarity score for search results (0-1)';

-- =============================================================================
-- PART 2: Create knowledge search queries tracking table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.knowledge_search_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Query info
  query_text TEXT NOT NULL,
  normalized_query TEXT, -- Lowercased, stemmed version for grouping

  -- Results
  result_count INTEGER DEFAULT 0,
  top_result_id UUID REFERENCES public.knowledge_base(id),
  avg_relevance_score NUMERIC(5,4),

  -- Outcome
  had_results BOOLEAN DEFAULT true,
  user_clicked_result BOOLEAN, -- Did user click any result?
  user_satisfied BOOLEAN, -- User feedback if provided

  -- Context
  user_id UUID REFERENCES auth.users(id),
  session_id TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.knowledge_search_queries IS 'Tracks all knowledge base search queries for trend analysis';
COMMENT ON COLUMN public.knowledge_search_queries.had_results IS 'Whether any results were found (identifies knowledge gaps)';

-- =============================================================================
-- PART 3: Create materialized view for knowledge usage statistics
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS public.knowledge_usage_stats AS
SELECT
  kb.id AS knowledge_id,
  kb.title,
  kb.category,
  kb.tags,
  kb.created_at AS entry_created_at,
  kb.updated_at AS entry_updated_at,

  -- View counts by type
  COUNT(CASE WHEN kul.action_type = 'view' THEN 1 END) AS view_count,
  COUNT(CASE WHEN kul.action_type = 'search_result' THEN 1 END) AS search_result_count,
  COUNT(CASE WHEN kul.action_type = 'ai_response' THEN 1 END) AS ai_response_count,
  COUNT(CASE WHEN kul.action_type = 'edit' THEN 1 END) AS edit_count,

  -- Total interactions
  COUNT(*) AS total_interactions,

  -- Helpfulness metrics
  COUNT(CASE WHEN kul.action_type = 'helpful_vote' THEN 1 END) AS helpful_votes,
  COUNT(CASE WHEN kul.action_type = 'unhelpful_vote' THEN 1 END) AS unhelpful_votes,
  ROUND(
    CASE
      WHEN COUNT(CASE WHEN kul.action_type IN ('helpful_vote', 'unhelpful_vote') THEN 1 END) > 0
      THEN (COUNT(CASE WHEN kul.action_type = 'helpful_vote' THEN 1 END)::NUMERIC /
            NULLIF(COUNT(CASE WHEN kul.action_type IN ('helpful_vote', 'unhelpful_vote') THEN 1 END), 0)) * 100
      ELSE NULL
    END,
    2
  ) AS helpfulness_rate,

  -- Performance metrics
  AVG(kul.response_time_ms) AS avg_response_time_ms,
  AVG(kul.relevance_score) AS avg_relevance_score,

  -- Recency
  MAX(kul.created_at) AS last_accessed_at,
  DATE_PART('day', NOW() - MAX(kul.created_at)) AS days_since_last_access,

  -- Unique users
  COUNT(DISTINCT kul.user_id) AS unique_users,
  COUNT(DISTINCT kul.session_id) AS unique_sessions

FROM public.knowledge_base kb
LEFT JOIN public.knowledge_usage_logs kul ON kb.id = kul.knowledge_id
GROUP BY kb.id, kb.title, kb.category, kb.tags, kb.created_at, kb.updated_at
ORDER BY total_interactions DESC;

COMMENT ON MATERIALIZED VIEW public.knowledge_usage_stats IS 'Aggregated usage statistics per knowledge entry';

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_usage_stats_id
  ON public.knowledge_usage_stats(knowledge_id);

-- =============================================================================
-- PART 4: Create materialized view for search trends
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS public.knowledge_search_trends AS
SELECT
  normalized_query,
  query_text AS example_query,
  COUNT(*) AS search_count,
  SUM(CASE WHEN had_results = false THEN 1 ELSE 0 END) AS no_results_count,
  ROUND(
    (SUM(CASE WHEN had_results = false THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0)) * 100,
    2
  ) AS no_results_rate,
  AVG(result_count) AS avg_results_per_search,
  AVG(avg_relevance_score) AS avg_relevance,
  SUM(CASE WHEN user_clicked_result THEN 1 ELSE 0 END) AS click_count,
  ROUND(
    (SUM(CASE WHEN user_clicked_result THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0)) * 100,
    2
  ) AS click_through_rate,
  MAX(created_at) AS last_searched_at,
  COUNT(DISTINCT user_id) AS unique_users,

  -- Identify knowledge gaps (queries with consistently no results)
  CASE
    WHEN SUM(CASE WHEN had_results = false THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0) > 0.8
    THEN true
    ELSE false
  END AS is_knowledge_gap

FROM public.knowledge_search_queries
WHERE normalized_query IS NOT NULL
GROUP BY normalized_query, query_text
ORDER BY search_count DESC;

COMMENT ON MATERIALIZED VIEW public.knowledge_search_trends IS 'Search query trends and knowledge gap identification';

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_search_trends_query
  ON public.knowledge_search_trends(normalized_query);

-- =============================================================================
-- PART 5: Create materialized view for knowledge gaps over time
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS public.knowledge_gap_trends AS
SELECT
  DATE_TRUNC('day', created_at) AS date,
  normalized_query,
  query_text AS example_query,
  COUNT(*) AS attempt_count,
  COUNT(DISTINCT user_id) AS unique_users_affected,
  COUNT(DISTINCT session_id) AS unique_sessions_affected,
  AVG(result_count) AS avg_result_count
FROM public.knowledge_search_queries
WHERE had_results = false
GROUP BY DATE_TRUNC('day', created_at), normalized_query, query_text
ORDER BY date DESC, attempt_count DESC;

COMMENT ON MATERIALIZED VIEW public.knowledge_gap_trends IS 'Daily tracking of knowledge gaps for trend analysis';

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_gap_trends_date_query
  ON public.knowledge_gap_trends(date, normalized_query);

-- =============================================================================
-- PART 6: Create materialized view for category coverage analysis
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS public.knowledge_category_stats AS
SELECT
  kb.category,
  COUNT(*) AS entry_count,
  COUNT(DISTINCT kb.tags) AS unique_tags,
  AVG(LENGTH(kb.content)) AS avg_content_length,

  -- Usage metrics
  COALESCE(SUM(kul_counts.total_views), 0) AS total_views,
  COALESCE(SUM(kul_counts.total_searches), 0) AS total_searches,
  COALESCE(SUM(kul_counts.total_ai_responses), 0) AS total_ai_responses,
  COALESCE(AVG(kul_counts.avg_helpfulness), 0) AS avg_helpfulness_rate,

  -- Recency
  MAX(kb.created_at) AS newest_entry_at,
  MIN(kb.created_at) AS oldest_entry_at,
  MAX(kb.updated_at) AS last_updated_at

FROM public.knowledge_base kb
LEFT JOIN LATERAL (
  SELECT
    COUNT(CASE WHEN action_type = 'view' THEN 1 END) AS total_views,
    COUNT(CASE WHEN action_type = 'search_result' THEN 1 END) AS total_searches,
    COUNT(CASE WHEN action_type = 'ai_response' THEN 1 END) AS total_ai_responses,
    CASE
      WHEN COUNT(CASE WHEN action_type IN ('helpful_vote', 'unhelpful_vote') THEN 1 END) > 0
      THEN (COUNT(CASE WHEN action_type = 'helpful_vote' THEN 1 END)::NUMERIC /
            NULLIF(COUNT(CASE WHEN action_type IN ('helpful_vote', 'unhelpful_vote') THEN 1 END), 0)) * 100
      ELSE NULL
    END AS avg_helpfulness
  FROM public.knowledge_usage_logs
  WHERE knowledge_id = kb.id
) kul_counts ON true
GROUP BY kb.category
ORDER BY total_views DESC;

COMMENT ON MATERIALIZED VIEW public.knowledge_category_stats IS 'Category-level coverage and usage statistics';

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_category_stats_category
  ON public.knowledge_category_stats(category);

-- =============================================================================
-- PART 7: Create indexes for performance
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_knowledge_usage_logs_knowledge_id
  ON public.knowledge_usage_logs(knowledge_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_usage_logs_user_id
  ON public.knowledge_usage_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_usage_logs_action_type
  ON public.knowledge_usage_logs(action_type);

CREATE INDEX IF NOT EXISTS idx_knowledge_usage_logs_created_at
  ON public.knowledge_usage_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_usage_logs_session_id
  ON public.knowledge_usage_logs(session_id)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_search_queries_normalized
  ON public.knowledge_search_queries(normalized_query);

CREATE INDEX IF NOT EXISTS idx_knowledge_search_queries_no_results
  ON public.knowledge_search_queries(had_results)
  WHERE had_results = false;

CREATE INDEX IF NOT EXISTS idx_knowledge_search_queries_created_at
  ON public.knowledge_search_queries(created_at DESC);

-- =============================================================================
-- PART 8: Row Level Security
-- =============================================================================

ALTER TABLE public.knowledge_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_search_queries ENABLE ROW LEVEL SECURITY;

-- Users can view their own usage logs
CREATE POLICY "Users can view their own knowledge usage logs"
  ON public.knowledge_usage_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own usage logs
CREATE POLICY "Users can insert their own knowledge usage logs"
  ON public.knowledge_usage_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Staff can view all usage logs for analytics
CREATE POLICY "Staff can view all knowledge usage logs"
  ON public.knowledge_usage_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'staff')
    )
  );

-- Users can view their own search queries
CREATE POLICY "Users can view their own search queries"
  ON public.knowledge_search_queries FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own search queries
CREATE POLICY "Users can insert their own search queries"
  ON public.knowledge_search_queries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Staff can view all search queries for analytics
CREATE POLICY "Staff can view all search queries"
  ON public.knowledge_search_queries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'staff')
    )
  );

-- =============================================================================
-- PART 9: Functions for analytics operations
-- =============================================================================

-- Function to log knowledge usage
CREATE OR REPLACE FUNCTION public.log_knowledge_usage(
  p_knowledge_id UUID,
  p_action_type TEXT,
  p_search_query TEXT DEFAULT NULL,
  p_context_type TEXT DEFAULT NULL,
  p_response_time_ms INTEGER DEFAULT NULL,
  p_relevance_score NUMERIC DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.knowledge_usage_logs (
    knowledge_id,
    action_type,
    search_query,
    context_type,
    response_time_ms,
    relevance_score,
    user_id,
    session_id
  ) VALUES (
    p_knowledge_id,
    p_action_type,
    p_search_query,
    p_context_type,
    p_response_time_ms,
    p_relevance_score,
    auth.uid(),
    p_session_id
  ) RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log search query
CREATE OR REPLACE FUNCTION public.log_knowledge_search(
  p_query_text TEXT,
  p_result_count INTEGER DEFAULT 0,
  p_top_result_id UUID DEFAULT NULL,
  p_avg_relevance_score NUMERIC DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_query_id UUID;
  v_normalized_query TEXT;
BEGIN
  -- Normalize query (lowercase, trim)
  v_normalized_query := LOWER(TRIM(p_query_text));

  INSERT INTO public.knowledge_search_queries (
    query_text,
    normalized_query,
    result_count,
    top_result_id,
    avg_relevance_score,
    had_results,
    user_id,
    session_id
  ) VALUES (
    p_query_text,
    v_normalized_query,
    p_result_count,
    p_top_result_id,
    p_avg_relevance_score,
    p_result_count > 0,
    auth.uid(),
    p_session_id
  ) RETURNING id INTO v_query_id;

  RETURN v_query_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to refresh all analytics materialized views
CREATE OR REPLACE FUNCTION public.refresh_knowledge_analytics()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.knowledge_usage_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.knowledge_search_trends;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.knowledge_gap_trends;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.knowledge_category_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- PART 10: Triggers for updated_at
-- =============================================================================

-- No updated_at triggers needed for log tables (append-only)

-- =============================================================================
-- PART 11: Grant permissions
-- =============================================================================

GRANT SELECT, INSERT ON public.knowledge_usage_logs TO authenticated;
GRANT SELECT, INSERT ON public.knowledge_search_queries TO authenticated;
GRANT SELECT ON public.knowledge_usage_stats TO authenticated;
GRANT SELECT ON public.knowledge_search_trends TO authenticated;
GRANT SELECT ON public.knowledge_gap_trends TO authenticated;
GRANT SELECT ON public.knowledge_category_stats TO authenticated;

-- =============================================================================
-- Migration Complete
-- =============================================================================

-- Summary of changes:
-- 1. Created knowledge_usage_logs table for interaction tracking
-- 2. Created knowledge_search_queries table for search trend analysis
-- 3. Created 4 materialized views for analytics dashboards:
--    - knowledge_usage_stats: Per-entry usage statistics
--    - knowledge_search_trends: Search query patterns and gaps
--    - knowledge_gap_trends: Daily knowledge gap tracking
--    - knowledge_category_stats: Category coverage analysis
-- 4. Added comprehensive indexes for query performance
-- 5. Implemented Row Level Security policies
-- 6. Created helper functions for logging and analytics refresh
-- 7. All changes are additive and backward compatible
