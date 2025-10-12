-- Create comparison sessions table for storing insurance comparisons
CREATE TABLE IF NOT EXISTS comparison_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  option1_data JSONB NOT NULL,
  option2_data JSONB NOT NULL,
  comparison_results JSONB,
  report_url TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'completed', 'archived')),
  client_name TEXT,
  notes TEXT
);

-- Create extracted policies table for storing AI-extracted policy data
CREATE TABLE IF NOT EXISTS extracted_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES comparison_sessions(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  carrier TEXT NOT NULL,
  policy_number TEXT,
  document_path TEXT,
  extracted_data JSONB NOT NULL,
  confidence_scores JSONB,
  extraction_metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_comparison_sessions_account_id ON comparison_sessions(account_id);
CREATE INDEX IF NOT EXISTS idx_comparison_sessions_created_by ON comparison_sessions(created_by);
CREATE INDEX IF NOT EXISTS idx_comparison_sessions_status ON comparison_sessions(status);
CREATE INDEX IF NOT EXISTS idx_comparison_sessions_created_at ON comparison_sessions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_extracted_policies_session_id ON extracted_policies(session_id);
CREATE INDEX IF NOT EXISTS idx_extracted_policies_account_id ON extracted_policies(account_id);
CREATE INDEX IF NOT EXISTS idx_extracted_policies_carrier ON extracted_policies(carrier);

-- Enable RLS
ALTER TABLE comparison_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_policies ENABLE ROW LEVEL SECURITY;

-- RLS Policies for comparison_sessions
CREATE POLICY "Users can view comparison sessions for their accounts"
  ON comparison_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM account_memberships m
      WHERE m.account_id = comparison_sessions.account_id
      AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can create comparison sessions"
  ON comparison_sessions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM account_memberships m
      WHERE m.account_id = comparison_sessions.account_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'staff')
    )
  );

CREATE POLICY "Staff can update comparison sessions"
  ON comparison_sessions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM account_memberships m
      WHERE m.account_id = comparison_sessions.account_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM account_memberships m
      WHERE m.account_id = comparison_sessions.account_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'staff')
    )
  );

CREATE POLICY "Staff can delete comparison sessions"
  ON comparison_sessions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM account_memberships m
      WHERE m.account_id = comparison_sessions.account_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'staff')
    )
  );

-- RLS Policies for extracted_policies
CREATE POLICY "Users can view extracted policies for their accounts"
  ON extracted_policies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM account_memberships m
      WHERE m.account_id = extracted_policies.account_id
      AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can create extracted policies"
  ON extracted_policies FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM account_memberships m
      WHERE m.account_id = extracted_policies.account_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'staff')
    )
  );

CREATE POLICY "Staff can update extracted policies"
  ON extracted_policies FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM account_memberships m
      WHERE m.account_id = extracted_policies.account_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM account_memberships m
      WHERE m.account_id = extracted_policies.account_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'staff')
    )
  );

CREATE POLICY "Staff can delete extracted policies"
  ON extracted_policies FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM account_memberships m
      WHERE m.account_id = extracted_policies.account_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'staff')
    )
  );

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_comparison_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER comparison_sessions_updated_at
  BEFORE UPDATE ON comparison_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_comparison_sessions_updated_at();

CREATE OR REPLACE FUNCTION update_extracted_policies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER extracted_policies_updated_at
  BEFORE UPDATE ON extracted_policies
  FOR EACH ROW
  EXECUTE FUNCTION update_extracted_policies_updated_at();

-- Add helpful comments
COMMENT ON TABLE comparison_sessions IS 'Stores insurance comparison sessions with extracted data and analysis results';
COMMENT ON TABLE extracted_policies IS 'Stores AI-extracted policy data with confidence scores for comparison analysis';
COMMENT ON COLUMN comparison_sessions.option1_data IS 'Complete extracted insurance document data for option 1';
COMMENT ON COLUMN comparison_sessions.option2_data IS 'Complete extracted insurance document data for option 2';
COMMENT ON COLUMN comparison_sessions.comparison_results IS 'AI-generated comparison analysis results';
COMMENT ON COLUMN extracted_policies.confidence_scores IS 'AI extraction confidence scores for each data field';
COMMENT ON COLUMN extracted_policies.extraction_metadata IS 'Metadata about the extraction process (model used, processing time, etc.)';
