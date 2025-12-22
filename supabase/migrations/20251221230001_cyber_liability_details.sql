-- ============================================================================
-- Cyber Liability Policy Details Table
-- ============================================================================
-- Stores extracted cyber liability policy data with evidence references
-- Covers first-party (breach response, BI, extortion) and third-party
-- (network security, privacy, media liability) coverages
-- ============================================================================

-- Main cyber liability details table
CREATE TABLE IF NOT EXISTS cyber_liability_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,

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

    CONSTRAINT cyber_details_policy_unique UNIQUE (policy_id)
);

-- First-party coverages (denormalized for common queries)
CREATE TABLE IF NOT EXISTS cyber_first_party_coverages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cyber_details_id UUID NOT NULL REFERENCES cyber_liability_details(id) ON DELETE CASCADE,

    -- Data Breach Response
    breach_response_included BOOLEAN DEFAULT FALSE,
    breach_response_limit NUMERIC(15,2),
    breach_response_sublimit NUMERIC(15,2),
    breach_response_deductible NUMERIC(15,2),
    forensic_investigation_limit NUMERIC(15,2),
    notification_costs_limit NUMERIC(15,2),
    credit_monitoring_limit NUMERIC(15,2),
    credit_monitoring_months INTEGER,
    breach_coach_required BOOLEAN,

    -- Cyber Extortion
    extortion_included BOOLEAN DEFAULT FALSE,
    extortion_limit NUMERIC(15,2),
    extortion_deductible NUMERIC(15,2),
    ransom_payment_included BOOLEAN,
    ransom_payment_limit NUMERIC(15,2),
    cryptocurrency_allowed BOOLEAN,
    extortion_waiting_hours INTEGER,

    -- Business Interruption
    bi_included BOOLEAN DEFAULT FALSE,
    bi_limit NUMERIC(15,2),
    bi_deductible NUMERIC(15,2),
    bi_waiting_hours INTEGER,
    bi_restoration_days INTEGER,
    bi_daily_limit NUMERIC(15,2),
    system_failure_included BOOLEAN,
    system_failure_limit NUMERIC(15,2),
    contingent_bi_included BOOLEAN,
    contingent_bi_limit NUMERIC(15,2),

    -- Data Restoration
    data_restoration_included BOOLEAN DEFAULT FALSE,
    data_restoration_limit NUMERIC(15,2),
    data_restoration_deductible NUMERIC(15,2),
    bricking_included BOOLEAN,
    bricking_limit NUMERIC(15,2),

    -- Social Engineering
    social_engineering_included BOOLEAN DEFAULT FALSE,
    social_engineering_limit NUMERIC(15,2),
    social_engineering_deductible NUMERIC(15,2),
    funds_transfer_fraud BOOLEAN,
    invoice_manipulation BOOLEAN,
    callback_verification_required BOOLEAN,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT cyber_fp_unique UNIQUE (cyber_details_id)
);

-- Third-party coverages
CREATE TABLE IF NOT EXISTS cyber_third_party_coverages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cyber_details_id UUID NOT NULL REFERENCES cyber_liability_details(id) ON DELETE CASCADE,

    -- Network Security Liability
    network_security_included BOOLEAN DEFAULT FALSE,
    network_security_limit NUMERIC(15,2),
    network_security_deductible NUMERIC(15,2),
    network_security_defense_costs TEXT, -- 'inside_limits' | 'outside_limits'

    -- Privacy Liability
    privacy_liability_included BOOLEAN DEFAULT FALSE,
    privacy_liability_limit NUMERIC(15,2),
    privacy_liability_deductible NUMERIC(15,2),
    privacy_defense_costs TEXT,
    regulatory_defense_included BOOLEAN,
    regulatory_defense_limit NUMERIC(15,2),
    regulatory_fines_included BOOLEAN,
    regulatory_fines_limit NUMERIC(15,2),
    pci_dss_fines_included BOOLEAN,
    pci_dss_fines_limit NUMERIC(15,2),

    -- Media Liability
    media_liability_included BOOLEAN DEFAULT FALSE,
    media_liability_limit NUMERIC(15,2),
    media_liability_deductible NUMERIC(15,2),
    media_defense_costs TEXT,
    defamation_covered BOOLEAN,
    copyright_infringement_covered BOOLEAN,
    digital_only BOOLEAN,

    -- Technology E&O
    tech_eo_included BOOLEAN DEFAULT FALSE,
    tech_eo_limit NUMERIC(15,2),
    tech_eo_deductible NUMERIC(15,2),
    tech_eo_defense_costs TEXT,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT cyber_tp_unique UNIQUE (cyber_details_id)
);

-- Claims-made provisions
CREATE TABLE IF NOT EXISTS cyber_claims_made_provisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cyber_details_id UUID NOT NULL REFERENCES cyber_liability_details(id) ON DELETE CASCADE,

    -- Retro date
    retroactive_date DATE,
    full_prior_acts BOOLEAN DEFAULT FALSE,

    -- Continuity
    continuity_date DATE,
    pending_prior_date DATE,

    -- ERP / Tail
    erp_available BOOLEAN DEFAULT FALSE,
    basic_erp_days INTEGER,
    supplemental_erp_options JSONB, -- Array of {duration_months, premium_percent, deadline_days}
    automatic_erp_on_nonrenewal BOOLEAN,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT cyber_cm_unique UNIQUE (cyber_details_id)
);

-- Incident response panel
CREATE TABLE IF NOT EXISTS cyber_incident_response_panel (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cyber_details_id UUID NOT NULL REFERENCES cyber_liability_details(id) ON DELETE CASCADE,

    breach_coach_required BOOLEAN DEFAULT FALSE,
    breach_coach_firms JSONB, -- Array of firm names
    forensic_vendors JSONB,
    notification_vendors JSONB,
    pr_firms JSONB,
    legal_firms JSONB,
    credit_monitoring_vendors JSONB,

    pre_approval_required BOOLEAN,
    pre_approval_threshold NUMERIC(15,2),

    claims_hotline TEXT,
    incident_hotline TEXT,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT cyber_ir_unique UNIQUE (cyber_details_id)
);

-- Endorsements
CREATE TABLE IF NOT EXISTS cyber_endorsements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cyber_details_id UUID NOT NULL REFERENCES cyber_liability_details(id) ON DELETE CASCADE,

    endorsement_number TEXT NOT NULL,
    endorsement_name TEXT NOT NULL,
    form_number TEXT,
    edition_date TEXT,

    endorsement_type TEXT NOT NULL,
    high_impact BOOLEAN DEFAULT FALSE,
    impact_description TEXT,

    -- Evidence
    evidence_id TEXT,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_cyber_details_policy ON cyber_liability_details(policy_id);
CREATE INDEX IF NOT EXISTS idx_cyber_details_verified ON cyber_liability_details(verified_at) WHERE verified_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cyber_fp_details ON cyber_first_party_coverages(cyber_details_id);
CREATE INDEX IF NOT EXISTS idx_cyber_fp_bi ON cyber_first_party_coverages(bi_included) WHERE bi_included = TRUE;
CREATE INDEX IF NOT EXISTS idx_cyber_fp_extortion ON cyber_first_party_coverages(extortion_included) WHERE extortion_included = TRUE;

CREATE INDEX IF NOT EXISTS idx_cyber_tp_details ON cyber_third_party_coverages(cyber_details_id);
CREATE INDEX IF NOT EXISTS idx_cyber_tp_privacy ON cyber_third_party_coverages(privacy_liability_included) WHERE privacy_liability_included = TRUE;

CREATE INDEX IF NOT EXISTS idx_cyber_cm_details ON cyber_claims_made_provisions(cyber_details_id);
CREATE INDEX IF NOT EXISTS idx_cyber_cm_retro ON cyber_claims_made_provisions(retroactive_date);

CREATE INDEX IF NOT EXISTS idx_cyber_ir_details ON cyber_incident_response_panel(cyber_details_id);

CREATE INDEX IF NOT EXISTS idx_cyber_endorsements_details ON cyber_endorsements(cyber_details_id);
CREATE INDEX IF NOT EXISTS idx_cyber_endorsements_high_impact ON cyber_endorsements(high_impact) WHERE high_impact = TRUE;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE cyber_liability_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE cyber_first_party_coverages ENABLE ROW LEVEL SECURITY;
ALTER TABLE cyber_third_party_coverages ENABLE ROW LEVEL SECURITY;
ALTER TABLE cyber_claims_made_provisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cyber_incident_response_panel ENABLE ROW LEVEL SECURITY;
ALTER TABLE cyber_endorsements ENABLE ROW LEVEL SECURITY;

-- Main table policies
CREATE POLICY "Users can view cyber details for accessible policies"
    ON cyber_liability_details FOR SELECT
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

CREATE POLICY "Users can insert cyber details for accessible policies"
    ON cyber_liability_details FOR INSERT
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

CREATE POLICY "Users can update cyber details for accessible policies"
    ON cyber_liability_details FOR UPDATE
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

-- Child table policies (inherit from parent)
CREATE POLICY "Users can manage first party coverages"
    ON cyber_first_party_coverages FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM cyber_liability_details cd
            JOIN policies p ON p.id = cd.policy_id
            JOIN accounts a ON p.account_id = a.id
            WHERE cd.id = cyber_details_id
            AND (a.owner_agent_id = auth.uid() OR EXISTS (
                SELECT 1 FROM account_memberships am WHERE am.account_id = a.id AND am.user_id = auth.uid()
            ))
        )
    );

CREATE POLICY "Users can manage third party coverages"
    ON cyber_third_party_coverages FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM cyber_liability_details cd
            JOIN policies p ON p.id = cd.policy_id
            JOIN accounts a ON p.account_id = a.id
            WHERE cd.id = cyber_details_id
            AND (a.owner_agent_id = auth.uid() OR EXISTS (
                SELECT 1 FROM account_memberships am WHERE am.account_id = a.id AND am.user_id = auth.uid()
            ))
        )
    );

CREATE POLICY "Users can manage claims made provisions"
    ON cyber_claims_made_provisions FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM cyber_liability_details cd
            JOIN policies p ON p.id = cd.policy_id
            JOIN accounts a ON p.account_id = a.id
            WHERE cd.id = cyber_details_id
            AND (a.owner_agent_id = auth.uid() OR EXISTS (
                SELECT 1 FROM account_memberships am WHERE am.account_id = a.id AND am.user_id = auth.uid()
            ))
        )
    );

CREATE POLICY "Users can manage incident response panel"
    ON cyber_incident_response_panel FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM cyber_liability_details cd
            JOIN policies p ON p.id = cd.policy_id
            JOIN accounts a ON p.account_id = a.id
            WHERE cd.id = cyber_details_id
            AND (a.owner_agent_id = auth.uid() OR EXISTS (
                SELECT 1 FROM account_memberships am WHERE am.account_id = a.id AND am.user_id = auth.uid()
            ))
        )
    );

CREATE POLICY "Users can manage cyber endorsements"
    ON cyber_endorsements FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM cyber_liability_details cd
            JOIN policies p ON p.id = cd.policy_id
            JOIN accounts a ON p.account_id = a.id
            WHERE cd.id = cyber_details_id
            AND (a.owner_agent_id = auth.uid() OR EXISTS (
                SELECT 1 FROM account_memberships am WHERE am.account_id = a.id AND am.user_id = auth.uid()
            ))
        )
    );

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_cyber_details_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_cyber_details_updated_at
    BEFORE UPDATE ON cyber_liability_details
    FOR EACH ROW
    EXECUTE FUNCTION update_cyber_details_updated_at();

CREATE TRIGGER tr_cyber_fp_updated_at
    BEFORE UPDATE ON cyber_first_party_coverages
    FOR EACH ROW
    EXECUTE FUNCTION update_cyber_details_updated_at();

CREATE TRIGGER tr_cyber_tp_updated_at
    BEFORE UPDATE ON cyber_third_party_coverages
    FOR EACH ROW
    EXECUTE FUNCTION update_cyber_details_updated_at();

CREATE TRIGGER tr_cyber_cm_updated_at
    BEFORE UPDATE ON cyber_claims_made_provisions
    FOR EACH ROW
    EXECUTE FUNCTION update_cyber_details_updated_at();

CREATE TRIGGER tr_cyber_ir_updated_at
    BEFORE UPDATE ON cyber_incident_response_panel
    FOR EACH ROW
    EXECUTE FUNCTION update_cyber_details_updated_at();

CREATE TRIGGER tr_cyber_endorsements_updated_at
    BEFORE UPDATE ON cyber_endorsements
    FOR EACH ROW
    EXECUTE FUNCTION update_cyber_details_updated_at();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE cyber_liability_details IS 'Stores extracted cyber liability policy data with evidence references';
COMMENT ON TABLE cyber_first_party_coverages IS 'First-party cyber coverages: breach response, BI, extortion, data restoration';
COMMENT ON TABLE cyber_third_party_coverages IS 'Third-party cyber coverages: network security, privacy, media liability';
COMMENT ON TABLE cyber_claims_made_provisions IS 'Claims-made policy provisions: retro date, ERP, continuity';
COMMENT ON TABLE cyber_incident_response_panel IS 'Incident response vendor panel and hotlines';
COMMENT ON TABLE cyber_endorsements IS 'Policy endorsements including high-impact exclusions';
