-- ============================================================================
-- Commission Tracking Module
-- ============================================================================
-- Comprehensive commission management system for insurance agencies
-- Tracks commission structures, calculations, payments, and reporting
-- ============================================================================

-- ============================================================================
-- 1. COMMISSION STRUCTURES
-- ============================================================================
-- Defines how commissions are calculated per carrier/LOB/account

CREATE TABLE IF NOT EXISTS commission_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  carrier_id UUID REFERENCES carriers(id),
  mga_id UUID REFERENCES mgas(id),
  
  -- Structure identification
  name TEXT NOT NULL,
  description TEXT,
  structure_type TEXT NOT NULL CHECK (structure_type IN (
    'percentage',      -- Simple percentage of premium
    'flat',           -- Fixed dollar amount
    'tiered',         -- Percentage varies by premium tier
    'hybrid',         -- Combination of percentage + flat
    'sliding_scale'    -- Percentage increases/decreases with premium
  )),
  
  -- Line of Business scope
  line_of_business TEXT, -- NULL = applies to all LOBs
  applies_to_all_lobs BOOLEAN DEFAULT false,
  
  -- Commission configuration (JSONB for flexibility)
  commission_config JSONB NOT NULL DEFAULT '{}',
  -- For percentage: {"rate": 0.15, "minimum": 0, "maximum": null}
  -- For flat: {"amount": 500}
  -- For tiered: {"tiers": [{"min_premium": 0, "max_premium": 10000, "rate": 0.10}, ...]}
  -- For hybrid: {"base_rate": 0.12, "flat_bonus": 250, "applies_after": 5000}
  -- For sliding_scale: {"base_rate": 0.10, "scale_factor": 0.0001, "max_rate": 0.20}
  
  -- Effective dates
  effective_date DATE NOT NULL,
  expiration_date DATE,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false, -- Default structure for this carrier/account
  
  -- Priority (for multiple structures, higher = more specific)
  priority INTEGER DEFAULT 50,
  
  -- Audit
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_commission_structures_account ON commission_structures(account_id);
CREATE INDEX idx_commission_structures_carrier ON commission_structures(carrier_id);
CREATE INDEX idx_commission_structures_mga ON commission_structures(mga_id);
CREATE INDEX idx_commission_structures_lob ON commission_structures(line_of_business);
CREATE INDEX idx_commission_structures_active ON commission_structures(is_active) WHERE is_active = true;
CREATE INDEX idx_commission_structures_dates ON commission_structures(effective_date, expiration_date);

-- ============================================================================
-- 2. COMMISSION CALCULATIONS
-- ============================================================================
-- Stores calculated commissions for policies, quotes, and renewals

CREATE TABLE IF NOT EXISTS commission_calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Source entity (policy, quote, or renewal)
  source_type TEXT NOT NULL CHECK (source_type IN ('policy', 'quote', 'renewal')),
  source_id UUID NOT NULL, -- References policies.id, quotes.id, or renewals.id
  
  -- Commission structure used
  commission_structure_id UUID REFERENCES commission_structures(id),
  
  -- Financial details
  premium_amount NUMERIC(15, 2) NOT NULL,
  commission_rate NUMERIC(5, 4), -- Actual rate applied
  commission_amount NUMERIC(15, 2) NOT NULL,
  
  -- Breakdown (for tiered/hybrid structures)
  commission_breakdown JSONB DEFAULT '{}',
  -- {"base_commission": 1500, "bonus": 250, "tier_adjustment": 100, "total": 1850}
  
  -- Status
  status TEXT NOT NULL DEFAULT 'calculated' CHECK (status IN (
    'calculated',     -- Commission calculated but not yet paid
    'pending',        -- Awaiting carrier payment
    'paid',          -- Commission received from carrier
    'adjusted',      -- Commission amount adjusted
    'voided'         -- Commission voided (policy cancelled, etc.)
  )),
  
  -- Payment tracking
  expected_payment_date DATE,
  actual_payment_date DATE,
  payment_reference TEXT, -- Check number, wire reference, etc.
  
  -- Adjustments
  adjustment_reason TEXT,
  adjustment_amount NUMERIC(15, 2) DEFAULT 0,
  adjusted_by UUID REFERENCES auth.users(id),
  adjusted_at TIMESTAMPTZ,
  
  -- Notes
  notes TEXT,
  
  -- Audit
  calculated_by UUID REFERENCES auth.users(id),
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_commission_calculations_source ON commission_calculations(source_type, source_id);
CREATE INDEX idx_commission_calculations_structure ON commission_calculations(commission_structure_id);
CREATE INDEX idx_commission_calculations_status ON commission_calculations(status);
CREATE INDEX idx_commission_calculations_payment_date ON commission_calculations(expected_payment_date, actual_payment_date);

-- ============================================================================
-- 3. COMMISSION PAYMENTS
-- ============================================================================
-- Tracks actual commission payments received from carriers

CREATE TABLE IF NOT EXISTS commission_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Payment source
  carrier_id UUID REFERENCES carriers(id),
  mga_id UUID REFERENCES mgas(id),
  
  -- Payment details
  payment_date DATE NOT NULL,
  payment_amount NUMERIC(15, 2) NOT NULL,
  payment_method TEXT CHECK (payment_method IN ('check', 'wire', 'ach', 'credit', 'other')),
  payment_reference TEXT, -- Check number, wire confirmation, etc.
  
  -- Period covered
  period_start_date DATE,
  period_end_date DATE,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN (
    'expected',   -- Expected but not yet received
    'received',   -- Payment received
    'deposited',  -- Payment deposited to bank
    'reconciled', -- Payment reconciled with calculations
    'disputed'    -- Payment amount disputed
  )),
  
  -- Reconciliation
  reconciled_at TIMESTAMPTZ,
  reconciled_by UUID REFERENCES auth.users(id),
  reconciliation_notes TEXT,
  
  -- Discrepancies
  expected_amount NUMERIC(15, 2),
  discrepancy_amount NUMERIC(15, 2),
  discrepancy_reason TEXT,
  
  -- Notes
  notes TEXT,
  
  -- Audit
  received_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_commission_payments_carrier ON commission_payments(carrier_id);
CREATE INDEX idx_commission_payments_mga ON commission_payments(mga_id);
CREATE INDEX idx_commission_payments_date ON commission_payments(payment_date);
CREATE INDEX idx_commission_payments_status ON commission_payments(status);
CREATE INDEX idx_commission_payments_period ON commission_payments(period_start_date, period_end_date);

-- ============================================================================
-- 4. COMMISSION PAYMENT ALLOCATIONS
-- ============================================================================
-- Links commission payments to specific calculations

CREATE TABLE IF NOT EXISTS commission_payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Payment and calculation
  payment_id UUID NOT NULL REFERENCES commission_payments(id) ON DELETE CASCADE,
  calculation_id UUID NOT NULL REFERENCES commission_calculations(id) ON DELETE CASCADE,
  
  -- Allocation amount (may be partial)
  allocated_amount NUMERIC(15, 2) NOT NULL,
  
  -- Status
  is_allocated BOOLEAN DEFAULT true,
  
  -- Audit
  allocated_at TIMESTAMPTZ DEFAULT NOW(),
  allocated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payment_allocations_payment ON commission_payment_allocations(payment_id);
CREATE INDEX idx_payment_allocations_calculation ON commission_payment_allocations(calculation_id);
CREATE UNIQUE INDEX idx_payment_allocations_unique ON commission_payment_allocations(payment_id, calculation_id);

-- ============================================================================
-- 5. COMMISSION REPORTS
-- ============================================================================
-- Pre-calculated commission reports for performance tracking

CREATE TABLE IF NOT EXISTS commission_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Report period
  report_type TEXT NOT NULL CHECK (report_type IN (
    'daily',
    'weekly',
    'monthly',
    'quarterly',
    'yearly',
    'custom'
  )),
  period_start_date DATE NOT NULL,
  period_end_date DATE NOT NULL,
  
  -- Scope
  account_id UUID REFERENCES accounts(id), -- NULL = all accounts
  carrier_id UUID REFERENCES carriers(id), -- NULL = all carriers
  line_of_business TEXT, -- NULL = all LOBs
  
  -- Summary metrics
  total_premium NUMERIC(15, 2) NOT NULL DEFAULT 0,
  total_commission NUMERIC(15, 2) NOT NULL DEFAULT 0,
  average_commission_rate NUMERIC(5, 4),
  
  -- Breakdowns (JSONB for flexibility)
  breakdown_by_lob JSONB DEFAULT '{}',
  breakdown_by_carrier JSONB DEFAULT '{}',
  breakdown_by_producer JSONB DEFAULT '{}',
  
  -- Status
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'final', 'archived')),
  
  -- Audit
  generated_by UUID REFERENCES auth.users(id),
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_commission_reports_period ON commission_reports(period_start_date, period_end_date);
CREATE INDEX idx_commission_reports_type ON commission_reports(report_type);
CREATE INDEX idx_commission_reports_account ON commission_reports(account_id);
CREATE INDEX idx_commission_reports_carrier ON commission_reports(carrier_id);

-- ============================================================================
-- 6. RLS POLICIES
-- ============================================================================

ALTER TABLE commission_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_reports ENABLE ROW LEVEL SECURITY;

-- Commission Structures: Account-based access
CREATE POLICY "commission_structures_account_access"
  ON commission_structures FOR ALL
  TO authenticated
  USING (
    is_staff() OR
    account_id IN (
      SELECT account_id FROM account_memberships
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    is_staff() OR
    account_id IN (
      SELECT account_id FROM account_memberships
      WHERE user_id = auth.uid()
    )
  );

-- Commission Calculations: Account-based access
CREATE POLICY "commission_calculations_account_access"
  ON commission_calculations FOR ALL
  TO authenticated
  USING (
    is_staff() OR
    EXISTS (
      SELECT 1 FROM policies p
      WHERE p.id = commission_calculations.source_id
      AND commission_calculations.source_type = 'policy'
      AND p.account_id IN (
        SELECT account_id FROM account_memberships
        WHERE user_id = auth.uid()
      )
    ) OR
    EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = commission_calculations.source_id
      AND commission_calculations.source_type = 'quote'
      AND q.account_id IN (
        SELECT account_id FROM account_memberships
        WHERE user_id = auth.uid()
      )
    )
  );

-- Commission Payments: Staff and account access
CREATE POLICY "commission_payments_staff_access"
  ON commission_payments FOR ALL
  TO authenticated
  USING (is_staff())
  WITH CHECK (is_staff());

CREATE POLICY "commission_payments_account_access"
  ON commission_payments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM commission_calculations cc
      JOIN commission_payment_allocations cpa ON cc.id = cpa.calculation_id
      WHERE cpa.payment_id = commission_payments.id
      AND (
        (cc.source_type = 'policy' AND EXISTS (
          SELECT 1 FROM policies p
          WHERE p.id = cc.source_id
          AND p.account_id IN (
            SELECT account_id FROM account_memberships
            WHERE user_id = auth.uid()
          )
        )) OR
        (cc.source_type = 'quote' AND EXISTS (
          SELECT 1 FROM quotes q
          WHERE q.id = cc.source_id
          AND q.account_id IN (
            SELECT account_id FROM account_memberships
            WHERE user_id = auth.uid()
          )
        ))
      )
    )
  );

-- Commission Payment Allocations: Inherit from calculations
CREATE POLICY "commission_payment_allocations_access"
  ON commission_payment_allocations FOR ALL
  TO authenticated
  USING (
    is_staff() OR
    EXISTS (
      SELECT 1 FROM commission_calculations cc
      WHERE cc.id = commission_payment_allocations.calculation_id
      AND (
        (cc.source_type = 'policy' AND EXISTS (
          SELECT 1 FROM policies p
          WHERE p.id = cc.source_id
          AND p.account_id IN (
            SELECT account_id FROM account_memberships
            WHERE user_id = auth.uid()
          )
        )) OR
        (cc.source_type = 'quote' AND EXISTS (
          SELECT 1 FROM quotes q
          WHERE q.id = cc.source_id
          AND q.account_id IN (
            SELECT account_id FROM account_memberships
            WHERE user_id = auth.uid()
          )
        ))
      )
    )
  );

-- Commission Reports: Account-based access
CREATE POLICY "commission_reports_account_access"
  ON commission_reports FOR ALL
  TO authenticated
  USING (
    is_staff() OR
    account_id IN (
      SELECT account_id FROM account_memberships
      WHERE user_id = auth.uid()
    ) OR
    account_id IS NULL -- System-wide reports for staff
  )
  WITH CHECK (
    is_staff() OR
    account_id IN (
      SELECT account_id FROM account_memberships
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- 7. TRIGGERS
-- ============================================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_commission_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER commission_structures_updated_at
  BEFORE UPDATE ON commission_structures
  FOR EACH ROW
  EXECUTE FUNCTION update_commission_updated_at();

CREATE TRIGGER commission_calculations_updated_at
  BEFORE UPDATE ON commission_calculations
  FOR EACH ROW
  EXECUTE FUNCTION update_commission_updated_at();

CREATE TRIGGER commission_payments_updated_at
  BEFORE UPDATE ON commission_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_commission_updated_at();

CREATE TRIGGER commission_reports_updated_at
  BEFORE UPDATE ON commission_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_commission_updated_at();

-- ============================================================================
-- 8. COMMENTS
-- ============================================================================

COMMENT ON TABLE commission_structures IS 'Defines commission calculation rules per carrier/LOB/account';
COMMENT ON TABLE commission_calculations IS 'Stores calculated commissions for policies, quotes, and renewals';
COMMENT ON TABLE commission_payments IS 'Tracks actual commission payments received from carriers';
COMMENT ON TABLE commission_payment_allocations IS 'Links commission payments to specific calculations';
COMMENT ON TABLE commission_reports IS 'Pre-calculated commission reports for performance tracking';

COMMENT ON COLUMN commission_structures.commission_config IS 'JSONB configuration for commission calculation. Structure varies by structure_type.';
COMMENT ON COLUMN commission_calculations.commission_breakdown IS 'Detailed breakdown of commission calculation for tiered/hybrid structures';

