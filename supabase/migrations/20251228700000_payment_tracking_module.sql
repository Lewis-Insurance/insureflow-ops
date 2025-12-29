-- Payment Tracking & Bank Reconciliation Module
-- Migration: 20251228700000_payment_tracking_module.sql

-- ============================================================================
-- HELPER FUNCTIONS (required for RLS policies)
-- ============================================================================

-- Function to check if user is staff
CREATE OR REPLACE FUNCTION is_staff()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's org_id
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT org_id FROM public.user_profiles
    WHERE id = auth.uid() LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PAYMENT METHODS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('cash', 'check', 'credit_card', 'debit_card', 'ach', 'agency_bill', 'finance_company', 'other')),
    requires_reference BOOLEAN DEFAULT false,
    requires_check_number BOOLEAN DEFAULT false,
    gl_account_code TEXT,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(org_id, name)
);

-- ============================================================================
-- BANK ACCOUNTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    account_name TEXT NOT NULL,
    bank_name TEXT NOT NULL,
    account_type TEXT NOT NULL CHECK (account_type IN ('checking', 'savings', 'trust', 'escrow')),
    account_number_last4 TEXT,
    routing_number TEXT,
    is_primary BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    gl_account_code TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- ============================================================================
-- DAY SHEETS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS day_sheets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    sheet_date DATE NOT NULL,
    sheet_number TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'deposited')),
    opened_by UUID REFERENCES auth.users(id),
    opened_at TIMESTAMPTZ DEFAULT now(),
    closed_by UUID REFERENCES auth.users(id),
    closed_at TIMESTAMPTZ,
    -- Totals calculated on close
    total_cash NUMERIC(15,2) DEFAULT 0,
    total_checks NUMERIC(15,2) DEFAULT 0,
    total_credit_cards NUMERIC(15,2) DEFAULT 0,
    total_debit_cards NUMERIC(15,2) DEFAULT 0,
    total_ach NUMERIC(15,2) DEFAULT 0,
    total_agency_bill NUMERIC(15,2) DEFAULT 0,
    total_other NUMERIC(15,2) DEFAULT 0,
    grand_total NUMERIC(15,2) DEFAULT 0,
    payment_count INTEGER DEFAULT 0,
    check_count INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(org_id, sheet_date)
);

-- ============================================================================
-- PREMIUM PAYMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS premium_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    day_sheet_id UUID REFERENCES day_sheets(id),
    policy_id UUID REFERENCES policies(id),
    account_id UUID REFERENCES accounts(id),
    payment_method_id UUID NOT NULL REFERENCES payment_methods(id),

    -- Payment details
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    amount_tendered NUMERIC(15,2), -- For cash payments
    change_given NUMERIC(15,2), -- For cash payments

    -- Reference info
    reference_number TEXT,
    check_number TEXT,
    check_date DATE,
    payer_name TEXT,
    payer_address TEXT,

    -- Metadata
    received_date DATE NOT NULL DEFAULT CURRENT_DATE,
    received_by UUID NOT NULL REFERENCES auth.users(id),
    payment_source TEXT DEFAULT 'in_person' CHECK (payment_source IN ('in_person', 'mail', 'online', 'phone', 'lockbox')),

    -- Status
    status TEXT NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded', 'deposited', 'cleared', 'voided', 'nsf')),
    voided_at TIMESTAMPTZ,
    voided_by UUID REFERENCES auth.users(id),
    void_reason TEXT,
    nsf_at TIMESTAMPTZ,
    nsf_fee NUMERIC(15,2),

    -- Optional linkages
    invoice_number TEXT,
    receipt_number TEXT,
    notes TEXT,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- ============================================================================
-- ESCROW DEPOSITS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS escrow_deposits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    day_sheet_id UUID REFERENCES day_sheets(id),
    bank_account_id UUID NOT NULL REFERENCES bank_accounts(id),

    -- Deposit details
    deposit_date DATE NOT NULL,
    deposit_slip_number TEXT,
    total_amount NUMERIC(15,2) NOT NULL,
    cash_amount NUMERIC(15,2) DEFAULT 0,
    check_amount NUMERIC(15,2) DEFAULT 0,
    check_count INTEGER DEFAULT 0,

    -- Verification (manual QuickBooks check)
    verified_amount NUMERIC(15,2),
    verified_at TIMESTAMPTZ,
    verified_by UUID REFERENCES auth.users(id),
    verification_notes TEXT,

    -- Reconciliation
    reconciliation_status TEXT DEFAULT 'pending' CHECK (reconciliation_status IN ('pending', 'matched', 'variance', 'adjusted')),
    statement_line_id UUID, -- FK added after bank_statement_lines created
    matched_at TIMESTAMPTZ,
    variance_amount NUMERIC(15,2),

    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- ============================================================================
-- BANK STATEMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS bank_statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    bank_account_id UUID NOT NULL REFERENCES bank_accounts(id),

    -- Statement period
    statement_date DATE NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    -- Balances
    beginning_balance NUMERIC(15,2) NOT NULL,
    ending_balance NUMERIC(15,2) NOT NULL,
    total_deposits NUMERIC(15,2) DEFAULT 0,
    total_withdrawals NUMERIC(15,2) DEFAULT 0,

    -- Import tracking
    import_source TEXT CHECK (import_source IN ('csv', 'ofx', 'qfx', 'manual', 'ocr')),
    import_file_name TEXT,
    imported_at TIMESTAMPTZ,
    imported_by UUID REFERENCES auth.users(id),

    -- Reconciliation status
    reconciliation_status TEXT DEFAULT 'pending' CHECK (reconciliation_status IN ('pending', 'in_progress', 'completed', 'finalized')),
    reconciled_at TIMESTAMPTZ,
    reconciled_by UUID REFERENCES auth.users(id),
    reconciled_balance NUMERIC(15,2),

    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(org_id, bank_account_id, statement_date)
);

-- ============================================================================
-- BANK STATEMENT LINES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS bank_statement_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    statement_id UUID NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,

    -- Transaction details
    line_date DATE NOT NULL,
    post_date DATE,
    description TEXT NOT NULL,
    amount NUMERIC(15,2) NOT NULL,
    line_type TEXT NOT NULL CHECK (line_type IN ('deposit', 'withdrawal', 'fee', 'interest', 'transfer', 'adjustment', 'other')),
    reference TEXT,
    check_number TEXT,

    -- Matching
    matched_deposit_id UUID REFERENCES escrow_deposits(id),
    matched_payment_id UUID REFERENCES premium_payments(id),
    matched_at TIMESTAMPTZ,
    matched_by UUID REFERENCES auth.users(id),
    match_confidence NUMERIC(5,2), -- 0-100 for auto-match suggestions

    -- Status
    status TEXT DEFAULT 'unmatched' CHECK (status IN ('unmatched', 'matched', 'excluded', 'adjusted')),
    exclude_reason TEXT,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add FK from escrow_deposits to bank_statement_lines
ALTER TABLE escrow_deposits
ADD CONSTRAINT fk_escrow_statement_line
FOREIGN KEY (statement_line_id) REFERENCES bank_statement_lines(id);

-- ============================================================================
-- RECONCILIATION ADJUSTMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS reconciliation_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    statement_id UUID NOT NULL REFERENCES bank_statements(id),

    -- Adjustment details
    adjustment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('bank_error', 'recording_error', 'timing_difference', 'fee', 'interest', 'nsf', 'other')),
    description TEXT NOT NULL,
    amount NUMERIC(15,2) NOT NULL,

    -- Related records
    related_payment_id UUID REFERENCES premium_payments(id),
    related_deposit_id UUID REFERENCES escrow_deposits(id),
    related_line_id UUID REFERENCES bank_statement_lines(id),

    -- Approval
    created_by UUID NOT NULL REFERENCES auth.users(id),
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ,

    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- PAYMENT AUDIT LOG TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS payment_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,

    -- What changed
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete', 'void', 'nsf', 'match', 'unmatch', 'approve', 'reconcile')),

    -- Change details
    old_values JSONB,
    new_values JSONB,
    changed_fields TEXT[],

    -- Who and when
    performed_by UUID NOT NULL REFERENCES auth.users(id),
    performed_at TIMESTAMPTZ DEFAULT now(),
    ip_address INET,
    user_agent TEXT,

    -- Context
    reason TEXT,
    notes TEXT
);

-- ============================================================================
-- PAYMENT ATTACHMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS payment_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    payment_id UUID REFERENCES premium_payments(id) ON DELETE CASCADE,
    deposit_id UUID REFERENCES escrow_deposits(id) ON DELETE CASCADE,

    -- File details
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER,
    storage_path TEXT NOT NULL,

    -- Metadata
    attachment_type TEXT CHECK (attachment_type IN ('check_image_front', 'check_image_back', 'receipt', 'deposit_slip', 'statement', 'other')),
    description TEXT,

    uploaded_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT payment_or_deposit CHECK (
        (payment_id IS NOT NULL AND deposit_id IS NULL) OR
        (payment_id IS NULL AND deposit_id IS NOT NULL)
    )
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Payment methods
CREATE INDEX idx_payment_methods_org ON payment_methods(org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_payment_methods_type ON payment_methods(org_id, type) WHERE deleted_at IS NULL AND is_active = true;

-- Bank accounts
CREATE INDEX idx_bank_accounts_org ON bank_accounts(org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_bank_accounts_primary ON bank_accounts(org_id) WHERE is_primary = true AND deleted_at IS NULL;

-- Day sheets
CREATE INDEX idx_day_sheets_org ON day_sheets(org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_day_sheets_date ON day_sheets(org_id, sheet_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_day_sheets_status ON day_sheets(org_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_day_sheets_open ON day_sheets(org_id) WHERE status = 'open' AND deleted_at IS NULL;

-- Premium payments
CREATE INDEX idx_premium_payments_org ON premium_payments(org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_premium_payments_day_sheet ON premium_payments(day_sheet_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_premium_payments_policy ON premium_payments(policy_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_premium_payments_account ON premium_payments(account_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_premium_payments_date ON premium_payments(org_id, received_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_premium_payments_status ON premium_payments(org_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_premium_payments_check ON premium_payments(org_id, check_number) WHERE check_number IS NOT NULL AND deleted_at IS NULL;

-- Escrow deposits
CREATE INDEX idx_escrow_deposits_org ON escrow_deposits(org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_escrow_deposits_day_sheet ON escrow_deposits(day_sheet_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_escrow_deposits_date ON escrow_deposits(org_id, deposit_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_escrow_deposits_status ON escrow_deposits(org_id, reconciliation_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_escrow_deposits_unmatched ON escrow_deposits(org_id) WHERE reconciliation_status = 'pending' AND deleted_at IS NULL;

-- Bank statements
CREATE INDEX idx_bank_statements_org ON bank_statements(org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_bank_statements_account ON bank_statements(bank_account_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_bank_statements_date ON bank_statements(org_id, statement_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_bank_statements_status ON bank_statements(org_id, reconciliation_status) WHERE deleted_at IS NULL;

-- Bank statement lines
CREATE INDEX idx_statement_lines_statement ON bank_statement_lines(statement_id);
CREATE INDEX idx_statement_lines_date ON bank_statement_lines(statement_id, line_date);
CREATE INDEX idx_statement_lines_unmatched ON bank_statement_lines(statement_id) WHERE status = 'unmatched';
CREATE INDEX idx_statement_lines_amount ON bank_statement_lines(statement_id, amount) WHERE status = 'unmatched';

-- Reconciliation adjustments
CREATE INDEX idx_recon_adjustments_org ON reconciliation_adjustments(org_id);
CREATE INDEX idx_recon_adjustments_statement ON reconciliation_adjustments(statement_id);

-- Payment audit log
CREATE INDEX idx_payment_audit_org ON payment_audit_log(org_id);
CREATE INDEX idx_payment_audit_record ON payment_audit_log(table_name, record_id);
CREATE INDEX idx_payment_audit_date ON payment_audit_log(org_id, performed_at DESC);
CREATE INDEX idx_payment_audit_user ON payment_audit_log(performed_by);

-- Payment attachments
CREATE INDEX idx_payment_attachments_payment ON payment_attachments(payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX idx_payment_attachments_deposit ON payment_attachments(deposit_id) WHERE deposit_id IS NOT NULL;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE day_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE premium_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrow_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_attachments ENABLE ROW LEVEL SECURITY;

-- Payment Methods RLS
CREATE POLICY "Users can view payment methods for their org"
    ON payment_methods FOR SELECT
    USING (org_id = get_user_org_id());

CREATE POLICY "Staff can manage payment methods"
    ON payment_methods FOR ALL
    USING (org_id = get_user_org_id() AND is_staff());

-- Bank Accounts RLS
CREATE POLICY "Users can view bank accounts for their org"
    ON bank_accounts FOR SELECT
    USING (org_id = get_user_org_id());

CREATE POLICY "Staff can manage bank accounts"
    ON bank_accounts FOR ALL
    USING (org_id = get_user_org_id() AND is_staff());

-- Day Sheets RLS
CREATE POLICY "Users can view day sheets for their org"
    ON day_sheets FOR SELECT
    USING (org_id = get_user_org_id());

CREATE POLICY "Staff can manage day sheets"
    ON day_sheets FOR ALL
    USING (org_id = get_user_org_id() AND is_staff());

-- Premium Payments RLS
CREATE POLICY "Users can view payments for their org"
    ON premium_payments FOR SELECT
    USING (org_id = get_user_org_id());

CREATE POLICY "Staff can manage payments"
    ON premium_payments FOR ALL
    USING (org_id = get_user_org_id() AND is_staff());

-- Escrow Deposits RLS
CREATE POLICY "Users can view deposits for their org"
    ON escrow_deposits FOR SELECT
    USING (org_id = get_user_org_id());

CREATE POLICY "Staff can manage deposits"
    ON escrow_deposits FOR ALL
    USING (org_id = get_user_org_id() AND is_staff());

-- Bank Statements RLS
CREATE POLICY "Users can view statements for their org"
    ON bank_statements FOR SELECT
    USING (org_id = get_user_org_id());

CREATE POLICY "Staff can manage statements"
    ON bank_statements FOR ALL
    USING (org_id = get_user_org_id() AND is_staff());

-- Bank Statement Lines RLS (via statement)
CREATE POLICY "Users can view statement lines for their org"
    ON bank_statement_lines FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM bank_statements bs
        WHERE bs.id = statement_id
        AND bs.org_id = get_user_org_id()
    ));

CREATE POLICY "Staff can manage statement lines"
    ON bank_statement_lines FOR ALL
    USING (EXISTS (
        SELECT 1 FROM bank_statements bs
        WHERE bs.id = statement_id
        AND bs.org_id = get_user_org_id()
    ) AND is_staff());

-- Reconciliation Adjustments RLS
CREATE POLICY "Users can view adjustments for their org"
    ON reconciliation_adjustments FOR SELECT
    USING (org_id = get_user_org_id());

CREATE POLICY "Staff can manage adjustments"
    ON reconciliation_adjustments FOR ALL
    USING (org_id = get_user_org_id() AND is_staff());

-- Payment Audit Log RLS
CREATE POLICY "Users can view audit log for their org"
    ON payment_audit_log FOR SELECT
    USING (org_id = get_user_org_id());

CREATE POLICY "System can insert audit log"
    ON payment_audit_log FOR INSERT
    WITH CHECK (org_id = get_user_org_id());

-- Payment Attachments RLS
CREATE POLICY "Users can view attachments for their org"
    ON payment_attachments FOR SELECT
    USING (org_id = get_user_org_id());

CREATE POLICY "Staff can manage attachments"
    ON payment_attachments FOR ALL
    USING (org_id = get_user_org_id() AND is_staff());

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Updated_at trigger function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_payment_methods_updated_at
    BEFORE UPDATE ON payment_methods
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bank_accounts_updated_at
    BEFORE UPDATE ON bank_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_day_sheets_updated_at
    BEFORE UPDATE ON day_sheets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_premium_payments_updated_at
    BEFORE UPDATE ON premium_payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_escrow_deposits_updated_at
    BEFORE UPDATE ON escrow_deposits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bank_statements_updated_at
    BEFORE UPDATE ON bank_statements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_statement_lines_updated_at
    BEFORE UPDATE ON bank_statement_lines
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_recon_adjustments_updated_at
    BEFORE UPDATE ON reconciliation_adjustments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- AUDIT TRIGGER FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION log_payment_audit()
RETURNS TRIGGER AS $$
DECLARE
    v_org_id UUID;
    v_old_values JSONB;
    v_new_values JSONB;
    v_changed_fields TEXT[];
    v_action TEXT;
BEGIN
    -- Determine action
    IF TG_OP = 'INSERT' THEN
        v_action := 'insert';
        v_new_values := to_jsonb(NEW);
        v_org_id := NEW.org_id;
    ELSIF TG_OP = 'UPDATE' THEN
        v_action := 'update';
        v_old_values := to_jsonb(OLD);
        v_new_values := to_jsonb(NEW);
        v_org_id := NEW.org_id;

        -- Check for special actions
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            IF NEW.status = 'voided' THEN
                v_action := 'void';
            ELSIF NEW.status = 'nsf' THEN
                v_action := 'nsf';
            END IF;
        END IF;

        -- Track changed fields
        SELECT array_agg(key) INTO v_changed_fields
        FROM jsonb_each(v_old_values) old_kv
        FULL OUTER JOIN jsonb_each(v_new_values) new_kv USING (key)
        WHERE old_kv.value IS DISTINCT FROM new_kv.value
        AND key NOT IN ('updated_at');

    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'delete';
        v_old_values := to_jsonb(OLD);
        v_org_id := OLD.org_id;
    END IF;

    -- Insert audit record
    INSERT INTO payment_audit_log (
        org_id,
        table_name,
        record_id,
        action,
        old_values,
        new_values,
        changed_fields,
        performed_by
    ) VALUES (
        v_org_id,
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        v_action,
        v_old_values,
        v_new_values,
        v_changed_fields,
        auth.uid()
    );

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply audit triggers
CREATE TRIGGER audit_premium_payments
    AFTER INSERT OR UPDATE OR DELETE ON premium_payments
    FOR EACH ROW EXECUTE FUNCTION log_payment_audit();

CREATE TRIGGER audit_escrow_deposits
    AFTER INSERT OR UPDATE OR DELETE ON escrow_deposits
    FOR EACH ROW EXECUTE FUNCTION log_payment_audit();

CREATE TRIGGER audit_day_sheets
    AFTER INSERT OR UPDATE OR DELETE ON day_sheets
    FOR EACH ROW EXECUTE FUNCTION log_payment_audit();

CREATE TRIGGER audit_bank_statements
    AFTER INSERT OR UPDATE OR DELETE ON bank_statements
    FOR EACH ROW EXECUTE FUNCTION log_payment_audit();

CREATE TRIGGER audit_reconciliation_adjustments
    AFTER INSERT OR UPDATE OR DELETE ON reconciliation_adjustments
    FOR EACH ROW EXECUTE FUNCTION log_payment_audit();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get or create today's day sheet
CREATE OR REPLACE FUNCTION get_or_create_day_sheet(p_org_id UUID)
RETURNS UUID AS $$
DECLARE
    v_sheet_id UUID;
BEGIN
    -- Try to get existing open sheet for today
    SELECT id INTO v_sheet_id
    FROM day_sheets
    WHERE org_id = p_org_id
      AND sheet_date = CURRENT_DATE
      AND status = 'open'
      AND deleted_at IS NULL;

    -- Create if not exists
    IF v_sheet_id IS NULL THEN
        INSERT INTO day_sheets (org_id, sheet_date, opened_by)
        VALUES (p_org_id, CURRENT_DATE, auth.uid())
        RETURNING id INTO v_sheet_id;
    END IF;

    RETURN v_sheet_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Calculate day sheet totals
CREATE OR REPLACE FUNCTION calculate_day_sheet_totals(p_sheet_id UUID)
RETURNS TABLE (
    total_cash NUMERIC(15,2),
    total_checks NUMERIC(15,2),
    total_credit_cards NUMERIC(15,2),
    total_debit_cards NUMERIC(15,2),
    total_ach NUMERIC(15,2),
    total_agency_bill NUMERIC(15,2),
    total_other NUMERIC(15,2),
    grand_total NUMERIC(15,2),
    payment_count INTEGER,
    check_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(CASE WHEN pm.type = 'cash' THEN pp.amount END), 0)::NUMERIC(15,2) as total_cash,
        COALESCE(SUM(CASE WHEN pm.type = 'check' THEN pp.amount END), 0)::NUMERIC(15,2) as total_checks,
        COALESCE(SUM(CASE WHEN pm.type = 'credit_card' THEN pp.amount END), 0)::NUMERIC(15,2) as total_credit_cards,
        COALESCE(SUM(CASE WHEN pm.type = 'debit_card' THEN pp.amount END), 0)::NUMERIC(15,2) as total_debit_cards,
        COALESCE(SUM(CASE WHEN pm.type = 'ach' THEN pp.amount END), 0)::NUMERIC(15,2) as total_ach,
        COALESCE(SUM(CASE WHEN pm.type = 'agency_bill' THEN pp.amount END), 0)::NUMERIC(15,2) as total_agency_bill,
        COALESCE(SUM(CASE WHEN pm.type IN ('finance_company', 'other') THEN pp.amount END), 0)::NUMERIC(15,2) as total_other,
        COALESCE(SUM(pp.amount), 0)::NUMERIC(15,2) as grand_total,
        COUNT(pp.id)::INTEGER as payment_count,
        COUNT(pp.check_number)::INTEGER as check_count
    FROM premium_payments pp
    JOIN payment_methods pm ON pp.payment_method_id = pm.id
    WHERE pp.day_sheet_id = p_sheet_id
      AND pp.status = 'recorded'
      AND pp.deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Suggest deposit matches
CREATE OR REPLACE FUNCTION suggest_deposit_matches(p_statement_id UUID)
RETURNS TABLE (
    line_id UUID,
    deposit_id UUID,
    match_confidence NUMERIC(5,2),
    amount_match BOOLEAN,
    date_diff INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        bsl.id as line_id,
        ed.id as deposit_id,
        CASE
            WHEN bsl.amount = ed.total_amount AND ABS(bsl.line_date - ed.deposit_date) <= 1 THEN 100.0
            WHEN bsl.amount = ed.total_amount AND ABS(bsl.line_date - ed.deposit_date) <= 3 THEN 90.0
            WHEN bsl.amount = ed.total_amount THEN 75.0
            WHEN ABS(bsl.amount - ed.total_amount) < 0.01 THEN 70.0
            ELSE 50.0
        END::NUMERIC(5,2) as match_confidence,
        (bsl.amount = ed.total_amount) as amount_match,
        (bsl.line_date - ed.deposit_date)::INTEGER as date_diff
    FROM bank_statement_lines bsl
    JOIN bank_statements bs ON bs.id = bsl.statement_id
    CROSS JOIN escrow_deposits ed
    WHERE bsl.statement_id = p_statement_id
      AND bsl.status = 'unmatched'
      AND bsl.line_type = 'deposit'
      AND ed.org_id = bs.org_id
      AND ed.reconciliation_status = 'pending'
      AND ed.deleted_at IS NULL
      AND ABS(bsl.amount - ed.total_amount) < ed.total_amount * 0.05 -- Within 5%
      AND ABS(bsl.line_date - ed.deposit_date) <= 7 -- Within 7 days
    ORDER BY match_confidence DESC, ABS(bsl.line_date - ed.deposit_date);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- SEED DEFAULT PAYMENT METHODS
-- ============================================================================
-- Note: This should be run per-org, typically via an edge function on org creation
-- Example seed data structure for reference:
/*
INSERT INTO payment_methods (org_id, name, type, requires_reference, requires_check_number, display_order)
VALUES
    (p_org_id, 'Cash', 'cash', false, false, 1),
    (p_org_id, 'Personal Check', 'check', false, true, 2),
    (p_org_id, 'Business Check', 'check', false, true, 3),
    (p_org_id, 'Credit Card', 'credit_card', true, false, 4),
    (p_org_id, 'Debit Card', 'debit_card', true, false, 5),
    (p_org_id, 'ACH/EFT', 'ach', true, false, 6),
    (p_org_id, 'Agency Bill', 'agency_bill', true, false, 7),
    (p_org_id, 'Finance Company', 'finance_company', true, false, 8);
*/

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

COMMENT ON TABLE payment_methods IS 'Payment method definitions per organization';
COMMENT ON TABLE bank_accounts IS 'Bank accounts for escrow deposits';
COMMENT ON TABLE day_sheets IS 'Daily payment batches';
COMMENT ON TABLE premium_payments IS 'Individual premium payment records';
COMMENT ON TABLE escrow_deposits IS 'Bank deposits from day sheets';
COMMENT ON TABLE bank_statements IS 'Monthly bank statement headers';
COMMENT ON TABLE bank_statement_lines IS 'Individual bank statement line items';
COMMENT ON TABLE reconciliation_adjustments IS 'Manual reconciliation adjustments';
COMMENT ON TABLE payment_audit_log IS 'Complete audit trail for payment operations';
COMMENT ON TABLE payment_attachments IS 'Check images and receipt attachments';
