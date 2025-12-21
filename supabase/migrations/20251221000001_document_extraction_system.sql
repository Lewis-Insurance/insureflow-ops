-- ============================================
-- DOCUMENT EXTRACTION SYSTEM
-- Parse insurance documents and extract data for ACORD forms
-- ============================================

-- Document extraction jobs
CREATE TABLE IF NOT EXISTS document_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source document
  document_url TEXT NOT NULL,
  document_name TEXT NOT NULL,
  document_type VARCHAR(50) DEFAULT 'unknown', -- dec_page, prior_policy, acord_form, application, loss_run, other
  file_size_bytes INTEGER,
  page_count INTEGER,

  -- Association
  account_id UUID REFERENCES accounts(id),
  acord_form_id UUID REFERENCES acord_forms(id),

  -- Extraction status
  status VARCHAR(20) DEFAULT 'pending', -- pending, processing, extracted, mapped, applied, failed

  -- Azure Document Intelligence results
  azure_raw_response JSONB,
  azure_key_value_pairs JSONB DEFAULT '{}',
  azure_tables JSONB DEFAULT '[]',
  azure_text_content TEXT,
  azure_confidence_score NUMERIC(5,4),

  -- Claude mapping results
  claude_mapped_fields JSONB DEFAULT '{}',
  claude_unmapped_fields JSONB DEFAULT '[]',
  claude_suggestions JSONB DEFAULT '[]',
  claude_confidence_scores JSONB DEFAULT '{}',

  -- Final merged result
  extracted_fields JSONB DEFAULT '{}',
  field_sources JSONB DEFAULT '{}', -- track where each field value came from

  -- User review
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  user_corrections JSONB DEFAULT '{}',

  -- Metadata
  extraction_started_at TIMESTAMPTZ,
  extraction_completed_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for finding extractions by account/form
CREATE INDEX IF NOT EXISTS idx_document_extractions_account ON document_extractions(account_id);
CREATE INDEX IF NOT EXISTS idx_document_extractions_form ON document_extractions(acord_form_id);
CREATE INDEX IF NOT EXISTS idx_document_extractions_status ON document_extractions(status);

-- Field mapping rules (customize how extracted fields map to ACORD fields)
CREATE TABLE IF NOT EXISTS extraction_field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source pattern (from extracted document)
  source_pattern TEXT NOT NULL, -- regex or exact match
  source_type VARCHAR(20) DEFAULT 'exact', -- exact, regex, contains, starts_with

  -- Target ACORD field
  target_acord_field TEXT NOT NULL,
  target_form_numbers TEXT[] DEFAULT '{}', -- which ACORD forms this applies to, empty = all

  -- Transform
  transform_type VARCHAR(20) DEFAULT 'direct', -- direct, format_date, format_phone, format_currency, uppercase, etc.
  transform_config JSONB DEFAULT '{}',

  -- Priority (higher = checked first)
  priority INTEGER DEFAULT 100,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed common insurance field mappings
INSERT INTO extraction_field_mappings (source_pattern, source_type, target_acord_field, transform_type, priority) VALUES
  -- Named Insured variations
  ('Named Insured', 'exact', 'NamedInsured', 'direct', 100),
  ('Insured Name', 'exact', 'NamedInsured', 'direct', 100),
  ('Policy Holder', 'exact', 'NamedInsured', 'direct', 90),
  ('Policyholder', 'exact', 'NamedInsured', 'direct', 90),
  ('Name of Insured', 'exact', 'NamedInsured', 'direct', 90),
  ('Applicant', 'exact', 'NamedInsured', 'direct', 80),

  -- Address variations
  ('Mailing Address', 'exact', 'MailingAddress', 'direct', 100),
  ('Address', 'exact', 'MailingAddress', 'direct', 90),
  ('Street Address', 'exact', 'MailingAddress', 'direct', 90),
  ('Business Address', 'exact', 'MailingAddress', 'direct', 85),

  -- Policy Number
  ('Policy Number', 'exact', 'PolicyNumber', 'direct', 100),
  ('Policy No', 'exact', 'PolicyNumber', 'direct', 95),
  ('Policy #', 'exact', 'PolicyNumber', 'direct', 95),

  -- Effective Date
  ('Effective Date', 'exact', 'EffectiveDate', 'format_date', 100),
  ('Policy Effective', 'exact', 'EffectiveDate', 'format_date', 95),
  ('Eff Date', 'exact', 'EffectiveDate', 'format_date', 90),

  -- Expiration Date
  ('Expiration Date', 'exact', 'ExpirationDate', 'format_date', 100),
  ('Policy Expiration', 'exact', 'ExpirationDate', 'format_date', 95),
  ('Exp Date', 'exact', 'ExpirationDate', 'format_date', 90),

  -- Premium
  ('Total Premium', 'exact', 'TotalPremium', 'format_currency', 100),
  ('Annual Premium', 'exact', 'TotalPremium', 'format_currency', 95),
  ('Premium', 'exact', 'TotalPremium', 'format_currency', 90),

  -- Liability Limits
  ('General Aggregate', 'exact', 'GeneralAggregate', 'format_currency', 100),
  ('Each Occurrence', 'exact', 'EachOccurrence', 'format_currency', 100),
  ('Products/Completed Ops', 'exact', 'ProductsCompletedOps', 'format_currency', 100),
  ('Personal & Advertising Injury', 'exact', 'PersonalAdvInjury', 'format_currency', 100),
  ('Damage to Rented Premises', 'exact', 'DamageToRentedPremises', 'format_currency', 100),
  ('Medical Expense', 'exact', 'MedicalExpense', 'format_currency', 100),

  -- Auto
  ('Combined Single Limit', 'exact', 'CombinedSingleLimit', 'format_currency', 100),
  ('Bodily Injury Per Person', 'exact', 'BodilyInjuryPerPerson', 'format_currency', 100),
  ('Bodily Injury Per Accident', 'exact', 'BodilyInjuryPerAccident', 'format_currency', 100),
  ('Property Damage', 'exact', 'PropertyDamage', 'format_currency', 100),

  -- Workers Comp
  ('WC Statutory Limits', 'exact', 'WCStatutoryLimits', 'direct', 100),
  ('Employers Liability', 'exact', 'EmployersLiability', 'format_currency', 100),

  -- Business Info
  ('FEIN', 'exact', 'FEIN', 'direct', 100),
  ('Federal ID', 'exact', 'FEIN', 'direct', 95),
  ('Tax ID', 'exact', 'FEIN', 'direct', 90),
  ('SIC Code', 'exact', 'SICCode', 'direct', 100),
  ('NAICS Code', 'exact', 'NAICSCode', 'direct', 100),
  ('Business Description', 'exact', 'BusinessDescription', 'direct', 100),
  ('Nature of Business', 'exact', 'BusinessDescription', 'direct', 95)
ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE document_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_field_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can manage document extractions" ON document_extractions;
CREATE POLICY "Staff can manage document extractions" ON document_extractions
FOR ALL USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Staff can read field mappings" ON extraction_field_mappings;
CREATE POLICY "Staff can read field mappings" ON extraction_field_mappings
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin can manage field mappings" ON extraction_field_mappings;
CREATE POLICY "Admin can manage field mappings" ON extraction_field_mappings
FOR ALL USING (auth.uid() IS NOT NULL);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_document_extraction_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_document_extraction_updated ON document_extractions;
CREATE TRIGGER trg_document_extraction_updated
BEFORE UPDATE ON document_extractions
FOR EACH ROW
EXECUTE FUNCTION update_document_extraction_timestamp();

-- Grant permissions
GRANT ALL ON document_extractions TO authenticated;
GRANT SELECT ON extraction_field_mappings TO authenticated;
