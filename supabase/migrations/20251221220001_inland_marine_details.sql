-- ============================================================================
-- Commercial Inland Marine Details Table
-- ============================================================================
-- Stores extracted inland marine policy data with evidence references
-- Supports: Contractor's Equipment, Installation Floater, Motor Truck Cargo,
-- EDP, Valuable Papers, Signs, Accounts Receivable, Fine Arts, etc.
-- ============================================================================

-- Main inland marine details table
CREATE TABLE IF NOT EXISTS inland_marine_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,

    -- Core extracted data (JSONB for flexibility)
    extracted_data JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Field-level extraction status
    -- Keys: field paths (e.g., "scheduled_items.0.serial_number")
    -- Values: 'AUTO_APPLIED' | 'NEEDS_REVIEW' | 'LOW_CONFIDENCE' | 'NOT_FOUND' | 'CONFLICT' | 'MANUAL'
    field_status JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Field-level confidence scores (0-1)
    field_confidence JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Evidence references linking fields to document locations
    -- Keys: field paths
    -- Values: array of {evidence_id, page, bounding_box, text_snippet}
    evidence_references JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Verification tracking
    verified_by UUID REFERENCES auth.users(id),
    verified_at TIMESTAMPTZ,
    verification_notes TEXT,

    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),

    -- Unique constraint: one IM details record per policy
    CONSTRAINT inland_marine_details_policy_unique UNIQUE (policy_id)
);

-- Scheduled items table (normalized for better querying)
CREATE TABLE IF NOT EXISTS inland_marine_scheduled_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inland_marine_details_id UUID NOT NULL REFERENCES inland_marine_details(id) ON DELETE CASCADE,

    -- Item identification
    item_id TEXT NOT NULL, -- Stable ID from extraction
    description TEXT NOT NULL,
    manufacturer TEXT,
    model TEXT,
    serial_number TEXT,
    vin TEXT,
    year INTEGER,

    -- Valuation
    scheduled_value NUMERIC(15,2) NOT NULL,
    valuation_basis TEXT NOT NULL DEFAULT 'replacement_cost',

    -- Deductible (may differ per item)
    deductible NUMERIC(15,2),

    -- Location/Assignment
    primary_location TEXT,
    assigned_jobsite TEXT,

    -- Loss payee info (JSONB for flexibility)
    loss_payee JSONB,

    -- Leased equipment
    leased BOOLEAN DEFAULT FALSE,
    lessor_name TEXT,

    -- Coverage specifics
    theft_coverage_included BOOLEAN DEFAULT TRUE,
    mysterious_disappearance_included BOOLEAN DEFAULT FALSE,

    -- Condition
    condition TEXT, -- 'new' | 'used' | 'refurbished'
    acquisition_date DATE,

    -- Evidence reference for this item
    evidence_id TEXT,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Unique: one item_id per IM details record
    CONSTRAINT im_scheduled_items_unique UNIQUE (inland_marine_details_id, item_id)
);

-- Blanket coverages table
CREATE TABLE IF NOT EXISTS inland_marine_blanket_coverages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inland_marine_details_id UUID NOT NULL REFERENCES inland_marine_details(id) ON DELETE CASCADE,

    category TEXT NOT NULL, -- e.g., "All Owned Equipment", "Small Tools"
    blanket_limit NUMERIC(15,2) NOT NULL,
    per_item_limit NUMERIC(15,2),
    valuation_basis TEXT NOT NULL DEFAULT 'replacement_cost',
    deductible NUMERIC(15,2) NOT NULL,
    description TEXT,

    -- Sublimits within blanket (JSONB array)
    sublimits JSONB,

    -- Evidence
    evidence_id TEXT,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Covered locations table
CREATE TABLE IF NOT EXISTS inland_marine_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inland_marine_details_id UUID NOT NULL REFERENCES inland_marine_details(id) ON DELETE CASCADE,

    location_id TEXT NOT NULL,
    location_number INTEGER,
    name TEXT NOT NULL,

    -- Address
    address_line1 TEXT,
    address_line2 TEXT,
    city TEXT,
    state TEXT,
    zip_code TEXT,
    country TEXT DEFAULT 'USA',

    location_type TEXT NOT NULL, -- 'permanent' | 'jobsite' | 'storage' | 'warehouse' | 'in_transit'

    -- Coverage at this location
    location_limit NUMERIC(15,2),
    deductible NUMERIC(15,2),

    -- Security features
    security_features JSONB,

    -- Jobsite info
    project_name TEXT,
    project_start_date DATE,
    project_end_date DATE,
    general_contractor TEXT,

    -- Evidence
    evidence_id TEXT,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT im_locations_unique UNIQUE (inland_marine_details_id, location_id)
);

-- Additional interests (loss payees, AIs, lienholders)
CREATE TABLE IF NOT EXISTS inland_marine_additional_interests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inland_marine_details_id UUID NOT NULL REFERENCES inland_marine_details(id) ON DELETE CASCADE,

    interest_id TEXT NOT NULL,
    name TEXT NOT NULL,

    -- Address
    address_line1 TEXT,
    address_line2 TEXT,
    city TEXT,
    state TEXT,
    zip_code TEXT,

    interest_type TEXT NOT NULL, -- 'loss_payee' | 'additional_insured' | 'lienholder' | 'lessor' | 'mortgagee'

    -- Association
    applies_to TEXT NOT NULL DEFAULT 'all', -- 'all' | 'scheduled_items'
    scheduled_item_ids JSONB, -- Array of item_ids if applies_to = 'scheduled_items'

    -- Loan/Lease info
    loan_number TEXT,
    lease_number TEXT,

    -- Evidence
    evidence_id TEXT,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT im_additional_interests_unique UNIQUE (inland_marine_details_id, interest_id)
);

-- Endorsements table
CREATE TABLE IF NOT EXISTS inland_marine_endorsements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inland_marine_details_id UUID NOT NULL REFERENCES inland_marine_details(id) ON DELETE CASCADE,

    endorsement_number TEXT NOT NULL,
    endorsement_name TEXT NOT NULL,
    form_number TEXT,
    edition_date TEXT,

    endorsement_type TEXT NOT NULL, -- 'coverage_extension' | 'coverage_restriction' | 'exclusion' | etc.

    high_impact BOOLEAN DEFAULT FALSE,
    impact_description TEXT,

    -- Excluded items (for exclusion endorsements)
    excluded_perils JSONB,
    excluded_property JSONB,
    excluded_locations JSONB,

    -- Modifications
    affects_coverage TEXT,
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

-- Main table
CREATE INDEX IF NOT EXISTS idx_im_details_policy ON inland_marine_details(policy_id);
CREATE INDEX IF NOT EXISTS idx_im_details_verified ON inland_marine_details(verified_at) WHERE verified_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_im_details_extracted_subtypes ON inland_marine_details USING gin((extracted_data->'subtypes'));

-- Scheduled items
CREATE INDEX IF NOT EXISTS idx_im_items_details ON inland_marine_scheduled_items(inland_marine_details_id);
CREATE INDEX IF NOT EXISTS idx_im_items_serial ON inland_marine_scheduled_items(serial_number) WHERE serial_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_im_items_vin ON inland_marine_scheduled_items(vin) WHERE vin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_im_items_value ON inland_marine_scheduled_items(scheduled_value);

-- Blanket coverages
CREATE INDEX IF NOT EXISTS idx_im_blanket_details ON inland_marine_blanket_coverages(inland_marine_details_id);

-- Locations
CREATE INDEX IF NOT EXISTS idx_im_locations_details ON inland_marine_locations(inland_marine_details_id);
CREATE INDEX IF NOT EXISTS idx_im_locations_type ON inland_marine_locations(location_type);

-- Additional interests
CREATE INDEX IF NOT EXISTS idx_im_interests_details ON inland_marine_additional_interests(inland_marine_details_id);
CREATE INDEX IF NOT EXISTS idx_im_interests_type ON inland_marine_additional_interests(interest_type);

-- Endorsements
CREATE INDEX IF NOT EXISTS idx_im_endorsements_details ON inland_marine_endorsements(inland_marine_details_id);
CREATE INDEX IF NOT EXISTS idx_im_endorsements_high_impact ON inland_marine_endorsements(high_impact) WHERE high_impact = TRUE;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE inland_marine_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE inland_marine_scheduled_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inland_marine_blanket_coverages ENABLE ROW LEVEL SECURITY;
ALTER TABLE inland_marine_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE inland_marine_additional_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE inland_marine_endorsements ENABLE ROW LEVEL SECURITY;

-- Policies: Users can access IM details for policies in their accounts
CREATE POLICY "Users can view IM details for accessible policies"
    ON inland_marine_details FOR SELECT
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

CREATE POLICY "Users can insert IM details for accessible policies"
    ON inland_marine_details FOR INSERT
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

CREATE POLICY "Users can update IM details for accessible policies"
    ON inland_marine_details FOR UPDATE
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

-- Child tables inherit access from parent
CREATE POLICY "Users can view scheduled items for accessible IM details"
    ON inland_marine_scheduled_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM inland_marine_details imd
            JOIN policies p ON p.id = imd.policy_id
            JOIN accounts a ON p.account_id = a.id
            WHERE imd.id = inland_marine_details_id
            AND (a.owner_agent_id = auth.uid() OR EXISTS (
                SELECT 1 FROM account_memberships am WHERE am.account_id = a.id AND am.user_id = auth.uid()
            ))
        )
    );

CREATE POLICY "Users can manage scheduled items for accessible IM details"
    ON inland_marine_scheduled_items FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM inland_marine_details imd
            JOIN policies p ON p.id = imd.policy_id
            JOIN accounts a ON p.account_id = a.id
            WHERE imd.id = inland_marine_details_id
            AND (a.owner_agent_id = auth.uid() OR EXISTS (
                SELECT 1 FROM account_memberships am WHERE am.account_id = a.id AND am.user_id = auth.uid()
            ))
        )
    );

-- Similar policies for other child tables
CREATE POLICY "Users can manage blanket coverages"
    ON inland_marine_blanket_coverages FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM inland_marine_details imd
            JOIN policies p ON p.id = imd.policy_id
            JOIN accounts a ON p.account_id = a.id
            WHERE imd.id = inland_marine_details_id
            AND (a.owner_agent_id = auth.uid() OR EXISTS (
                SELECT 1 FROM account_memberships am WHERE am.account_id = a.id AND am.user_id = auth.uid()
            ))
        )
    );

CREATE POLICY "Users can manage locations"
    ON inland_marine_locations FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM inland_marine_details imd
            JOIN policies p ON p.id = imd.policy_id
            JOIN accounts a ON p.account_id = a.id
            WHERE imd.id = inland_marine_details_id
            AND (a.owner_agent_id = auth.uid() OR EXISTS (
                SELECT 1 FROM account_memberships am WHERE am.account_id = a.id AND am.user_id = auth.uid()
            ))
        )
    );

CREATE POLICY "Users can manage additional interests"
    ON inland_marine_additional_interests FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM inland_marine_details imd
            JOIN policies p ON p.id = imd.policy_id
            JOIN accounts a ON p.account_id = a.id
            WHERE imd.id = inland_marine_details_id
            AND (a.owner_agent_id = auth.uid() OR EXISTS (
                SELECT 1 FROM account_memberships am WHERE am.account_id = a.id AND am.user_id = auth.uid()
            ))
        )
    );

CREATE POLICY "Users can manage endorsements"
    ON inland_marine_endorsements FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM inland_marine_details imd
            JOIN policies p ON p.id = imd.policy_id
            JOIN accounts a ON p.account_id = a.id
            WHERE imd.id = inland_marine_details_id
            AND (a.owner_agent_id = auth.uid() OR EXISTS (
                SELECT 1 FROM account_memberships am WHERE am.account_id = a.id AND am.user_id = auth.uid()
            ))
        )
    );

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_im_details_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_im_details_updated_at
    BEFORE UPDATE ON inland_marine_details
    FOR EACH ROW
    EXECUTE FUNCTION update_im_details_updated_at();

CREATE TRIGGER tr_im_items_updated_at
    BEFORE UPDATE ON inland_marine_scheduled_items
    FOR EACH ROW
    EXECUTE FUNCTION update_im_details_updated_at();

CREATE TRIGGER tr_im_blanket_updated_at
    BEFORE UPDATE ON inland_marine_blanket_coverages
    FOR EACH ROW
    EXECUTE FUNCTION update_im_details_updated_at();

CREATE TRIGGER tr_im_locations_updated_at
    BEFORE UPDATE ON inland_marine_locations
    FOR EACH ROW
    EXECUTE FUNCTION update_im_details_updated_at();

CREATE TRIGGER tr_im_interests_updated_at
    BEFORE UPDATE ON inland_marine_additional_interests
    FOR EACH ROW
    EXECUTE FUNCTION update_im_details_updated_at();

CREATE TRIGGER tr_im_endorsements_updated_at
    BEFORE UPDATE ON inland_marine_endorsements
    FOR EACH ROW
    EXECUTE FUNCTION update_im_details_updated_at();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE inland_marine_details IS 'Stores extracted inland marine policy data with evidence references';
COMMENT ON TABLE inland_marine_scheduled_items IS 'Scheduled equipment/property items with individual values and deductibles';
COMMENT ON TABLE inland_marine_blanket_coverages IS 'Blanket coverage categories with aggregate limits';
COMMENT ON TABLE inland_marine_locations IS 'Covered locations including permanent sites, jobsites, and storage';
COMMENT ON TABLE inland_marine_additional_interests IS 'Loss payees, additional insureds, lienholders, lessors';
COMMENT ON TABLE inland_marine_endorsements IS 'Policy endorsements including high-impact exclusions';
