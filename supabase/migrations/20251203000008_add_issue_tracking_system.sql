-- Migration: Add Comprehensive Issue Tracking System
-- Description: Internal bug reporting and feature request system for staff
-- Date: 2024-12-03
-- Author: Claude CEO Co-Pilot

-- =============================================================================
-- PART 1: Create issues table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Issue identification
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  issue_number SERIAL UNIQUE, -- Auto-incrementing friendly number

  -- Categorization
  category TEXT NOT NULL CHECK (category IN (
    'bug',
    'feature_request',
    'ui_ux',
    'performance',
    'security',
    'data_issue',
    'integration',
    'other'
  )),

  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN (
    'critical',  -- System down, data loss, security breach
    'high',      -- Major functionality broken, affects many users
    'medium',    -- Moderate impact, workaround exists
    'low'        -- Minor issue, cosmetic, nice-to-have
  )),

  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN (
    'urgent',    -- Drop everything
    'high',      -- Next sprint
    'medium',    -- Backlog, prioritized
    'low'        -- Backlog, low priority
  )),

  -- Status workflow
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
    'new',           -- Just submitted
    'triaged',       -- Reviewed and categorized
    'investigating', -- Being investigated
    'in_progress',   -- Actively being worked on
    'testing',       -- Fix is being tested
    'resolved',      -- Fixed, awaiting closure
    'closed',        -- Completed
    'wont_fix',      -- Decided not to fix
    'duplicate'      -- Duplicate of another issue
  )),

  -- Assignment
  reported_by UUID REFERENCES auth.users(id) NOT NULL,
  assigned_to UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMP WITH TIME ZONE,

  -- Location/Context
  affected_page TEXT, -- URL or route where issue occurs
  affected_module TEXT, -- Module/section name
  browser_info JSONB DEFAULT '{}'::jsonb, -- Browser, OS, screen size
  steps_to_reproduce TEXT,
  expected_behavior TEXT,
  actual_behavior TEXT,

  -- Technical details
  error_message TEXT,
  console_logs TEXT,
  network_logs TEXT,

  -- Resolution
  resolution_notes TEXT,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMP WITH TIME ZONE,
  closed_at TIMESTAMP WITH TIME ZONE,

  -- Duplicate handling
  duplicate_of UUID REFERENCES public.issues(id),

  -- Metrics
  upvotes INTEGER DEFAULT 0,
  time_to_triage INTEGER, -- Minutes from creation to triage
  time_to_resolve INTEGER, -- Minutes from creation to resolution
  time_to_close INTEGER, -- Minutes from creation to closure

  -- Flags
  is_regression BOOLEAN DEFAULT false, -- Was working, now broken
  is_blocker BOOLEAN DEFAULT false, -- Blocks other work
  is_visible_to_customer BOOLEAN DEFAULT false, -- Customer-facing issue

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.issues IS 'Internal issue tracking for bugs, features, and improvements';
COMMENT ON COLUMN public.issues.issue_number IS 'User-friendly issue number (e.g., #123)';
COMMENT ON COLUMN public.issues.browser_info IS 'Captured browser, OS, device information';
COMMENT ON COLUMN public.issues.is_regression IS 'Feature that was working but broke';

-- =============================================================================
-- PART 2: Create issue_attachments table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.issue_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  issue_id UUID REFERENCES public.issues(id) ON DELETE CASCADE NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id) NOT NULL,

  -- File details
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL, -- Supabase storage path
  file_size INTEGER, -- Bytes
  file_type TEXT, -- image/png, video/mp4, etc.
  mime_type TEXT,

  -- Attachment type
  attachment_type TEXT CHECK (attachment_type IN (
    'screenshot',
    'screen_recording',
    'document',
    'log_file',
    'other'
  )),

  -- Metadata
  description TEXT,
  thumbnail_path TEXT, -- For videos

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.issue_attachments IS 'Screenshots, recordings, and files attached to issues';

-- =============================================================================
-- PART 3: Create issue_comments table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.issue_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  issue_id UUID REFERENCES public.issues(id) ON DELETE CASCADE NOT NULL,
  author_id UUID REFERENCES auth.users(id) NOT NULL,

  -- Comment content
  comment_text TEXT NOT NULL,

  -- Threading
  parent_comment_id UUID REFERENCES public.issue_comments(id) ON DELETE CASCADE,

  -- Metadata
  is_internal BOOLEAN DEFAULT true, -- Internal team note vs customer-visible
  is_status_change BOOLEAN DEFAULT false, -- Auto-generated status change comment
  is_edited BOOLEAN DEFAULT false,
  edited_at TIMESTAMP WITH TIME ZONE,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.issue_comments IS 'Discussion threads on issues';
COMMENT ON COLUMN public.issue_comments.is_internal IS 'Internal team note (not shown to customers)';

-- =============================================================================
-- PART 4: Create issue_votes table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.issue_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  issue_id UUID REFERENCES public.issues(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,

  vote_type TEXT DEFAULT 'upvote' CHECK (vote_type IN ('upvote')),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Prevent duplicate votes
  UNIQUE(issue_id, user_id)
);

COMMENT ON TABLE public.issue_votes IS 'Upvoting system for issue prioritization';

-- =============================================================================
-- PART 5: Create issue_labels table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.issue_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name TEXT NOT NULL UNIQUE,
  color TEXT, -- Hex color code
  description TEXT,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.issue_labels IS 'Custom labels for organizing issues';

-- Insert default labels
INSERT INTO public.issue_labels (name, color, description) VALUES
  ('quick-win', '#10b981', 'Easy fix with high impact'),
  ('tech-debt', '#f59e0b', 'Technical debt to address'),
  ('mobile', '#3b82f6', 'Mobile-specific issue'),
  ('desktop', '#6366f1', 'Desktop-specific issue'),
  ('needs-design', '#ec4899', 'Requires design input'),
  ('needs-testing', '#8b5cf6', 'Needs thorough testing'),
  ('breaking-change', '#ef4444', 'Would introduce breaking changes'),
  ('enhancement', '#06b6d4', 'Improvement to existing feature'),
  ('documentation', '#14b8a6', 'Documentation related'),
  ('accessibility', '#f97316', 'Accessibility improvement')
ON CONFLICT (name) DO NOTHING;

-- =============================================================================
-- PART 6: Create issue_label_assignments table (many-to-many)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.issue_label_assignments (
  issue_id UUID REFERENCES public.issues(id) ON DELETE CASCADE,
  label_id UUID REFERENCES public.issue_labels(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  assigned_by UUID REFERENCES auth.users(id),

  PRIMARY KEY (issue_id, label_id)
);

-- =============================================================================
-- PART 7: Create issue_activity_log table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.issue_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  issue_id UUID REFERENCES public.issues(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id),

  -- Activity details
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'created',
    'status_changed',
    'assigned',
    'priority_changed',
    'severity_changed',
    'commented',
    'attachment_added',
    'label_added',
    'label_removed',
    'upvoted',
    'resolved',
    'closed',
    'reopened',
    'edited'
  )),

  -- Change tracking
  old_value TEXT,
  new_value TEXT,

  -- Context
  comment TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.issue_activity_log IS 'Audit trail of all issue changes';

-- =============================================================================
-- PART 8: Create materialized view for issue analytics
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS public.issue_analytics AS
SELECT
  DATE_TRUNC('week', created_at) AS week,
  category,
  severity,
  status,

  COUNT(*) AS issue_count,
  COUNT(CASE WHEN status = 'resolved' OR status = 'closed' THEN 1 END) AS resolved_count,
  COUNT(CASE WHEN status = 'new' THEN 1 END) AS new_count,
  COUNT(CASE WHEN status IN ('investigating', 'in_progress', 'testing') THEN 1 END) AS in_progress_count,

  AVG(time_to_triage) AS avg_triage_time_minutes,
  AVG(time_to_resolve) AS avg_resolution_time_minutes,
  AVG(upvotes) AS avg_upvotes,

  SUM(upvotes) AS total_upvotes,

  COUNT(CASE WHEN is_blocker THEN 1 END) AS blocker_count,
  COUNT(CASE WHEN is_regression THEN 1 END) AS regression_count

FROM public.issues
GROUP BY week, category, severity, status
ORDER BY week DESC, category, severity;

COMMENT ON MATERIALIZED VIEW public.issue_analytics IS 'Weekly analytics for issue tracking metrics';

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_issue_analytics_unique
  ON public.issue_analytics(week, category, severity, status);

-- =============================================================================
-- PART 9: Create indexes for performance
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_issues_status ON public.issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_category ON public.issues(category);
CREATE INDEX IF NOT EXISTS idx_issues_severity ON public.issues(severity);
CREATE INDEX IF NOT EXISTS idx_issues_priority ON public.issues(priority);
CREATE INDEX IF NOT EXISTS idx_issues_reported_by ON public.issues(reported_by);
CREATE INDEX IF NOT EXISTS idx_issues_assigned_to ON public.issues(assigned_to);
CREATE INDEX IF NOT EXISTS idx_issues_created_at ON public.issues(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_issues_last_activity ON public.issues(last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_issues_upvotes ON public.issues(upvotes DESC);
CREATE INDEX IF NOT EXISTS idx_issues_number ON public.issues(issue_number);

CREATE INDEX IF NOT EXISTS idx_issue_comments_issue_id ON public.issue_comments(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_comments_author ON public.issue_comments(author_id);

CREATE INDEX IF NOT EXISTS idx_issue_attachments_issue_id ON public.issue_attachments(issue_id);

CREATE INDEX IF NOT EXISTS idx_issue_votes_issue_id ON public.issue_votes(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_votes_user_id ON public.issue_votes(user_id);

CREATE INDEX IF NOT EXISTS idx_issue_activity_issue_id ON public.issue_activity_log(issue_id);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_issues_search
  ON public.issues USING gin(to_tsvector('english', title || ' ' || description));

-- =============================================================================
-- PART 10: Row Level Security
-- =============================================================================

ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issue_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issue_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issue_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issue_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issue_label_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issue_activity_log ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view issues
CREATE POLICY "Authenticated users can view all issues"
  ON public.issues FOR SELECT
  USING (auth.role() = 'authenticated');

-- All authenticated users can create issues
CREATE POLICY "Authenticated users can create issues"
  ON public.issues FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND reported_by = auth.uid());

-- Users can update issues they reported or are assigned to
CREATE POLICY "Users can update their issues"
  ON public.issues FOR UPDATE
  USING (
    reported_by = auth.uid() OR
    assigned_to = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.account_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'staff')
    )
  );

-- Comments policies
CREATE POLICY "Users can view all comments"
  ON public.issue_comments FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can create comments"
  ON public.issue_comments FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND author_id = auth.uid());

CREATE POLICY "Users can update their own comments"
  ON public.issue_comments FOR UPDATE
  USING (author_id = auth.uid());

-- Attachments policies
CREATE POLICY "Users can view all attachments"
  ON public.issue_attachments FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can upload attachments"
  ON public.issue_attachments FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND uploaded_by = auth.uid());

-- Votes policies
CREATE POLICY "Users can view all votes"
  ON public.issue_votes FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can vote on issues"
  ON public.issue_votes FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND user_id = auth.uid());

CREATE POLICY "Users can remove their votes"
  ON public.issue_votes FOR DELETE
  USING (user_id = auth.uid());

-- Labels - everyone can view
CREATE POLICY "Users can view labels"
  ON public.issue_labels FOR SELECT
  USING (auth.role() = 'authenticated');

-- Activity log - everyone can view
CREATE POLICY "Users can view activity log"
  ON public.issue_activity_log FOR SELECT
  USING (auth.role() = 'authenticated');

-- =============================================================================
-- PART 11: Functions
-- =============================================================================

-- Function to refresh issue analytics
CREATE OR REPLACE FUNCTION public.refresh_issue_analytics()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.issue_analytics;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log issue activity
CREATE OR REPLACE FUNCTION public.log_issue_activity()
RETURNS TRIGGER AS $$
BEGIN
  -- Log status changes
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.issue_activity_log (issue_id, user_id, activity_type, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'status_changed', OLD.status, NEW.status);
  END IF;

  -- Log assignment changes
  IF TG_OP = 'UPDATE' AND OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    INSERT INTO public.issue_activity_log (issue_id, user_id, activity_type, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'assigned', OLD.assigned_to::TEXT, NEW.assigned_to::TEXT);
  END IF;

  -- Log priority changes
  IF TG_OP = 'UPDATE' AND OLD.priority IS DISTINCT FROM NEW.priority THEN
    INSERT INTO public.issue_activity_log (issue_id, user_id, activity_type, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'priority_changed', OLD.priority, NEW.priority);
  END IF;

  -- Log severity changes
  IF TG_OP = 'UPDATE' AND OLD.severity IS DISTINCT FROM NEW.severity THEN
    INSERT INTO public.issue_activity_log (issue_id, user_id, activity_type, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'severity_changed', OLD.severity, NEW.severity);
  END IF;

  -- Log creation
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.issue_activity_log (issue_id, user_id, activity_type)
    VALUES (NEW.id, auth.uid(), 'created');
  END IF;

  -- Update last_activity_at
  NEW.last_activity_at = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update upvote count
CREATE OR REPLACE FUNCTION public.update_issue_upvotes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.issues
    SET upvotes = upvotes + 1
    WHERE id = NEW.issue_id;

    INSERT INTO public.issue_activity_log (issue_id, user_id, activity_type)
    VALUES (NEW.issue_id, NEW.user_id, 'upvoted');
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.issues
    SET upvotes = GREATEST(upvotes - 1, 0)
    WHERE id = OLD.issue_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate time metrics
CREATE OR REPLACE FUNCTION public.update_issue_time_metrics()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate time to triage
  IF OLD.status = 'new' AND NEW.status = 'triaged' AND NEW.time_to_triage IS NULL THEN
    NEW.time_to_triage = EXTRACT(EPOCH FROM (now() - NEW.created_at)) / 60;
  END IF;

  -- Calculate time to resolve
  IF NEW.status = 'resolved' AND NEW.time_to_resolve IS NULL THEN
    NEW.time_to_resolve = EXTRACT(EPOCH FROM (now() - NEW.created_at)) / 60;
    NEW.resolved_at = now();
    NEW.resolved_by = auth.uid();
  END IF;

  -- Calculate time to close
  IF NEW.status = 'closed' AND NEW.time_to_close IS NULL THEN
    NEW.time_to_close = EXTRACT(EPOCH FROM (now() - NEW.created_at)) / 60;
    NEW.closed_at = now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- PART 12: Triggers
-- =============================================================================

CREATE TRIGGER update_issues_updated_at
  BEFORE UPDATE ON public.issues
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER log_issue_activity_trigger
  BEFORE INSERT OR UPDATE ON public.issues
  FOR EACH ROW
  EXECUTE FUNCTION public.log_issue_activity();

CREATE TRIGGER update_issue_time_metrics_trigger
  BEFORE UPDATE ON public.issues
  FOR EACH ROW
  EXECUTE FUNCTION public.update_issue_time_metrics();

CREATE TRIGGER update_issue_upvotes_trigger
  AFTER INSERT OR DELETE ON public.issue_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_issue_upvotes();

CREATE TRIGGER update_issue_comments_updated_at
  BEFORE UPDATE ON public.issue_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- PART 13: Grant permissions
-- =============================================================================

GRANT SELECT, INSERT, UPDATE ON public.issues TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.issue_comments TO authenticated;
GRANT SELECT, INSERT ON public.issue_attachments TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.issue_votes TO authenticated;
GRANT SELECT ON public.issue_labels TO authenticated;
GRANT SELECT ON public.issue_label_assignments TO authenticated;
GRANT SELECT ON public.issue_activity_log TO authenticated;
GRANT SELECT ON public.issue_analytics TO authenticated;

-- =============================================================================
-- Migration Complete
-- =============================================================================

-- Summary:
-- 1. Created comprehensive issue tracking tables
-- 2. Added attachment support for screenshots and recordings
-- 3. Implemented commenting system with threading
-- 4. Created upvoting/voting system
-- 5. Added custom labeling system
-- 6. Implemented complete activity audit trail
-- 7. Created analytics materialized view
-- 8. Added automated time tracking metrics
-- 9. Comprehensive RLS policies
-- 10. All changes are additive and backward compatible
