-- ============================================
-- ACORD Form Automation - Collaboration Features
-- Tables for comments, change requests, and collaboration
-- ============================================

-- ============================================
-- FORM COMMENTS TABLE
-- For collaboration comments on form fields/sections
-- ============================================

CREATE TABLE IF NOT EXISTS form_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID REFERENCES acord_forms(id) ON DELETE CASCADE,
  field_name VARCHAR(255),
  section_number INTEGER,
  content TEXT NOT NULL,
  author_id UUID REFERENCES auth.users(id),
  author_name VARCHAR(255),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for form_comments
CREATE INDEX IF NOT EXISTS idx_form_comments_form ON form_comments(form_id);
CREATE INDEX IF NOT EXISTS idx_form_comments_field ON form_comments(form_id, field_name) WHERE field_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_form_comments_unresolved ON form_comments(form_id) WHERE resolved_at IS NULL;

-- RLS for form_comments
ALTER TABLE form_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view comments on forms they have access to"
  ON form_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM acord_forms af
      WHERE af.id = form_comments.form_id
      AND af.created_by = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can create comments"
  ON form_comments FOR INSERT
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Comment authors can update their comments"
  ON form_comments FOR UPDATE
  USING (auth.uid() = author_id OR auth.uid() = resolved_by);

-- ============================================
-- FORM COMMENT REPLIES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS form_comment_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID REFERENCES form_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  author_id UUID REFERENCES auth.users(id),
  author_name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for form_comment_replies
CREATE INDEX IF NOT EXISTS idx_form_comment_replies_comment ON form_comment_replies(comment_id);

-- RLS for form_comment_replies
ALTER TABLE form_comment_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view replies on comments they can access"
  ON form_comment_replies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM form_comments fc
      JOIN acord_forms af ON af.id = fc.form_id
      WHERE fc.id = form_comment_replies.comment_id
      AND af.created_by = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can create replies"
  ON form_comment_replies FOR INSERT
  WITH CHECK (auth.uid() = author_id);

-- ============================================
-- FORM CHANGE REQUESTS TABLE
-- For reviewer workflow change requests
-- ============================================

CREATE TABLE IF NOT EXISTS form_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID REFERENCES acord_forms(id) ON DELETE CASCADE,
  field_name VARCHAR(255) NOT NULL,
  old_value JSONB,
  new_value JSONB NOT NULL,
  reason TEXT,
  requested_by UUID REFERENCES auth.users(id),
  requested_by_name VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_change_request_status CHECK (status IN ('pending', 'approved', 'rejected'))
);

-- Indexes for form_change_requests
CREATE INDEX IF NOT EXISTS idx_form_change_requests_form ON form_change_requests(form_id);
CREATE INDEX IF NOT EXISTS idx_form_change_requests_status ON form_change_requests(status);
CREATE INDEX IF NOT EXISTS idx_form_change_requests_pending ON form_change_requests(form_id) WHERE status = 'pending';

-- RLS for form_change_requests
ALTER TABLE form_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view change requests on their forms"
  ON form_change_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM acord_forms af
      WHERE af.id = form_change_requests.form_id
      AND af.created_by = auth.uid()
    )
    OR auth.uid() = requested_by
  );

CREATE POLICY "Authenticated users can create change requests"
  ON form_change_requests FOR INSERT
  WITH CHECK (auth.uid() = requested_by);

CREATE POLICY "Form owners can update change requests"
  ON form_change_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM acord_forms af
      WHERE af.id = form_change_requests.form_id
      AND af.created_by = auth.uid()
    )
  );

-- ============================================
-- FORM COLLABORATORS TABLE
-- Track who has access to collaborate on forms
-- ============================================

CREATE TABLE IF NOT EXISTS form_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID REFERENCES acord_forms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'viewer',
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,

  UNIQUE(form_id, user_id),
  CONSTRAINT valid_collaborator_role CHECK (role IN ('owner', 'editor', 'viewer', 'reviewer'))
);

-- Indexes for form_collaborators
CREATE INDEX IF NOT EXISTS idx_form_collaborators_form ON form_collaborators(form_id);
CREATE INDEX IF NOT EXISTS idx_form_collaborators_user ON form_collaborators(user_id);

-- RLS for form_collaborators
ALTER TABLE form_collaborators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view collaborators on forms they have access to"
  ON form_collaborators FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM acord_forms af
      WHERE af.id = form_collaborators.form_id
      AND af.created_by = auth.uid()
    )
  );

CREATE POLICY "Form owners can manage collaborators"
  ON form_collaborators FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM acord_forms af
      WHERE af.id = form_collaborators.form_id
      AND af.created_by = auth.uid()
    )
  );

-- ============================================
-- UPDATE TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION update_form_comments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_form_comments_updated_at
  BEFORE UPDATE ON form_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_form_comments_updated_at();

-- ============================================
-- ADD VALIDATION_STATUS TO ACORD_FORMS IF NOT EXISTS
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acord_forms' AND column_name = 'validation_status') THEN
    ALTER TABLE acord_forms ADD COLUMN validation_status VARCHAR(20) DEFAULT 'pending';
  END IF;
END $$;

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

GRANT ALL ON form_comments TO authenticated;
GRANT ALL ON form_comment_replies TO authenticated;
GRANT ALL ON form_change_requests TO authenticated;
GRANT ALL ON form_collaborators TO authenticated;
