-- ============================================
-- ACORD Form Automation - Signatures & Tracking
-- Additional tables for signature requests and submission tracking
-- ============================================

-- ============================================
-- SIGNATURE REQUESTS TABLE
-- Tracks eSignature requests for ACORD forms
-- ============================================

CREATE TABLE IF NOT EXISTS signature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acord_form_id UUID REFERENCES acord_forms(id) ON DELETE CASCADE,
  form_number VARCHAR(10) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  signers JSONB NOT NULL DEFAULT '[]',
  anchors JSONB DEFAULT '[]',
  message TEXT,
  external_request_id VARCHAR(255), -- ID from eSignature provider (Dropbox Sign, DocuSign)
  external_provider VARCHAR(50), -- 'dropbox_sign', 'docusign', etc.
  document_url TEXT,
  signed_document_url TEXT,
  expires_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_status CHECK (status IN ('draft', 'pending', 'sent', 'partial', 'completed', 'declined', 'expired', 'cancelled'))
);

-- Indexes for signature_requests
CREATE INDEX IF NOT EXISTS idx_signature_requests_acord_form ON signature_requests(acord_form_id);
CREATE INDEX IF NOT EXISTS idx_signature_requests_status ON signature_requests(status);
CREATE INDEX IF NOT EXISTS idx_signature_requests_external ON signature_requests(external_request_id) WHERE external_request_id IS NOT NULL;

-- RLS for signature_requests
ALTER TABLE signature_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view signature requests they created"
  ON signature_requests FOR SELECT
  USING (auth.uid() = created_by);

CREATE POLICY "Users can create signature requests"
  ON signature_requests FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their signature requests"
  ON signature_requests FOR UPDATE
  USING (auth.uid() = created_by);

-- ============================================
-- SUBMISSION TRACKING TABLE
-- Tracks status changes for submission packages
-- ============================================

CREATE TABLE IF NOT EXISTS submission_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID REFERENCES submission_packages(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for submission_tracking
CREATE INDEX IF NOT EXISTS idx_submission_tracking_package ON submission_tracking(package_id);
CREATE INDEX IF NOT EXISTS idx_submission_tracking_status ON submission_tracking(status);
CREATE INDEX IF NOT EXISTS idx_submission_tracking_created ON submission_tracking(created_at DESC);

-- RLS for submission_tracking
ALTER TABLE submission_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tracking for their packages"
  ON submission_tracking FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM submission_packages sp
      WHERE sp.id = submission_tracking.package_id
      AND sp.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can add tracking entries"
  ON submission_tracking FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- ============================================
-- CARRIER FORM OVERRIDES TABLE
-- For carrier-specific field requirements
-- ============================================

CREATE TABLE IF NOT EXISTS carrier_form_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id VARCHAR(100) NOT NULL,
  form_number VARCHAR(10) NOT NULL,
  field_overrides JSONB DEFAULT '{}',
  required_fields TEXT[] DEFAULT '{}',
  optional_fields TEXT[] DEFAULT '{}',
  validation_rules JSONB DEFAULT '[]',
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(carrier_id, form_number)
);

-- Index for carrier_form_overrides
CREATE INDEX IF NOT EXISTS idx_carrier_form_overrides_lookup ON carrier_form_overrides(carrier_id, form_number) WHERE is_active = true;

-- ============================================
-- UPDATE TRIGGER FUNCTIONS
-- ============================================

-- Update timestamp trigger for signature_requests
CREATE OR REPLACE FUNCTION update_signature_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_signature_requests_updated_at
  BEFORE UPDATE ON signature_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_signature_requests_updated_at();

-- Update timestamp trigger for carrier_form_overrides
CREATE OR REPLACE FUNCTION update_carrier_form_overrides_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_carrier_form_overrides_updated_at
  BEFORE UPDATE ON carrier_form_overrides
  FOR EACH ROW
  EXECUTE FUNCTION update_carrier_form_overrides_updated_at();

-- ============================================
-- ADD MISSING COLUMNS TO EXISTING TABLES
-- ============================================

-- Add form_number and form_name to acord_forms if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acord_forms' AND column_name = 'form_number') THEN
    ALTER TABLE acord_forms ADD COLUMN form_number VARCHAR(10);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acord_forms' AND column_name = 'form_name') THEN
    ALTER TABLE acord_forms ADD COLUMN form_name TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acord_forms' AND column_name = 'pdf_url') THEN
    ALTER TABLE acord_forms ADD COLUMN pdf_url TEXT;
  END IF;
END $$;

-- Add enrichment_tier to profiles if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'enrichment_tier') THEN
    ALTER TABLE profiles ADD COLUMN enrichment_tier VARCHAR(20) DEFAULT 'basic';
  END IF;
END $$;

-- Add carrier_name and cover_letter to submission_packages if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'submission_packages' AND column_name = 'carrier_name') THEN
    ALTER TABLE submission_packages ADD COLUMN carrier_name VARCHAR(255);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'submission_packages' AND column_name = 'cover_letter') THEN
    ALTER TABLE submission_packages ADD COLUMN cover_letter TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'submission_packages' AND column_name = 'submitted_at') THEN
    ALTER TABLE submission_packages ADD COLUMN submitted_at TIMESTAMPTZ;
  END IF;
END $$;

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

GRANT ALL ON signature_requests TO authenticated;
GRANT ALL ON submission_tracking TO authenticated;
GRANT ALL ON carrier_form_overrides TO authenticated;
