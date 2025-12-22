-- ============================================================================
-- Workers' Compensation Policy Details
-- ============================================================================
-- Adds comprehensive WC-specific fields to policies table
-- Stores classifications, experience mods, officer elections, and premium details

-- Add WC details JSONB column to policies table
ALTER TABLE policies
ADD COLUMN IF NOT EXISTS wc_details JSONB;

-- Add carrier NAIC code
ALTER TABLE policies
ADD COLUMN IF NOT EXISTS carrier_naic VARCHAR(10);

-- Add FEIN (Federal Employer ID)
ALTER TABLE policies
ADD COLUMN IF NOT EXISTS fein VARCHAR(20);

-- Add named insured and DBA
ALTER TABLE policies
ADD COLUMN IF NOT EXISTS named_insured TEXT;

ALTER TABLE policies
ADD COLUMN IF NOT EXISTS dba TEXT;

-- Add issue date
ALTER TABLE policies
ADD COLUMN IF NOT EXISTS issue_date DATE;

-- Add document source tracking
ALTER TABLE policies
ADD COLUMN IF NOT EXISTS extraction_source VARCHAR(50);

ALTER TABLE policies
ADD COLUMN IF NOT EXISTS extraction_confidence NUMERIC(5,2);

ALTER TABLE policies
ADD COLUMN IF NOT EXISTS extracted_from_document_id UUID REFERENCES documents(id);

-- Create index on wc_details for querying
CREATE INDEX IF NOT EXISTS idx_policies_wc_details ON policies USING GIN (wc_details);

-- Create index on line_of_business for WC filtering
CREATE INDEX IF NOT EXISTS idx_policies_line_of_business ON policies (line_of_business);

-- ============================================================================
-- WC Classifications Table (normalized for reporting)
-- ============================================================================
-- Stores individual class codes for a policy

CREATE TABLE IF NOT EXISTS policy_wc_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  state VARCHAR(2) NOT NULL,
  class_code VARCHAR(10) NOT NULL,
  description TEXT,
  exposure_basis VARCHAR(20) DEFAULT 'payroll',
  estimated_payroll NUMERIC(15,2),
  rate NUMERIC(10,4),
  premium NUMERIC(15,2),
  is_governing_class BOOLEAN DEFAULT false,
  is_standard_exception BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_exposure_basis CHECK (exposure_basis IN ('payroll', 'per_capita', 'other'))
);

-- Indexes for classifications
CREATE INDEX IF NOT EXISTS idx_wc_classifications_policy ON policy_wc_classifications(policy_id);
CREATE INDEX IF NOT EXISTS idx_wc_classifications_class_code ON policy_wc_classifications(class_code);
CREATE INDEX IF NOT EXISTS idx_wc_classifications_state ON policy_wc_classifications(state);

-- ============================================================================
-- WC Officer Elections Table (critical for compliance)
-- ============================================================================
-- Tracks officer/owner inclusion/exclusion elections

CREATE TABLE IF NOT EXISTS policy_wc_officers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT,
  ownership_percent NUMERIC(5,2),
  is_included BOOLEAN NOT NULL DEFAULT true,
  annual_remuneration NUMERIC(15,2),
  duties TEXT,
  officer_type VARCHAR(30) DEFAULT 'officer', -- officer, partner, llc_member, sole_proprietor
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_officer_type CHECK (officer_type IN ('officer', 'partner', 'llc_member', 'sole_proprietor'))
);

-- Index for officers
CREATE INDEX IF NOT EXISTS idx_wc_officers_policy ON policy_wc_officers(policy_id);

-- ============================================================================
-- WC Experience Mod History Table
-- ============================================================================
-- Tracks experience mod changes over time

CREATE TABLE IF NOT EXISTS policy_wc_experience_mods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  experience_mod NUMERIC(5,3) NOT NULL, -- e.g., 0.850, 1.150
  effective_date DATE NOT NULL,
  rating_bureau VARCHAR(50) DEFAULT 'NCCI',
  schedule_rating_percent NUMERIC(5,2),
  schedule_rating_type VARCHAR(10), -- 'credit' or 'debit'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for experience mods
CREATE INDEX IF NOT EXISTS idx_wc_experience_mods_policy ON policy_wc_experience_mods(policy_id);

-- ============================================================================
-- WC Covered States Table
-- ============================================================================
-- Tracks which states are covered and how

CREATE TABLE IF NOT EXISTS policy_wc_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  state VARCHAR(2) NOT NULL,
  coverage_type VARCHAR(20) NOT NULL, -- 'item_3a', 'item_3c', 'monopolistic'
  is_monopolistic BOOLEAN DEFAULT false,
  state_premium NUMERIC(15,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_coverage_type CHECK (coverage_type IN ('item_3a', 'item_3c', 'monopolistic')),
  CONSTRAINT unique_policy_state UNIQUE (policy_id, state)
);

-- Index for states
CREATE INDEX IF NOT EXISTS idx_wc_states_policy ON policy_wc_states(policy_id);

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE policy_wc_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_wc_officers ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_wc_experience_mods ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_wc_states ENABLE ROW LEVEL SECURITY;

-- Classifications RLS
CREATE POLICY "Users can view WC classifications for their policies" ON policy_wc_classifications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM policies p
      JOIN accounts a ON p.account_id = a.id
      WHERE p.id = policy_wc_classifications.policy_id
      AND (a.owner_agent_id = auth.uid() OR EXISTS (
        SELECT 1 FROM account_memberships am WHERE am.account_id = a.id AND am.user_id = auth.uid()
      ))
    )
  );

CREATE POLICY "Users can insert WC classifications for their policies" ON policy_wc_classifications
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM policies p
      JOIN accounts a ON p.account_id = a.id
      WHERE p.id = policy_wc_classifications.policy_id
      AND (a.owner_agent_id = auth.uid() OR EXISTS (
        SELECT 1 FROM account_memberships am WHERE am.account_id = a.id AND am.user_id = auth.uid()
      ))
    )
  );

CREATE POLICY "Users can update WC classifications for their policies" ON policy_wc_classifications
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM policies p
      JOIN accounts a ON p.account_id = a.id
      WHERE p.id = policy_wc_classifications.policy_id
      AND (a.owner_agent_id = auth.uid() OR EXISTS (
        SELECT 1 FROM account_memberships am WHERE am.account_id = a.id AND am.user_id = auth.uid()
      ))
    )
  );

CREATE POLICY "Users can delete WC classifications for their policies" ON policy_wc_classifications
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM policies p
      JOIN accounts a ON p.account_id = a.id
      WHERE p.id = policy_wc_classifications.policy_id
      AND (a.owner_agent_id = auth.uid() OR EXISTS (
        SELECT 1 FROM account_memberships am WHERE am.account_id = a.id AND am.user_id = auth.uid()
      ))
    )
  );

-- Officers RLS (same pattern)
CREATE POLICY "Users can view WC officers for their policies" ON policy_wc_officers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM policies p
      JOIN accounts a ON p.account_id = a.id
      WHERE p.id = policy_wc_officers.policy_id
      AND (a.owner_agent_id = auth.uid() OR EXISTS (
        SELECT 1 FROM account_memberships am WHERE am.account_id = a.id AND am.user_id = auth.uid()
      ))
    )
  );

CREATE POLICY "Users can manage WC officers for their policies" ON policy_wc_officers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM policies p
      JOIN accounts a ON p.account_id = a.id
      WHERE p.id = policy_wc_officers.policy_id
      AND (a.owner_agent_id = auth.uid() OR EXISTS (
        SELECT 1 FROM account_memberships am WHERE am.account_id = a.id AND am.user_id = auth.uid()
      ))
    )
  );

-- Experience Mods RLS
CREATE POLICY "Users can view WC experience mods for their policies" ON policy_wc_experience_mods
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM policies p
      JOIN accounts a ON p.account_id = a.id
      WHERE p.id = policy_wc_experience_mods.policy_id
      AND (a.owner_agent_id = auth.uid() OR EXISTS (
        SELECT 1 FROM account_memberships am WHERE am.account_id = a.id AND am.user_id = auth.uid()
      ))
    )
  );

CREATE POLICY "Users can manage WC experience mods for their policies" ON policy_wc_experience_mods
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM policies p
      JOIN accounts a ON p.account_id = a.id
      WHERE p.id = policy_wc_experience_mods.policy_id
      AND (a.owner_agent_id = auth.uid() OR EXISTS (
        SELECT 1 FROM account_memberships am WHERE am.account_id = a.id AND am.user_id = auth.uid()
      ))
    )
  );

-- States RLS
CREATE POLICY "Users can view WC states for their policies" ON policy_wc_states
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM policies p
      JOIN accounts a ON p.account_id = a.id
      WHERE p.id = policy_wc_states.policy_id
      AND (a.owner_agent_id = auth.uid() OR EXISTS (
        SELECT 1 FROM account_memberships am WHERE am.account_id = a.id AND am.user_id = auth.uid()
      ))
    )
  );

CREATE POLICY "Users can manage WC states for their policies" ON policy_wc_states
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM policies p
      JOIN accounts a ON p.account_id = a.id
      WHERE p.id = policy_wc_states.policy_id
      AND (a.owner_agent_id = auth.uid() OR EXISTS (
        SELECT 1 FROM account_memberships am WHERE am.account_id = a.id AND am.user_id = auth.uid()
      ))
    )
  );

-- ============================================================================
-- Helper Function: Check if policy is Workers' Comp
-- ============================================================================

CREATE OR REPLACE FUNCTION is_workers_comp_policy(policy_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM policies
    WHERE id = policy_id
    AND LOWER(line_of_business) LIKE '%work%comp%'
  );
$$;

-- ============================================================================
-- Comment on tables
-- ============================================================================

COMMENT ON COLUMN policies.wc_details IS 'JSONB storage for Workers'' Comp specific details (WCPolicyDetails type)';
COMMENT ON TABLE policy_wc_classifications IS 'Normalized WC class codes for reporting and analysis';
COMMENT ON TABLE policy_wc_officers IS 'Officer/owner inclusion/exclusion elections';
COMMENT ON TABLE policy_wc_experience_mods IS 'Experience modification history';
COMMENT ON TABLE policy_wc_states IS 'Covered states with coverage type (3.A, 3.C, etc.)';
