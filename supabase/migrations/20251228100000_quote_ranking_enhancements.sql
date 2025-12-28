-- ============================================================================
-- QUOTE RANKING ENHANCEMENTS
-- ============================================================================
-- Adds two major features to the quote ranking system:
-- 1. Coverage Limit Adequacy Scoring - Score limits against recommended minimums
-- 2. Customizable Scoring Weights - User-adjustable dimension weights
-- ============================================================================

-- ============================================================================
-- FEATURE 1: COVERAGE LIMIT STANDARDS
-- ============================================================================

-- Table to store recommended coverage limit thresholds
CREATE TABLE IF NOT EXISTS coverage_limit_standards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope: NULL = system-wide default, non-NULL = agency-specific override
  agency_workspace_id UUID REFERENCES agency_workspaces(id) ON DELETE CASCADE,

  -- Coverage identification
  coverage_type TEXT NOT NULL,  -- 'BI', 'PD', 'COMP', 'COLL', 'UM', 'Dwelling', 'GL', etc.
  line_of_business TEXT NOT NULL,  -- 'auto', 'home', 'commercial'

  -- Limit thresholds (in dollars)
  min_recommended INTEGER NOT NULL,  -- Below this = 0 points
  good_limit INTEGER NOT NULL,       -- At or above = 8 points
  excellent_limit INTEGER NOT NULL,  -- At or above = 10 points

  -- For split limits like "100/300/50" - which component to evaluate
  limit_parse_mode TEXT DEFAULT 'single' CHECK (limit_parse_mode IN ('single', 'per_person', 'per_occurrence', 'aggregate')),

  -- Metadata
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(agency_workspace_id, coverage_type, line_of_business)
);

-- Add comments
COMMENT ON TABLE coverage_limit_standards IS 'Recommended coverage limit thresholds for scoring quote adequacy';
COMMENT ON COLUMN coverage_limit_standards.min_recommended IS 'Minimum recommended limit in dollars - below this gets 0 points';
COMMENT ON COLUMN coverage_limit_standards.good_limit IS 'Good limit threshold - at or above gets 8 points';
COMMENT ON COLUMN coverage_limit_standards.excellent_limit IS 'Excellent limit threshold - at or above gets 10 points';
COMMENT ON COLUMN coverage_limit_standards.limit_parse_mode IS 'How to parse split limits like 100/300/50: single, per_person, per_occurrence, aggregate';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_coverage_limit_standards_lob
  ON coverage_limit_standards(line_of_business) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_coverage_limit_standards_agency
  ON coverage_limit_standards(agency_workspace_id) WHERE agency_workspace_id IS NOT NULL;

-- RLS
ALTER TABLE coverage_limit_standards ENABLE ROW LEVEL SECURITY;

-- System defaults are readable by all authenticated users
CREATE POLICY "Anyone can view system coverage standards"
  ON coverage_limit_standards FOR SELECT
  USING (agency_workspace_id IS NULL);

-- Agency-specific standards are readable by agency members
CREATE POLICY "Agency members can view their coverage standards"
  ON coverage_limit_standards FOR SELECT
  USING (
    agency_workspace_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM agency_workspace_memberships awm
      WHERE awm.agency_workspace_id = coverage_limit_standards.agency_workspace_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
    )
  );

-- Agency admins can manage their standards
CREATE POLICY "Agency admins can manage coverage standards"
  ON coverage_limit_standards FOR ALL
  USING (
    agency_workspace_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM agency_workspace_memberships awm
      WHERE awm.agency_workspace_id = coverage_limit_standards.agency_workspace_id
        AND awm.user_id = auth.uid()
        AND awm.role IN ('owner', 'admin')
        AND awm.status = 'active'
    )
  );

-- Seed system-wide default standards
INSERT INTO coverage_limit_standards (coverage_type, line_of_business, min_recommended, good_limit, excellent_limit, limit_parse_mode, description)
VALUES
  -- Auto coverages
  ('BI', 'auto', 50000, 100000, 250000, 'per_person', 'Bodily Injury - per person limit'),
  ('PD', 'auto', 25000, 50000, 100000, 'single', 'Property Damage'),
  ('COMP', 'auto', 0, 0, 0, 'single', 'Comprehensive - ACV based, no minimum'),
  ('COLL', 'auto', 0, 0, 0, 'single', 'Collision - ACV based, no minimum'),
  ('UM', 'auto', 25000, 50000, 100000, 'per_person', 'Uninsured Motorist'),
  ('UIM', 'auto', 25000, 50000, 100000, 'per_person', 'Underinsured Motorist'),
  ('MedPay', 'auto', 1000, 5000, 10000, 'single', 'Medical Payments'),
  ('PIP', 'auto', 2500, 10000, 25000, 'single', 'Personal Injury Protection'),

  -- Home coverages
  ('Dwelling', 'home', 200000, 350000, 500000, 'single', 'Dwelling coverage'),
  ('Personal Property', 'home', 50000, 100000, 150000, 'single', 'Personal property/contents'),
  ('Liability', 'home', 100000, 300000, 500000, 'single', 'Personal liability'),
  ('Medical Payments', 'home', 1000, 5000, 10000, 'single', 'Medical payments to others'),
  ('Loss of Use', 'home', 20000, 50000, 100000, 'single', 'Loss of use/additional living expenses'),

  -- Commercial coverages
  ('GL', 'commercial', 500000, 1000000, 2000000, 'per_occurrence', 'General Liability'),
  ('Property', 'commercial', 100000, 500000, 1000000, 'single', 'Commercial Property'),
  ('Workers Comp', 'commercial', 100000, 500000, 1000000, 'single', 'Workers Compensation'),
  ('Commercial Auto', 'commercial', 500000, 1000000, 2000000, 'single', 'Commercial Auto Liability'),
  ('Umbrella', 'commercial', 1000000, 2000000, 5000000, 'single', 'Commercial Umbrella'),
  ('Professional Liability', 'commercial', 250000, 500000, 1000000, 'per_occurrence', 'Professional Liability/E&O'),
  ('Cyber', 'commercial', 100000, 500000, 1000000, 'single', 'Cyber Liability')
ON CONFLICT DO NOTHING;

-- Add new columns to quotes table
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS coverage_limit_adequacy_score INTEGER
    CHECK (coverage_limit_adequacy_score >= 0 AND coverage_limit_adequacy_score <= 25);

COMMENT ON COLUMN quotes.coverage_limit_adequacy_score IS 'Combined score for coverage completeness (15) + limit adequacy (10)';

-- Add new columns to quote_coverages table
ALTER TABLE quote_coverages
  ADD COLUMN IF NOT EXISTS parsed_limit_value NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS limit_adequacy_tier TEXT
    CHECK (limit_adequacy_tier IN ('below_minimum', 'at_minimum', 'good', 'excellent'));

COMMENT ON COLUMN quote_coverages.parsed_limit_value IS 'Parsed numeric limit value in dollars';
COMMENT ON COLUMN quote_coverages.limit_adequacy_tier IS 'Adequacy tier based on coverage limit standards';

-- ============================================================================
-- FEATURE 2: SCORING WEIGHT PROFILES
-- ============================================================================

-- Table to store customizable scoring weight configurations
CREATE TABLE IF NOT EXISTS scoring_weight_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership scope (priority: account > agency > system)
  agency_workspace_id UUID REFERENCES agency_workspaces(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  -- agency_workspace_id only = agency default
  -- account_id only = account-specific override
  -- both NULL = system default (only one allowed)

  name TEXT NOT NULL,
  description TEXT,

  -- Weights (must sum to 100)
  price_weight INTEGER NOT NULL DEFAULT 30 CHECK (price_weight >= 0 AND price_weight <= 100),
  coverage_weight INTEGER NOT NULL DEFAULT 25 CHECK (coverage_weight >= 0 AND coverage_weight <= 100),
  carrier_weight INTEGER NOT NULL DEFAULT 20 CHECK (carrier_weight >= 0 AND carrier_weight <= 100),
  deductible_weight INTEGER NOT NULL DEFAULT 15 CHECK (deductible_weight >= 0 AND deductible_weight <= 100),
  value_weight INTEGER NOT NULL DEFAULT 10 CHECK (value_weight >= 0 AND value_weight <= 100),

  -- Validation constraint: weights must sum to 100
  CONSTRAINT weights_sum_to_100 CHECK (
    price_weight + coverage_weight + carrier_weight + deductible_weight + value_weight = 100
  ),

  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,

  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comments
COMMENT ON TABLE scoring_weight_profiles IS 'Customizable scoring weight configurations for quote ranking';
COMMENT ON COLUMN scoring_weight_profiles.price_weight IS 'Weight for price competitiveness (0-100, default 30)';
COMMENT ON COLUMN scoring_weight_profiles.coverage_weight IS 'Weight for coverage completeness/adequacy (0-100, default 25)';
COMMENT ON COLUMN scoring_weight_profiles.carrier_weight IS 'Weight for carrier quality rating (0-100, default 20)';
COMMENT ON COLUMN scoring_weight_profiles.deductible_weight IS 'Weight for deductible quality (0-100, default 15)';
COMMENT ON COLUMN scoring_weight_profiles.value_weight IS 'Weight for overall value score (0-100, default 10)';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scoring_weight_profiles_agency
  ON scoring_weight_profiles(agency_workspace_id) WHERE agency_workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scoring_weight_profiles_account
  ON scoring_weight_profiles(account_id) WHERE account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scoring_weight_profiles_default
  ON scoring_weight_profiles(is_default) WHERE is_default = true;

-- RLS
ALTER TABLE scoring_weight_profiles ENABLE ROW LEVEL SECURITY;

-- System defaults are readable by all authenticated users
CREATE POLICY "Anyone can view system weight profiles"
  ON scoring_weight_profiles FOR SELECT
  USING (agency_workspace_id IS NULL AND account_id IS NULL);

-- Agency profiles are readable by agency members
CREATE POLICY "Agency members can view their weight profiles"
  ON scoring_weight_profiles FOR SELECT
  USING (
    agency_workspace_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM agency_workspace_memberships awm
      WHERE awm.agency_workspace_id = scoring_weight_profiles.agency_workspace_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
    )
  );

-- Account-specific profiles are readable by account members
CREATE POLICY "Account members can view their weight profiles"
  ON scoring_weight_profiles FOR SELECT
  USING (
    account_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM account_memberships am
      WHERE am.account_id = scoring_weight_profiles.account_id
        AND am.user_id = auth.uid()
    )
  );

-- Agency admins can manage agency profiles
CREATE POLICY "Agency admins can manage weight profiles"
  ON scoring_weight_profiles FOR ALL
  USING (
    agency_workspace_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM agency_workspace_memberships awm
      WHERE awm.agency_workspace_id = scoring_weight_profiles.agency_workspace_id
        AND awm.user_id = auth.uid()
        AND awm.role IN ('owner', 'admin')
        AND awm.status = 'active'
    )
  );

-- Seed system default weight profile
INSERT INTO scoring_weight_profiles (name, description, price_weight, coverage_weight, carrier_weight, deductible_weight, value_weight, is_default)
VALUES (
  'Balanced Default',
  'System default balanced scoring profile - equal emphasis on all factors',
  30, 25, 20, 15, 10,
  true
)
ON CONFLICT DO NOTHING;

-- Add column to quotes to track which profile was used
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS scoring_weight_profile_id UUID REFERENCES scoring_weight_profiles(id);

COMMENT ON COLUMN quotes.scoring_weight_profile_id IS 'Reference to the weight profile used when scoring this quote';

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get effective weight profile for an account
CREATE OR REPLACE FUNCTION get_effective_weight_profile(
  p_account_id UUID,
  p_agency_workspace_id UUID DEFAULT NULL
)
RETURNS scoring_weight_profiles AS $$
DECLARE
  v_profile scoring_weight_profiles;
BEGIN
  -- Priority 1: Account-specific default
  SELECT * INTO v_profile
  FROM scoring_weight_profiles
  WHERE account_id = p_account_id
    AND is_default = true
    AND is_active = true
  LIMIT 1;

  IF FOUND THEN
    RETURN v_profile;
  END IF;

  -- Priority 2: Agency default
  IF p_agency_workspace_id IS NOT NULL THEN
    SELECT * INTO v_profile
    FROM scoring_weight_profiles
    WHERE agency_workspace_id = p_agency_workspace_id
      AND account_id IS NULL
      AND is_default = true
      AND is_active = true
    LIMIT 1;

    IF FOUND THEN
      RETURN v_profile;
    END IF;
  END IF;

  -- Priority 3: System default
  SELECT * INTO v_profile
  FROM scoring_weight_profiles
  WHERE agency_workspace_id IS NULL
    AND account_id IS NULL
    AND is_default = true
  LIMIT 1;

  RETURN v_profile;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get coverage limit standards for a line of business
CREATE OR REPLACE FUNCTION get_coverage_limit_standards(
  p_line_of_business TEXT,
  p_agency_workspace_id UUID DEFAULT NULL
)
RETURNS SETOF coverage_limit_standards AS $$
BEGIN
  -- Return agency-specific standards if they exist, otherwise system defaults
  -- Uses DISTINCT ON to prefer agency overrides over system defaults
  RETURN QUERY
  SELECT DISTINCT ON (coverage_type) *
  FROM coverage_limit_standards
  WHERE line_of_business = p_line_of_business
    AND is_active = true
    AND (agency_workspace_id = p_agency_workspace_id OR agency_workspace_id IS NULL)
  ORDER BY coverage_type, agency_workspace_id NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_coverage_limit_standards_updated_at ON coverage_limit_standards;
CREATE TRIGGER update_coverage_limit_standards_updated_at
  BEFORE UPDATE ON coverage_limit_standards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_scoring_weight_profiles_updated_at ON scoring_weight_profiles;
CREATE TRIGGER update_scoring_weight_profiles_updated_at
  BEFORE UPDATE ON scoring_weight_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
