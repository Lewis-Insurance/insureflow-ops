-- Migration: Add AI Response Feedback System
-- Description: Track user feedback on AI responses for quality improvement
-- Date: 2024-12-03
-- Author: Claude CEO Co-Pilot

-- =============================================================================
-- PART 1: Create ai_response_feedback table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ai_response_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Message reference
  conversation_id UUID, -- Links to AI conversation sessions
  message_id TEXT, -- Internal message ID from chat
  query TEXT NOT NULL, -- Original user query
  response TEXT NOT NULL, -- AI response that was rated

  -- Feedback
  helpful BOOLEAN NOT NULL, -- true = helpful (👍), false = not helpful (👎)
  feedback_text TEXT, -- Optional detailed feedback from user

  -- Context
  context_type TEXT, -- 'general', 'document_analysis', 'knowledge_search', 'code_generation'
  context_metadata JSONB DEFAULT '{}'::jsonb, -- Additional context about the interaction

  -- Quality metrics
  response_time_ms INTEGER, -- How long the AI took to respond
  was_cached BOOLEAN DEFAULT false, -- Whether response came from cache
  token_count INTEGER, -- Approximate token count of response

  -- Improvement tracking
  issue_category TEXT, -- 'inaccurate', 'incomplete', 'irrelevant', 'formatting', 'other'
  suggested_improvement TEXT, -- User's suggestion for better response

  -- User info
  user_id UUID REFERENCES auth.users(id),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.ai_response_feedback IS 'User feedback on AI response quality for continuous improvement';
COMMENT ON COLUMN public.ai_response_feedback.helpful IS 'Boolean feedback: true for helpful (👍), false for not helpful (👎)';
COMMENT ON COLUMN public.ai_response_feedback.context_type IS 'Type of AI interaction being rated';
COMMENT ON COLUMN public.ai_response_feedback.issue_category IS 'Classification of the issue if marked not helpful';

-- =============================================================================
-- PART 2: Create ai_conversation_sessions table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ai_conversation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Session info
  user_id UUID REFERENCES auth.users(id),
  session_type TEXT NOT NULL, -- 'chat', 'document_analysis', 'knowledge_search'

  -- Context
  entity_type TEXT, -- 'account', 'policy', 'quote', 'claim', 'lead', etc.
  entity_id UUID, -- ID of the related entity

  -- Metrics
  message_count INTEGER DEFAULT 0,
  helpful_count INTEGER DEFAULT 0,
  not_helpful_count INTEGER DEFAULT 0,
  avg_response_time_ms INTEGER,

  -- Session state
  is_active BOOLEAN DEFAULT true,
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.ai_conversation_sessions IS 'Tracks AI conversation sessions for analytics and context';

-- =============================================================================
-- PART 3: Create ai_feedback_analytics materialized view
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS public.ai_feedback_analytics AS
SELECT
  DATE_TRUNC('day', created_at) AS date,
  context_type,
  COUNT(*) AS total_feedback,
  SUM(CASE WHEN helpful = true THEN 1 ELSE 0 END) AS helpful_count,
  SUM(CASE WHEN helpful = false THEN 1 ELSE 0 END) AS not_helpful_count,
  ROUND(
    (SUM(CASE WHEN helpful = true THEN 1 ELSE 0 END)::NUMERIC /
     NULLIF(COUNT(*), 0)) * 100,
    2
  ) AS helpfulness_rate,
  AVG(response_time_ms) AS avg_response_time,
  SUM(CASE WHEN was_cached THEN 1 ELSE 0 END) AS cached_responses,
  ROUND(
    (SUM(CASE WHEN was_cached THEN 1 ELSE 0 END)::NUMERIC /
     NULLIF(COUNT(*), 0)) * 100,
    2
  ) AS cache_hit_rate
FROM public.ai_response_feedback
GROUP BY DATE_TRUNC('day', created_at), context_type
ORDER BY date DESC, context_type;

COMMENT ON MATERIALIZED VIEW public.ai_feedback_analytics IS 'Daily analytics of AI response feedback for quality monitoring';

-- Create index for faster materialized view refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_feedback_analytics_date_context
  ON public.ai_feedback_analytics(date, context_type);

-- =============================================================================
-- PART 4: Create indexes for performance
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_ai_response_feedback_user
  ON public.ai_response_feedback(user_id);

CREATE INDEX IF NOT EXISTS idx_ai_response_feedback_created
  ON public.ai_response_feedback(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_response_feedback_helpful
  ON public.ai_response_feedback(helpful);

CREATE INDEX IF NOT EXISTS idx_ai_response_feedback_context
  ON public.ai_response_feedback(context_type);

CREATE INDEX IF NOT EXISTS idx_ai_response_feedback_conversation
  ON public.ai_response_feedback(conversation_id)
  WHERE conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_conversation_sessions_user
  ON public.ai_conversation_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_ai_conversation_sessions_active
  ON public.ai_conversation_sessions(is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_ai_conversation_sessions_entity
  ON public.ai_conversation_sessions(entity_type, entity_id)
  WHERE entity_type IS NOT NULL AND entity_id IS NOT NULL;

-- =============================================================================
-- PART 5: Row Level Security
-- =============================================================================

ALTER TABLE public.ai_response_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversation_sessions ENABLE ROW LEVEL SECURITY;

-- Users can only view their own feedback
CREATE POLICY "Users can view their own AI feedback"
  ON public.ai_response_feedback FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own feedback
CREATE POLICY "Users can insert their own AI feedback"
  ON public.ai_response_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own feedback (within 24 hours)
CREATE POLICY "Users can update their own recent AI feedback"
  ON public.ai_response_feedback FOR UPDATE
  USING (
    auth.uid() = user_id AND
    created_at > NOW() - INTERVAL '24 hours'
  );

-- Staff can view all feedback for analytics
CREATE POLICY "Staff can view all AI feedback"
  ON public.ai_response_feedback FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'staff')
    )
  );

-- Users can view their own conversation sessions
CREATE POLICY "Users can view their own AI sessions"
  ON public.ai_conversation_sessions FOR SELECT
  USING (auth.uid() = user_id);

-- Users can manage their own conversation sessions
CREATE POLICY "Users can manage their own AI sessions"
  ON public.ai_conversation_sessions FOR ALL
  USING (auth.uid() = user_id);

-- =============================================================================
-- PART 6: Functions for feedback aggregation
-- =============================================================================

-- Function to update conversation session metrics
CREATE OR REPLACE FUNCTION public.update_conversation_metrics()
RETURNS TRIGGER AS $$
BEGIN
  -- Update conversation session metrics when feedback is added
  IF NEW.conversation_id IS NOT NULL THEN
    UPDATE public.ai_conversation_sessions
    SET
      helpful_count = (
        SELECT COUNT(*) FROM public.ai_response_feedback
        WHERE conversation_id = NEW.conversation_id AND helpful = true
      ),
      not_helpful_count = (
        SELECT COUNT(*) FROM public.ai_response_feedback
        WHERE conversation_id = NEW.conversation_id AND helpful = false
      ),
      message_count = (
        SELECT COUNT(*) FROM public.ai_response_feedback
        WHERE conversation_id = NEW.conversation_id
      ),
      avg_response_time_ms = (
        SELECT AVG(response_time_ms) FROM public.ai_response_feedback
        WHERE conversation_id = NEW.conversation_id AND response_time_ms IS NOT NULL
      ),
      last_activity_at = NOW(),
      updated_at = NOW()
    WHERE id = NEW.conversation_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update conversation metrics
CREATE TRIGGER update_conversation_metrics_trigger
  AFTER INSERT OR UPDATE ON public.ai_response_feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.update_conversation_metrics();

-- Function to refresh analytics materialized view
CREATE OR REPLACE FUNCTION public.refresh_ai_feedback_analytics()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.ai_feedback_analytics;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- PART 7: Triggers for updated_at
-- =============================================================================

CREATE TRIGGER update_ai_response_feedback_updated_at
  BEFORE UPDATE ON public.ai_response_feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ai_conversation_sessions_updated_at
  BEFORE UPDATE ON public.ai_conversation_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- PART 8: Grant permissions
-- =============================================================================

GRANT SELECT, INSERT, UPDATE ON public.ai_response_feedback TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversation_sessions TO authenticated;
GRANT SELECT ON public.ai_feedback_analytics TO authenticated;

-- =============================================================================
-- Migration Complete
-- =============================================================================

-- Summary of changes:
-- 1. Created ai_response_feedback table for storing user ratings
-- 2. Created ai_conversation_sessions table for session tracking
-- 3. Created materialized view for analytics
-- 4. Added comprehensive indexes for query performance
-- 5. Implemented Row Level Security policies
-- 6. Added triggers for automatic metric updates
-- 7. Created function to refresh analytics view
-- 8. All changes are additive and backward compatible
