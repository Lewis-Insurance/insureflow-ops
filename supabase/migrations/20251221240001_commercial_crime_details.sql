-- ============================================================================
-- Commercial Crime / Fidelity Bond Details Table
-- ============================================================================
-- Stores extracted crime policy data with evidence references
-- Covers: Employee Dishonesty, Forgery, Computer Fraud, Funds Transfer Fraud,
-- Money & Securities, Social Engineering, ERISA Fidelity
-- ============================================================================

-- Main crime details table
CREATE TABLE IF NOT EXISTS commercial_crime_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,

    -- Policy type and form
    policy_type TEXT NOT NULL DEFAULT 'crime_policy', -- 'crime_policy' | 'fidelity_bond' | 'erisa_bond' | etc.
    form_type TEXT NOT NULL DEFAULT 'discovery_form', -- 'discovery_form' | 'loss_sustained_form' | 'hybrid'

    -- Overall limits
    policy_aggregate NUMERIC(15,2),

    -- Core extracted data
    extracted_data JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Field-level extraction status
    field_status JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Field-level confidence scores
    field_confidence JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Evidence references
    evidence_references JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Verification
    verified_by UUID REFERENCES auth.users(id),
    verified_at TIMESTAMPTZ,
    verification_notes TEXT,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),

    CONSTRAINT crime_details_policy_unique UNIQUE (policy_id)
);

-- Individual coverages (insuring agreements)
CREATE TABLE IF NOT EXISTS crime_coverages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crime_details_id UUID NOT NULL REFERENCES commercial_crime_details(id) ON DELETE CASCADE,

    coverage_type TEXT NOT NULL, -- 'employee_dishonesty' | 'forgery_alteration' | 'computer_fraud' | etc.
    included BOOLEAN NOT NULL DEFAULT FALSE,

    -- Limits and deductibles
    coverage_limit NUMERIC(15,2),
    deductible NUMERIC(15,2),

    -- For employee dishonesty
    coverage_form TEXT, -- 'blanket' | 'scheduled' | 'name_schedule' | 'position_schedule'
    includes_leased_employees BOOLEAN,
    includes_volunteers BOOLEAN,
    includes_directors BOOLEAN,
    erisa_plan_covered BOOLEAN,

    -- For inside premises
    money_limit NUMERIC(15,2),
    securities_limit NUMERIC(15,2),
    other_property_limit NUMERIC(15,2),

    -- For social engineering
    callback_verification_required BOOLEAN,
    dual_authorization_required BOOLEAN,
    discovery_period_days INTEGER,

    -- For funds transfer
    wire_transfer_covered BOOLEAN,
    ach_transfer_covered BOOLEAN,

    -- For computer fraud
    direct_loss_only BOOLEAN,
    virus_coverage BOOLEAN,

    -- Coverage details (JSONB for complex structures)
    coverage_details JSONB,

    -- Evidence
    evidence_id TEXT,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT crime_coverages_unique UNIQUE (crime_details_id, coverage_type)
);

-- Scheduled employees (for scheduled fidelity bonds)
CREATE TABLE IF NOT EXISTS crime_scheduled_employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crime_details_id UUID NOT NULL REFERENCES commercial_crime_details(id) ON DELETE CASCADE,

    employee_name TEXT,
    position TEXT,
    individual_limit NUMERIC(15,2),

    -- Evidence
    evidence_id TEXT,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ERISA plans covered
CREATE TABLE IF NOT EXISTS crime_erisa_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crime_details_id UUID NOT NULL REFERENCES commercial_crime_details(id) ON DELETE CASCADE,

    plan_name TEXT NOT NULL,
    plan_number TEXT,
    plan_assets NUMERIC(15,2),
    required_bond_amount NUMERIC(15,2), -- DOL requires 10% of assets or $500K min
    actual_bond_amount NUMERIC(15,2),
    meets_dol_requirements BOOLEAN,

    -- Evidence
    evidence_id TEXT,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Policy conditions
CREATE TABLE IF NOT EXISTS crime_conditions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crime_details_id UUID NOT NULL REFERENCES commercial_crime_details(id) ON DELETE CASCADE,

    -- Discovery period
    discovery_period_days INTEGER,

    -- Loss sustained retroactive date
    loss_sustained_retroactive_date DATE,

    -- Territory
    territory TEXT, -- 'usa' | 'usa_and_canada' | 'worldwide'

    -- Acquisition provision
    acquisition_automatic_days INTEGER,
    acquisition_premium_threshold NUMERIC(15,2),

    -- Other provisions
    joint_insured_provision BOOLEAN,
    non_cumulation BOOLEAN,
    other_insurance TEXT, -- 'primary' | 'excess' | 'contributory'

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT crime_conditions_unique UNIQUE (crime_details_id)
);

-- Endorsements
CREATE TABLE IF NOT EXISTS crime_endorsements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crime_details_id UUID NOT NULL REFERENCES commercial_crime_details(id) ON DELETE CASCADE,

    endorsement_number TEXT NOT NULL,
    endorsement_name TEXT NOT NULL,
    form_number TEXT,
    edition_date TEXT,

    endorsement_type TEXT NOT NULL, -- 'coverage_extension' | 'coverage_restriction' | 'exclusion' | etc.
    high_impact BOOLEAN DEFAULT FALSE,
    impact_description TEXT,

    -- Modifications
    applies_to_coverage TEXT, -- Which coverage this endorsement affects
    new_limit NUMERIC(15,2),
    new_deductible NUMERIC(15,2),

    -- Evidence
    evidence_id TEXT,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_crime_details_policy ON commercial_crime_details(policy_id);
CREATE INDEX IF NOT EXISTS idx_crime_details_type ON commercial_crime_details(policy_type);
CREATE INDEX IF NOT EXISTS idx_crime_details_form ON commercial_crime_details(form_type);
CREATE INDEX IF NOT EXISTS idx_crime_details_verified ON commercial_crime_details(verified_at) WHERE verified_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crime_coverages_details ON crime_coverages(crime_details_id);
CREATE INDEX IF NOT EXISTS idx_crime_coverages_type ON crime_coverages(coverage_type);
CREATE INDEX IF NOT EXISTS idx_crime_coverages_included ON crime_coverages(included) WHERE included = TRUE;

CREATE INDEX IF NOT EXISTS idx_crime_employees_details ON crime_scheduled_employees(crime_details_id);

CREATE INDEX IF NOT EXISTS idx_crime_erisa_details ON crime_erisa_plans(crime_details_id);
CREATE INDEX IF NOT EXISTS idx_crime_erisa_dol ON crime_erisa_plans(meets_dol_requirements);

CREATE INDEX IF NOT EXISTS idx_crime_conditions_details ON crime_conditions(crime_details_id);

CREATE INDEX IF NOT EXISTS idx_crime_endorsements_details ON crime_endorsements(crime_details_id);
CREATE INDEX IF NOT EXISTS idx_crime_endorsements_high_impact ON crime_endorsements(high_impact) WHERE high_impact = TRUE;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE commercial_crime_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE crime_coverages ENABLE ROW LEVEL SECURITY;
ALTER TABLE crime_scheduled_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE crime_erisa_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE crime_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE crime_endorsements ENABLE ROW LEVEL SECURITY;

-- Main table policies
CREATE POLICY "Users can view crime details for accessible policies"
    ON commercial_crime_details FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM policies p
            JOIN accounts a ON p.account_id = a.id
            WHERE p.id = policy_id
            AND (a.owner_agent_id = auth.uid() OR EXISTS (
                SELECT 1 FROM account_memberships am WHERE am.account_id = a.id AND am.user_id = auth.uid()
            ))
        )
    );

CREATE POLICY "Users can insert crime details for accessible policies"
    ON commercial_crime_details FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM policies p
            JOIN accounts a ON p.account_id = a.id
            WHERE p.id = policy_id
            AND (a.owner_agent_id = auth.uid() OR EXISTS (
                SELECT 1 FROM account_memberships am WHERE am.account_id = a.id AND am.user_id = auth.uid()
            ))
        )
    );

CREATE POLICY "Users can update crime details for accessible policies"
    ON commercial_crime_details FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM policies p
            JOIN accounts a ON p.account_id = a.id
            WHERE p.id = policy_id
            AND (a.owner_agent_id = auth.uid() OR EXISTS (
                SELECT 1 FROM account_memberships am WHERE am.account_id = a.id AND am.user_id = auth.uid()
            ))
        )
    );

-- Child table policies
CREATE POLICY "Users can manage crime coverages"
    ON crime_coverages FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM commercial_crime_details cd
            JOIN policies p ON p.id = cd.policy_id
            JOIN accounts a ON p.account_id = a.id
            WHERE cd.id = crime_details_id
            AND (a.owner_agent_id = auth.uid() OR EXISTS (
                SELECT 1 FROM account_memberships am WHERE am.account_id = a.id AND am.user_id = auth.uid()
            ))
        )
    );

CREATE POLICY "Users can manage scheduled employees"
    ON crime_scheduled_employees FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM commercial_crime_details cd
            JOIN policies p ON p.id = cd.policy_id
            JOIN accounts a ON p.account_id = a.id
            WHERE cd.id = crime_details_id
            AND (a.owner_agent_id = auth.uid() OR EXISTS (
                SELECT 1 FROM account_memberships am WHERE am.account_id = a.id AND am.user_id = auth.uid()
            ))
        )
    );

CREATE POLICY "Users can manage ERISA plans"
    ON crime_erisa_plans FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM commercial_crime_details cd
            JOIN policies p ON p.id = cd.policy_id
            JOIN accounts a ON p.account_id = a.id
            WHERE cd.id = crime_details_id
            AND (a.owner_agent_id = auth.uid() OR EXISTS (
                SELECT 1 FROM account_memberships am WHERE am.account_id = a.id AND am.user_id = auth.uid()
            ))
        )
    );

CREATE POLICY "Users can manage crime conditions"
    ON crime_conditions FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM commercial_crime_details cd
            JOIN policies p ON p.id = cd.policy_id
            JOIN accounts a ON p.account_id = a.id
            WHERE cd.id = crime_details_id
            AND (a.owner_agent_id = auth.uid() OR EXISTS (
                SELECT 1 FROM account_memberships am WHERE am.account_id = a.id AND am.user_id = auth.uid()
            ))
        )
    );

CREATE POLICY "Users can manage crime endorsements"
    ON crime_endorsements FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM commercial_crime_details cd
            JOIN policies p ON p.id = cd.policy_id
            JOIN accounts a ON p.account_id = a.id
            WHERE cd.id = crime_details_id
            AND (a.owner_agent_id = auth.uid() OR EXISTS (
                SELECT 1 FROM account_memberships am WHERE am.account_id = a.id AND am.user_id = auth.uid()
            ))
        )
    );

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_crime_details_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_crime_details_updated_at
    BEFORE UPDATE ON commercial_crime_details
    FOR EACH ROW
    EXECUTE FUNCTION update_crime_details_updated_at();

CREATE TRIGGER tr_crime_coverages_updated_at
    BEFORE UPDATE ON crime_coverages
    FOR EACH ROW
    EXECUTE FUNCTION update_crime_details_updated_at();

CREATE TRIGGER tr_crime_employees_updated_at
    BEFORE UPDATE ON crime_scheduled_employees
    FOR EACH ROW
    EXECUTE FUNCTION update_crime_details_updated_at();

CREATE TRIGGER tr_crime_erisa_updated_at
    BEFORE UPDATE ON crime_erisa_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_crime_details_updated_at();

CREATE TRIGGER tr_crime_conditions_updated_at
    BEFORE UPDATE ON crime_conditions
    FOR EACH ROW
    EXECUTE FUNCTION update_crime_details_updated_at();

CREATE TRIGGER tr_crime_endorsements_updated_at
    BEFORE UPDATE ON crime_endorsements
    FOR EACH ROW
    EXECUTE FUNCTION update_crime_details_updated_at();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE commercial_crime_details IS 'Stores extracted commercial crime/fidelity policy data with evidence references';
COMMENT ON TABLE crime_coverages IS 'Individual insuring agreements: employee dishonesty, forgery, computer fraud, etc.';
COMMENT ON TABLE crime_scheduled_employees IS 'Scheduled employees for name/position schedule fidelity bonds';
COMMENT ON TABLE crime_erisa_plans IS 'ERISA plans covered with DOL compliance tracking';
COMMENT ON TABLE crime_conditions IS 'Policy conditions: discovery period, territory, acquisition provisions';
COMMENT ON TABLE crime_endorsements IS 'Policy endorsements including high-impact exclusions';
