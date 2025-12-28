-- ============================================================================
-- PREDICTIVE ANALYTICS SUITE
-- ============================================================================
-- Comprehensive implementation for:
-- 1. Retention/Churn Risk Scoring (enhanced)
-- 2. AI Task Generation from Documents
-- 3. Coverage Gap Analysis
-- ============================================================================

-- ============================================================================
-- 1. RETENTION MODEL CONFIGURATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS retention_model_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  agency_workspace_id UUID REFERENCES agency_workspaces(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  version TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,

  -- Model configuration
  config JSONB NOT NULL DEFAULT '{
    "weights": {
      "days_since_contact": 0.15,
      "premium_change_pct": 0.20,
      "claim_count_12mo": 0.15,
      "payment_issues": 0.15,
      "tenure_days": -0.10,
      "bundle_count": -0.10,
      "endorsement_count": 0.05,
      "service_tickets": 0.10
    },
    "thresholds": {
      "low": 0.25,
      "medium": 0.50,
      "high": 0.75
    },
    "windows": {
      "renewal_days_ahead": 60,
      "contact_stale_days": 90,
      "claim_lookback_months": 12,
      "payment_lookback_days": 90
    }
  }',

  notes TEXT,

  CONSTRAINT retention_model_configs_unique UNIQUE (agency_workspace_id, name, version)
);

-- Enable RLS
ALTER TABLE retention_model_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency admins can manage retention configs" ON retention_model_configs
  FOR ALL USING (
    agency_workspace_id IS NULL OR
    EXISTS (
      SELECT 1 FROM agency_workspace_memberships m
      WHERE m.agency_workspace_id = retention_model_configs.agency_workspace_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
        AND m.status = 'active'
    )
  );

-- Insert default model config
INSERT INTO retention_model_configs (name, version, enabled, notes)
VALUES ('renewal_risk_v1', 'v1.0.0', TRUE, 'Default renewal risk scoring model')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 2. POLICY RENEWAL RISK SCORES
-- ============================================================================

CREATE TABLE IF NOT EXISTS policy_renewal_risk_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  agency_workspace_id UUID REFERENCES agency_workspaces(id) ON DELETE CASCADE,
  account_id UUID NOT NULL,
  policy_id UUID NOT NULL,

  renewal_date DATE NOT NULL,
  score NUMERIC(5,4) NOT NULL CHECK (score >= 0 AND score <= 1),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),

  -- Explainability
  top_factors JSONB NOT NULL DEFAULT '[]',
  scoring_inputs JSONB,

  -- Model tracking
  model_name TEXT NOT NULL,
  model_version TEXT NOT NULL,

  -- Idempotency
  idempotency_key TEXT NOT NULL,

  CONSTRAINT policy_renewal_risk_scores_idempotency UNIQUE (idempotency_key)
);

CREATE INDEX idx_policy_renewal_risk_account ON policy_renewal_risk_scores(account_id);
CREATE INDEX idx_policy_renewal_risk_policy ON policy_renewal_risk_scores(policy_id);
CREATE INDEX idx_policy_renewal_risk_level ON policy_renewal_risk_scores(risk_level);
CREATE INDEX idx_policy_renewal_risk_date ON policy_renewal_risk_scores(renewal_date);
CREATE INDEX idx_policy_renewal_risk_agency ON policy_renewal_risk_scores(agency_workspace_id);

ALTER TABLE policy_renewal_risk_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view policy risk scores for their accounts" ON policy_renewal_risk_scores
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM accounts a
      JOIN agency_workspace_memberships m ON m.agency_workspace_id = a.agency_workspace_id
      WHERE a.id = policy_renewal_risk_scores.account_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

CREATE POLICY "Service role can manage policy risk scores" ON policy_renewal_risk_scores
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- ============================================================================
-- 3. ACCOUNT CHURN RISK SCORES
-- ============================================================================

CREATE TABLE IF NOT EXISTS account_churn_risk_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  agency_workspace_id UUID REFERENCES agency_workspaces(id) ON DELETE CASCADE,
  account_id UUID NOT NULL,

  score NUMERIC(5,4) NOT NULL CHECK (score >= 0 AND score <= 1),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),

  -- Explainability
  top_factors JSONB NOT NULL DEFAULT '[]',
  policy_risk_summary JSONB,

  -- Model tracking
  model_name TEXT NOT NULL,
  model_version TEXT NOT NULL,
  run_date DATE NOT NULL,

  -- Idempotency
  idempotency_key TEXT NOT NULL,

  CONSTRAINT account_churn_risk_scores_idempotency UNIQUE (idempotency_key)
);

CREATE INDEX idx_account_churn_risk_account ON account_churn_risk_scores(account_id);
CREATE INDEX idx_account_churn_risk_level ON account_churn_risk_scores(risk_level);
CREATE INDEX idx_account_churn_risk_agency ON account_churn_risk_scores(agency_workspace_id);

ALTER TABLE account_churn_risk_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view account churn scores" ON account_churn_risk_scores
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM accounts a
      JOIN agency_workspace_memberships m ON m.agency_workspace_id = a.agency_workspace_id
      WHERE a.id = account_churn_risk_scores.account_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

CREATE POLICY "Service role can manage account churn scores" ON account_churn_risk_scores
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- ============================================================================
-- 4. ANALYTICS JOB RUNS (Shared across features)
-- ============================================================================

CREATE TABLE IF NOT EXISTS analytics_job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  agency_workspace_id UUID REFERENCES agency_workspaces(id) ON DELETE CASCADE,

  job_type TEXT NOT NULL CHECK (job_type IN (
    'renewal_scoring',
    'account_churn_scoring',
    'document_analysis',
    'coverage_gap_detection',
    'task_generation'
  )),

  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN (
    'created', 'running', 'completed', 'failed', 'cancelled'
  )),

  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,

  model_name TEXT,
  model_version TEXT,

  stats JSONB DEFAULT '{}',
  error TEXT,
  error_details JSONB,

  triggered_by TEXT DEFAULT 'cron'
);

CREATE INDEX idx_analytics_job_runs_type ON analytics_job_runs(job_type);
CREATE INDEX idx_analytics_job_runs_status ON analytics_job_runs(status);
CREATE INDEX idx_analytics_job_runs_created ON analytics_job_runs(created_at DESC);

ALTER TABLE analytics_job_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view job runs" ON analytics_job_runs
  FOR SELECT USING (
    agency_workspace_id IS NULL OR
    EXISTS (
      SELECT 1 FROM agency_workspace_memberships m
      WHERE m.agency_workspace_id = analytics_job_runs.agency_workspace_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
        AND m.status = 'active'
    )
  );

CREATE POLICY "Service role can manage job runs" ON analytics_job_runs
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- ============================================================================
-- 5. DOCUMENT ANALYSIS JOBS
-- ============================================================================

CREATE TABLE IF NOT EXISTS document_analysis_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  agency_workspace_id UUID REFERENCES agency_workspaces(id) ON DELETE CASCADE,
  account_id UUID,
  document_id UUID,
  document_storage_path TEXT,

  source TEXT NOT NULL CHECK (source IN ('upload', 'canopy', 'email', 'api')),

  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'running', 'completed', 'failed', 'skipped'
  )),

  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,

  analyzer_version TEXT NOT NULL DEFAULT 'doc_tasks_v1',
  doc_fingerprint TEXT,

  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,

  error TEXT,
  stats JSONB DEFAULT '{}',

  -- Idempotency by fingerprint + version
  CONSTRAINT document_analysis_jobs_fingerprint UNIQUE (doc_fingerprint, analyzer_version)
);

CREATE INDEX idx_document_analysis_jobs_status ON document_analysis_jobs(status);
CREATE INDEX idx_document_analysis_jobs_account ON document_analysis_jobs(account_id);
CREATE INDEX idx_document_analysis_jobs_queued ON document_analysis_jobs(status, created_at)
  WHERE status = 'queued';

ALTER TABLE document_analysis_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their document analysis jobs" ON document_analysis_jobs
  FOR SELECT USING (
    account_id IS NULL OR
    EXISTS (
      SELECT 1 FROM accounts a
      JOIN agency_workspace_memberships m ON m.agency_workspace_id = a.agency_workspace_id
      WHERE a.id = document_analysis_jobs.account_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

CREATE POLICY "Service role can manage document analysis jobs" ON document_analysis_jobs
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- ============================================================================
-- 6. DOCUMENT INSIGHTS (AI-extracted)
-- ============================================================================

CREATE TABLE IF NOT EXISTS document_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  agency_workspace_id UUID REFERENCES agency_workspaces(id) ON DELETE CASCADE,
  account_id UUID,
  document_id UUID,
  job_id UUID REFERENCES document_analysis_jobs(id) ON DELETE SET NULL,

  analyzer_version TEXT NOT NULL,

  -- AI output
  summary TEXT,
  extracted_entities JSONB DEFAULT '{}',
  suggested_tasks JSONB DEFAULT '[]',
  raw_evidence JSONB DEFAULT '[]',
  missing_context_questions JSONB DEFAULT '[]',

  -- AI tracking
  ai_provider TEXT,
  ai_model TEXT,
  tokens_used INT,

  -- Idempotency
  idempotency_key TEXT NOT NULL,

  CONSTRAINT document_insights_idempotency UNIQUE (idempotency_key)
);

CREATE INDEX idx_document_insights_document ON document_insights(document_id);
CREATE INDEX idx_document_insights_account ON document_insights(account_id);

ALTER TABLE document_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view document insights" ON document_insights
  FOR SELECT USING (
    account_id IS NULL OR
    EXISTS (
      SELECT 1 FROM accounts a
      JOIN agency_workspace_memberships m ON m.agency_workspace_id = a.agency_workspace_id
      WHERE a.id = document_insights.account_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

CREATE POLICY "Service role can manage document insights" ON document_insights
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- ============================================================================
-- 7. ENHANCED TASKS TABLE (add AI-related columns if not exist)
-- ============================================================================

-- Add columns to existing tasks table for AI integration
DO $$
BEGIN
  -- Add source column if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'source') THEN
    ALTER TABLE tasks ADD COLUMN source TEXT DEFAULT 'manual';
  END IF;

  -- Add confidence column if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'confidence') THEN
    ALTER TABLE tasks ADD COLUMN confidence NUMERIC(3,2);
  END IF;

  -- Add evidence column if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'evidence') THEN
    ALTER TABLE tasks ADD COLUMN evidence JSONB;
  END IF;

  -- Add ai_generated flag if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'ai_generated') THEN
    ALTER TABLE tasks ADD COLUMN ai_generated BOOLEAN DEFAULT FALSE;
  END IF;

  -- Add suggested_assignee_role if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'suggested_assignee_role') THEN
    ALTER TABLE tasks ADD COLUMN suggested_assignee_role TEXT;
  END IF;

  -- Add document_id reference if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'document_id') THEN
    ALTER TABLE tasks ADD COLUMN document_id UUID;
  END IF;

  -- Add idempotency_key if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'idempotency_key') THEN
    ALTER TABLE tasks ADD COLUMN idempotency_key TEXT;
  END IF;
END $$;

-- Create index on idempotency_key if not exists
CREATE INDEX IF NOT EXISTS idx_tasks_idempotency ON tasks(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_ai_generated ON tasks(ai_generated) WHERE ai_generated = TRUE;
CREATE INDEX IF NOT EXISTS idx_tasks_source ON tasks(source);

-- ============================================================================
-- 8. COVERAGE GAP RULES
-- ============================================================================

CREATE TABLE IF NOT EXISTS coverage_gap_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  agency_workspace_id UUID REFERENCES agency_workspaces(id) ON DELETE CASCADE,

  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  rule_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,

  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),

  -- Rule logic
  logic JSONB NOT NULL DEFAULT '{}',

  -- What lines this applies to
  applies_to_lines JSONB DEFAULT '[]',

  -- Recommended action template
  recommended_action TEXT,

  CONSTRAINT coverage_gap_rules_unique UNIQUE (agency_workspace_id, rule_key)
);

ALTER TABLE coverage_gap_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view coverage gap rules" ON coverage_gap_rules
  FOR SELECT USING (
    agency_workspace_id IS NULL OR
    EXISTS (
      SELECT 1 FROM agency_workspace_memberships m
      WHERE m.agency_workspace_id = coverage_gap_rules.agency_workspace_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

CREATE POLICY "Admins can manage coverage gap rules" ON coverage_gap_rules
  FOR ALL USING (
    agency_workspace_id IS NULL OR
    EXISTS (
      SELECT 1 FROM agency_workspace_memberships m
      WHERE m.agency_workspace_id = coverage_gap_rules.agency_workspace_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
        AND m.status = 'active'
    )
  );

-- Insert default rules
INSERT INTO coverage_gap_rules (rule_key, name, description, severity, logic, applies_to_lines, recommended_action)
VALUES
  ('auto_no_home', 'Auto without Home/Renters',
   'Customer has auto insurance but no property coverage', 'medium',
   '{"requires": ["auto"], "missing": ["homeowners", "renters", "condo"]}',
   '["auto"]',
   'Contact customer to discuss bundling auto with home/renters for potential savings'),

  ('home_no_auto', 'Home without Auto',
   'Customer has home insurance but no auto coverage', 'medium',
   '{"requires": ["homeowners", "renters", "condo"], "missing": ["auto"]}',
   '["homeowners", "renters", "condo"]',
   'Discuss auto insurance options and bundling benefits'),

  ('high_liability_no_umbrella', 'High Liability without Umbrella',
   'Customer has high liability limits but no umbrella policy', 'high',
   '{"requires_liability_min": 300000, "missing": ["umbrella", "personal_umbrella"]}',
   '["auto", "homeowners"]',
   'Recommend umbrella policy for comprehensive liability protection'),

  ('single_policy_bundle', 'Single Policy - Bundle Opportunity',
   'Customer has only one policy line - bundling opportunity', 'low',
   '{"max_lines": 1, "eligible_for_bundle": true}',
   '["auto", "homeowners", "renters"]',
   'Discuss multi-policy discounts and bundling options'),

  ('commercial_no_cyber', 'Commercial without Cyber',
   'Commercial customer without cyber liability coverage', 'high',
   '{"requires": ["commercial_general_liability", "bop"], "missing": ["cyber", "cyber_liability"]}',
   '["commercial_general_liability", "bop"]',
   'Discuss cyber liability protection given increasing digital threats'),

  ('commercial_no_epli', 'Commercial without EPLI',
   'Commercial customer with employees but no EPLI', 'medium',
   '{"requires": ["workers_comp"], "missing": ["epli", "employment_practices"]}',
   '["workers_comp"]',
   'Recommend Employment Practices Liability Insurance')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 9. COVERAGE GAP OPPORTUNITIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS coverage_gap_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  agency_workspace_id UUID REFERENCES agency_workspaces(id) ON DELETE CASCADE,
  account_id UUID NOT NULL,
  related_policy_id UUID,

  opportunity_key TEXT NOT NULL,
  rule_id UUID REFERENCES coverage_gap_rules(id) ON DELETE SET NULL,

  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.80,

  -- Explainability
  rationale JSONB NOT NULL DEFAULT '{}',
  current_coverage_summary JSONB DEFAULT '{}',

  recommended_next_step TEXT,
  estimated_premium NUMERIC,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
    'new', 'suggested_task_created', 'contacted', 'quoted', 'dismissed', 'converted'
  )),

  dismissed_reason TEXT,
  dismissed_at TIMESTAMPTZ,
  dismissed_by UUID,

  converted_policy_id UUID,
  converted_at TIMESTAMPTZ,

  -- Detection tracking
  detection_version TEXT NOT NULL DEFAULT 'v1.0.0',
  last_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Idempotency
  idempotency_key TEXT NOT NULL,

  CONSTRAINT coverage_gap_opportunities_idempotency UNIQUE (idempotency_key)
);

CREATE INDEX idx_coverage_gap_opp_account ON coverage_gap_opportunities(account_id);
CREATE INDEX idx_coverage_gap_opp_status ON coverage_gap_opportunities(status);
CREATE INDEX idx_coverage_gap_opp_severity ON coverage_gap_opportunities(severity);
CREATE INDEX idx_coverage_gap_opp_agency ON coverage_gap_opportunities(agency_workspace_id);

ALTER TABLE coverage_gap_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view coverage gap opportunities" ON coverage_gap_opportunities
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM accounts a
      JOIN agency_workspace_memberships m ON m.agency_workspace_id = a.agency_workspace_id
      WHERE a.id = coverage_gap_opportunities.account_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

CREATE POLICY "Users can update coverage gap opportunities" ON coverage_gap_opportunities
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM accounts a
      JOIN agency_workspace_memberships m ON m.agency_workspace_id = a.agency_workspace_id
      WHERE a.id = coverage_gap_opportunities.account_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

CREATE POLICY "Service role can manage coverage gap opportunities" ON coverage_gap_opportunities
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- ============================================================================
-- 10. RPC FUNCTIONS
-- ============================================================================

-- Get upcoming renewals for scoring
CREATE OR REPLACE FUNCTION get_upcoming_renewals(
  p_agency_workspace_id UUID,
  p_days_ahead INT DEFAULT 60,
  p_account_id UUID DEFAULT NULL
)
RETURNS TABLE (
  policy_id UUID,
  account_id UUID,
  account_name TEXT,
  policy_number TEXT,
  line_of_business TEXT,
  carrier_name TEXT,
  premium NUMERIC,
  effective_date DATE,
  expiration_date DATE,
  days_to_renewal INT,
  assigned_to UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id AS policy_id,
    p.account_id,
    a.name AS account_name,
    p.policy_number,
    p.line_of_business,
    c.name AS carrier_name,
    p.premium,
    p.effective_date,
    p.expiration_date,
    (p.expiration_date - CURRENT_DATE)::INT AS days_to_renewal,
    p.assigned_to
  FROM policies p
  JOIN accounts a ON p.account_id = a.id
  LEFT JOIN carriers c ON p.carrier_id = c.id
  WHERE a.agency_workspace_id = p_agency_workspace_id
    AND p.status = 'active'
    AND p.expiration_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + p_days_ahead)
    AND p.deleted_at IS NULL
    AND (p_account_id IS NULL OR p.account_id = p_account_id)
  ORDER BY p.expiration_date ASC;
END;
$$;

-- Get account insurance profile for gap analysis
CREATE OR REPLACE FUNCTION get_account_insurance_profile(
  p_account_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_lines JSONB;
  v_policy_count INT;
  v_total_premium NUMERIC;
  v_tenure_days INT;
  v_max_liability NUMERIC;
BEGIN
  -- Get active policy lines
  SELECT
    jsonb_agg(DISTINCT p.line_of_business),
    COUNT(*),
    COALESCE(SUM(p.premium), 0),
    COALESCE(MAX(CURRENT_DATE - p.effective_date), 0)
  INTO v_lines, v_policy_count, v_total_premium, v_tenure_days
  FROM policies p
  WHERE p.account_id = p_account_id
    AND p.status = 'active'
    AND p.deleted_at IS NULL;

  -- Get max liability limit from coverages
  SELECT COALESCE(MAX(
    CASE
      WHEN qc.coverage_type ILIKE '%liability%' THEN qc.limit_amount
      ELSE 0
    END
  ), 0)
  INTO v_max_liability
  FROM quotes q
  JOIN quote_coverages qc ON qc.quote_id = q.id
  WHERE q.account_id = p_account_id
    AND q.status = 'accepted';

  v_result := jsonb_build_object(
    'account_id', p_account_id,
    'lines_held', COALESCE(v_lines, '[]'::JSONB),
    'policy_count', COALESCE(v_policy_count, 0),
    'total_premium', COALESCE(v_total_premium, 0),
    'tenure_days', COALESCE(v_tenure_days, 0),
    'max_liability_limit', COALESCE(v_max_liability, 0),
    'has_auto', COALESCE(v_lines, '[]'::JSONB) ? 'auto',
    'has_home', (COALESCE(v_lines, '[]'::JSONB) ? 'homeowners' OR
                 COALESCE(v_lines, '[]'::JSONB) ? 'home'),
    'has_renters', COALESCE(v_lines, '[]'::JSONB) ? 'renters',
    'has_umbrella', (COALESCE(v_lines, '[]'::JSONB) ? 'umbrella' OR
                     COALESCE(v_lines, '[]'::JSONB) ? 'personal_umbrella'),
    'has_commercial', (COALESCE(v_lines, '[]'::JSONB) ? 'commercial_general_liability' OR
                       COALESCE(v_lines, '[]'::JSONB) ? 'bop'),
    'has_cyber', (COALESCE(v_lines, '[]'::JSONB) ? 'cyber' OR
                  COALESCE(v_lines, '[]'::JSONB) ? 'cyber_liability'),
    'has_workers_comp', COALESCE(v_lines, '[]'::JSONB) ? 'workers_comp',
    'generated_at', NOW()
  );

  RETURN v_result;
END;
$$;

-- Compute retention factors for a policy
CREATE OR REPLACE FUNCTION compute_policy_retention_factors(
  p_policy_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_policy RECORD;
  v_days_since_contact INT;
  v_claim_count INT;
  v_tenure_days INT;
  v_bundle_count INT;
  v_payment_issues INT;
BEGIN
  -- Get policy details
  SELECT p.*, a.id AS acc_id, a.agency_workspace_id
  INTO v_policy
  FROM policies p
  JOIN accounts a ON p.account_id = a.id
  WHERE p.id = p_policy_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Days since last contact (from tasks or communications)
  SELECT COALESCE(CURRENT_DATE - MAX(t.completed_at)::DATE, 365)
  INTO v_days_since_contact
  FROM tasks t
  WHERE t.account_id = v_policy.account_id
    AND t.status = 'completed';

  -- Claim count in last 12 months
  SELECT COUNT(*)
  INTO v_claim_count
  FROM claims c
  WHERE c.policy_id = p_policy_id
    AND c.created_at > NOW() - INTERVAL '12 months';

  -- Tenure (days since first policy)
  SELECT COALESCE(CURRENT_DATE - MIN(effective_date), 0)
  INTO v_tenure_days
  FROM policies
  WHERE account_id = v_policy.account_id
    AND deleted_at IS NULL;

  -- Bundle count (active policies on account)
  SELECT COUNT(*)
  INTO v_bundle_count
  FROM policies
  WHERE account_id = v_policy.account_id
    AND status = 'active'
    AND deleted_at IS NULL;

  -- Payment issues (placeholder - would need payment table)
  v_payment_issues := 0;

  v_result := jsonb_build_object(
    'policy_id', p_policy_id,
    'account_id', v_policy.account_id,
    'days_to_renewal', v_policy.expiration_date - CURRENT_DATE,
    'days_since_contact', v_days_since_contact,
    'claim_count_12mo', v_claim_count,
    'tenure_days', v_tenure_days,
    'bundle_count', v_bundle_count,
    'payment_issues', v_payment_issues,
    'premium', v_policy.premium,
    'line_of_business', v_policy.line_of_business,
    'computed_at', NOW()
  );

  RETURN v_result;
END;
$$;

-- List coverage gap opportunities with filters
CREATE OR REPLACE FUNCTION list_coverage_gap_opportunities(
  p_agency_workspace_id UUID,
  p_status TEXT DEFAULT NULL,
  p_severity TEXT DEFAULT NULL,
  p_account_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 100,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  account_id UUID,
  account_name TEXT,
  opportunity_key TEXT,
  severity TEXT,
  confidence NUMERIC,
  rationale JSONB,
  recommended_next_step TEXT,
  estimated_premium NUMERIC,
  status TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cgo.id,
    cgo.account_id,
    a.name AS account_name,
    cgo.opportunity_key,
    cgo.severity,
    cgo.confidence,
    cgo.rationale,
    cgo.recommended_next_step,
    cgo.estimated_premium,
    cgo.status,
    cgo.created_at
  FROM coverage_gap_opportunities cgo
  JOIN accounts a ON cgo.account_id = a.id
  WHERE a.agency_workspace_id = p_agency_workspace_id
    AND (p_status IS NULL OR cgo.status = p_status)
    AND (p_severity IS NULL OR cgo.severity = p_severity)
    AND (p_account_id IS NULL OR cgo.account_id = p_account_id)
  ORDER BY
    CASE cgo.severity
      WHEN 'high' THEN 1
      WHEN 'medium' THEN 2
      WHEN 'low' THEN 3
    END,
    cgo.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_upcoming_renewals TO authenticated;
GRANT EXECUTE ON FUNCTION get_upcoming_renewals TO service_role;
GRANT EXECUTE ON FUNCTION get_account_insurance_profile TO authenticated;
GRANT EXECUTE ON FUNCTION get_account_insurance_profile TO service_role;
GRANT EXECUTE ON FUNCTION compute_policy_retention_factors TO service_role;
GRANT EXECUTE ON FUNCTION list_coverage_gap_opportunities TO authenticated;
GRANT EXECUTE ON FUNCTION list_coverage_gap_opportunities TO service_role;

-- ============================================================================
-- 11. UPDATED_AT TRIGGERS
-- ============================================================================

CREATE TRIGGER retention_model_configs_updated_at
  BEFORE UPDATE ON retention_model_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER document_analysis_jobs_updated_at
  BEFORE UPDATE ON document_analysis_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER coverage_gap_rules_updated_at
  BEFORE UPDATE ON coverage_gap_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER coverage_gap_opportunities_updated_at
  BEFORE UPDATE ON coverage_gap_opportunities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE retention_model_configs IS 'Configuration for retention/churn risk scoring models';
COMMENT ON TABLE policy_renewal_risk_scores IS 'Computed renewal risk scores per policy';
COMMENT ON TABLE account_churn_risk_scores IS 'Aggregated churn risk scores per account';
COMMENT ON TABLE analytics_job_runs IS 'Audit trail for analytics pipeline runs';
COMMENT ON TABLE document_analysis_jobs IS 'Queue for document AI processing';
COMMENT ON TABLE document_insights IS 'AI-extracted insights and suggested tasks from documents';
COMMENT ON TABLE coverage_gap_rules IS 'Configurable rules for detecting coverage gaps';
COMMENT ON TABLE coverage_gap_opportunities IS 'Detected cross-sell and coverage gap opportunities';
