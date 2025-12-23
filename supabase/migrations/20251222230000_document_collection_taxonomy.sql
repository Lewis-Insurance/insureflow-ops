-- ============================================================================
-- DOCUMENT COLLECTION TAXONOMY & TEMPLATES ENHANCEMENT
-- Implements comprehensive document types and smart packet templates
-- ============================================================================

-- ============================================================================
-- 1. DOCUMENT TYPE DEFINITIONS (CANONICAL TAXONOMY)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.document_type_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Stable identifier
  doc_type_key TEXT NOT NULL UNIQUE,
  
  -- Display
  display_name TEXT NOT NULL,
  short_description TEXT,
  
  -- Client-facing instructions
  upload_instructions TEXT,
  
  -- File constraints
  accepted_file_types TEXT[] DEFAULT ARRAY['pdf', 'jpg', 'jpeg', 'png'],
  max_file_size_mb INTEGER DEFAULT 25,
  
  -- Quantity rules
  min_quantity INTEGER DEFAULT 0,
  max_quantity INTEGER DEFAULT 10,
  
  -- Validation hints (for agents/extraction)
  validation_hints TEXT,
  
  -- ACORD linkage
  acord_links JSONB DEFAULT '[]', -- [{form: "ACORD_125", section: "LossHistory"}]
  
  -- Categorization
  tags TEXT[] DEFAULT ARRAY[]::TEXT[], -- submission, bind, underwriting, billing, claims, identity, service
  lob_relevance TEXT[] DEFAULT ARRAY[]::TEXT[], -- auto, property, gl, wc, umbrella, personal
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 100,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_type_defs_key ON document_type_definitions(doc_type_key);
CREATE INDEX IF NOT EXISTS idx_doc_type_defs_tags ON document_type_definitions USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_doc_type_defs_lob ON document_type_definitions USING GIN(lob_relevance);

-- ============================================================================
-- 2. SEED DOCUMENT TYPE DEFINITIONS
-- ============================================================================

INSERT INTO document_type_definitions (
  doc_type_key, display_name, short_description, upload_instructions,
  accepted_file_types, min_quantity, max_quantity, validation_hints,
  acord_links, tags, lob_relevance, display_order
) VALUES
  -- ACORD 125
  (
    'ACORD_125',
    'ACORD 125',
    'Commercial insurance application',
    'Upload the completed ACORD 125 if you have it. If not, you can skip and we''ll gather details another way.',
    ARRAY['pdf', 'docx', 'jpg', 'png'],
    0, 3,
    'Look for applicant name, policy info, and signatures.',
    '[{"form": "ACORD_125"}]'::JSONB,
    ARRAY['submission', 'underwriting'],
    ARRAY['commercial', 'gl', 'property'],
    10
  ),
  
  -- Loss Runs
  (
    'LOSS_RUNS',
    'Loss Run',
    'Claims history used for underwriting',
    'Upload loss runs for the past 3–5 years. If multiple PDFs, upload them all.',
    ARRAY['pdf'],
    0, 10,
    'Look for valuation date, claim list, totals, and carrier letterhead.',
    '[{"form": "ACORD_125", "section": "LossHistory"}]'::JSONB,
    ARRAY['submission', 'underwriting', 'claims'],
    ARRAY['commercial', 'personal', 'auto', 'gl', 'property', 'wc'],
    20
  ),
  
  -- Payment Document
  (
    'PAYMENT_DOC',
    'Payment Doc',
    'Payment confirmation or authorization',
    'Upload proof of payment, payment confirmation, or authorization form if requested for binding.',
    ARRAY['pdf', 'jpg', 'png'],
    0, 5,
    'Look for payment amount, date, and confirmation number.',
    '[]'::JSONB,
    ARRAY['bind', 'billing'],
    ARRAY['commercial', 'personal'],
    30
  ),
  
  -- Carrier Supplementary Form
  (
    'CARRIER_SUPPLEMENT',
    'Carrier Supplementary Form',
    'Carrier-specific underwriting questions',
    'Upload any carrier supplemental forms requested for the quote/bind.',
    ARRAY['pdf', 'docx', 'jpg', 'png'],
    0, 10,
    NULL,
    '[]'::JSONB,
    ARRAY['submission', 'underwriting'],
    ARRAY['commercial', 'personal'],
    40
  ),
  
  -- Statement of No Loss
  (
    'STATEMENT_NO_LOSS',
    'Statement of No Loss',
    'Affirmation of no losses during a period',
    'Upload a signed statement of no loss if requested.',
    ARRAY['pdf', 'jpg', 'png'],
    0, 3,
    'Should be signed and dated by the insured.',
    '[]'::JSONB,
    ARRAY['bind', 'underwriting'],
    ARRAY['commercial', 'personal'],
    50
  ),
  
  -- Current Dec Page
  (
    'CURRENT_DEC',
    'Current Policy Dec Page',
    'Your current declarations page',
    'Upload the most recent dec page showing coverages, limits, and premium.',
    ARRAY['pdf', 'jpg', 'png'],
    0, 5,
    'Should show named insured, policy number, coverages, limits, and premium.',
    '[]'::JSONB,
    ARRAY['remarket', 'underwriting', 'submission'],
    ARRAY['commercial', 'personal', 'auto', 'gl', 'property', 'wc', 'umbrella'],
    60
  ),
  
  -- Renewal Dec / Renewal Offer
  (
    'RENEWAL_DEC',
    'Renewal Dec / Renewal Offer',
    'Renewal terms for your policy period',
    'Upload the renewal offer or renewal dec page that shows your new premium and term.',
    ARRAY['pdf', 'jpg', 'png'],
    0, 5,
    'Should show new premium, effective dates, and any coverage changes.',
    '[]'::JSONB,
    ARRAY['renewal', 'remarket'],
    ARRAY['commercial', 'personal', 'auto', 'gl', 'property', 'wc'],
    70
  ),
  
  -- Driver List / MVR
  (
    'DRIVER_LIST_MVR',
    'Driver List / MVR',
    'Drivers and motor vehicle records',
    'Upload driver list or MVRs if requested.',
    ARRAY['pdf'],
    0, 20,
    'Should include driver names, DOB, license numbers, and violation history.',
    '[]'::JSONB,
    ARRAY['submission', 'underwriting'],
    ARRAY['auto', 'commercial_auto', 'personal_auto'],
    80
  ),
  
  -- Vehicle Schedule
  (
    'VEHICLE_SCHEDULE',
    'Vehicle Schedule',
    'Vehicles, VINs, garaging, symbols',
    'Upload the vehicle schedule if separate from the dec page.',
    ARRAY['pdf'],
    0, 10,
    'Should include VINs, year/make/model, and garaging addresses.',
    '[]'::JSONB,
    ARRAY['submission', 'underwriting'],
    ARRAY['auto', 'commercial_auto'],
    90
  ),
  
  -- Entity Documents
  (
    'ENTITY_DOCS',
    'Entity Documents',
    'Proof of business entity information',
    'Upload articles of incorporation, EIN letter, or similar if requested.',
    ARRAY['pdf', 'jpg', 'png'],
    0, 10,
    'Should clearly show legal entity name and EIN/tax ID.',
    '[]'::JSONB,
    ARRAY['submission', 'compliance'],
    ARRAY['commercial'],
    100
  ),
  
  -- Certificate Request
  (
    'CERTIFICATE_REQUEST',
    'Certificate Request',
    'Info needed to issue a COI',
    'Upload contract requirements or COI request details.',
    ARRAY['pdf', 'jpg', 'png'],
    0, 10,
    NULL,
    '[]'::JSONB,
    ARRAY['service'],
    ARRAY['commercial'],
    110
  ),
  
  -- Property Schedule / SOV
  (
    'PROPERTY_SOV',
    'Property Schedule / SOV',
    'Schedule of values for property underwriting',
    'Upload schedule of values (SOV) / building list / values.',
    ARRAY['pdf', 'xlsx', 'csv'],
    0, 10,
    'Should include building addresses, values, construction type, and occupancy.',
    '[]'::JSONB,
    ARRAY['property', 'submission', 'underwriting'],
    ARRAY['property', 'commercial'],
    120
  ),
  
  -- Workers Comp Mod / Payroll
  (
    'WC_MOD_PAYROLL',
    'WC Mod / Payroll',
    'Experience mod and payroll breakdown',
    'Upload experience mod worksheet and payroll by class code if available.',
    ARRAY['pdf', 'xlsx', 'csv'],
    0, 10,
    'Should include experience mod rating, class codes, and payroll by class.',
    '[]'::JSONB,
    ARRAY['wc', 'underwriting'],
    ARRAY['wc', 'commercial'],
    130
  ),
  
  -- ID Cards
  (
    'ID_CARDS',
    'ID Cards',
    'Insurance cards for vehicles/insured',
    'Upload any ID cards if requested.',
    ARRAY['pdf', 'jpg', 'png'],
    0, 10,
    NULL,
    '[]'::JSONB,
    ARRAY['service'],
    ARRAY['auto', 'personal_auto'],
    140
  ),
  
  -- Signed Application
  (
    'SIGNED_APP',
    'Signed Application',
    'Executed application for binding',
    'Upload the signed application or signature page.',
    ARRAY['pdf', 'jpg', 'png'],
    0, 5,
    'Must show signature and date.',
    '[]'::JSONB,
    ARRAY['bind'],
    ARRAY['commercial', 'personal'],
    150
  ),
  
  -- Prior Policy
  (
    'PRIOR_POLICY',
    'Prior Policy Documents',
    'Previous policy or prior carrier info',
    'Upload prior policy dec page or policy documents if different from current.',
    ARRAY['pdf'],
    0, 10,
    NULL,
    '[]'::JSONB,
    ARRAY['submission', 'underwriting'],
    ARRAY['commercial', 'personal'],
    160
  ),
  
  -- Photos
  (
    'PHOTOS',
    'Photos',
    'Property or vehicle photos',
    'Upload photos of the property, vehicles, or equipment as requested.',
    ARRAY['jpg', 'jpeg', 'png', 'heic', 'pdf'],
    0, 50,
    NULL,
    '[]'::JSONB,
    ARRAY['underwriting'],
    ARRAY['property', 'auto'],
    170
  ),
  
  -- Other Document
  (
    'OTHER',
    'Other Document',
    'Miscellaneous document',
    'Upload any other document requested by your agent.',
    ARRAY['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx', 'xlsx'],
    0, 20,
    NULL,
    '[]'::JSONB,
    ARRAY[]::TEXT[],
    ARRAY[]::TEXT[],
    999
  )
ON CONFLICT (doc_type_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  short_description = EXCLUDED.short_description,
  upload_instructions = EXCLUDED.upload_instructions,
  accepted_file_types = EXCLUDED.accepted_file_types,
  min_quantity = EXCLUDED.min_quantity,
  max_quantity = EXCLUDED.max_quantity,
  validation_hints = EXCLUDED.validation_hints,
  acord_links = EXCLUDED.acord_links,
  tags = EXCLUDED.tags,
  lob_relevance = EXCLUDED.lob_relevance,
  display_order = EXCLUDED.display_order,
  updated_at = NOW();

-- ============================================================================
-- 3. ENHANCED COLLECTION TEMPLATES
-- ============================================================================

-- Clear old templates and insert comprehensive ones
DELETE FROM collection_templates WHERE is_system = TRUE;

INSERT INTO collection_templates (
  name, description, use_case, line_of_business, 
  requirements, default_expiration_days, is_active, is_system
) VALUES
  -- Commercial Submission Base
  (
    'Commercial Submission Packet',
    'Standard document collection for new commercial insurance submissions',
    'new_commercial_submission',
    'commercial',
    '[
      {"doc_type": "ACORD_125", "label": "ACORD 125 - Commercial Application", "is_required": false, "instructions": "Upload if you have a completed ACORD 125."},
      {"doc_type": "LOSS_RUNS", "label": "Loss Runs (3-5 Years)", "is_required": true, "min_quantity": 1, "instructions": "Upload loss runs from current and prior carriers."},
      {"doc_type": "CURRENT_DEC", "label": "Current Dec Page", "is_required": true, "min_quantity": 1, "instructions": "Upload your current policy declaration page."},
      {"doc_type": "CARRIER_SUPPLEMENT", "label": "Carrier Supplementary Forms", "is_required": false, "instructions": "Upload any carrier-specific forms if applicable."},
      {"doc_type": "ENTITY_DOCS", "label": "Entity Documents", "is_required": false, "instructions": "Upload articles of incorporation or EIN letter if requested."}
    ]'::JSONB,
    30,
    TRUE,
    TRUE
  ),
  
  -- Commercial Binding
  (
    'Binding Requirements',
    'Documents needed to bind a commercial policy',
    'commercial_bind',
    'commercial',
    '[
      {"doc_type": "PAYMENT_DOC", "label": "Payment Information", "is_required": true, "min_quantity": 1, "instructions": "Upload payment confirmation or authorization form."},
      {"doc_type": "SIGNED_APP", "label": "Signed Application", "is_required": true, "min_quantity": 1, "instructions": "Upload the signed application or signature page."},
      {"doc_type": "STATEMENT_NO_LOSS", "label": "Statement of No Loss", "is_required": false, "instructions": "Upload if no claims have occurred since quote date."},
      {"doc_type": "CARRIER_SUPPLEMENT", "label": "Carrier Supplementary Forms", "is_required": false, "instructions": "Upload any additional carrier forms."},
      {"doc_type": "ENTITY_DOCS", "label": "Entity Documents", "is_required": false, "instructions": "Upload entity documents if not yet provided."}
    ]'::JSONB,
    14,
    TRUE,
    TRUE
  ),
  
  -- Renewal Remarketing
  (
    'Renewal Review / Remarketing',
    'Documents needed to remarket an upcoming renewal',
    'commercial_renewal',
    NULL,
    '[
      {"doc_type": "RENEWAL_DEC", "label": "Renewal Offer / Dec Page", "is_required": true, "min_quantity": 1, "instructions": "Upload your renewal offer or renewal dec page."},
      {"doc_type": "CURRENT_DEC", "label": "Current Policy Dec Page", "is_required": true, "min_quantity": 1, "instructions": "Upload your expiring policy dec page."},
      {"doc_type": "LOSS_RUNS", "label": "Loss Runs", "is_required": false, "instructions": "Upload loss runs if available or if specifically requested."}
    ]'::JSONB,
    21,
    TRUE,
    TRUE
  ),
  
  -- Commercial Auto Submission
  (
    'Commercial Auto Submission',
    'Documents for commercial auto insurance submission',
    'new_commercial_submission',
    'commercial_auto',
    '[
      {"doc_type": "CURRENT_DEC", "label": "Current Auto Dec Page", "is_required": true, "min_quantity": 1, "instructions": "Upload your current commercial auto dec page."},
      {"doc_type": "VEHICLE_SCHEDULE", "label": "Vehicle Schedule", "is_required": true, "min_quantity": 1, "instructions": "Upload the schedule with all vehicles, VINs, and garaging."},
      {"doc_type": "DRIVER_LIST_MVR", "label": "Driver List / MVRs", "is_required": true, "min_quantity": 1, "instructions": "Upload driver list with DOB and license info."},
      {"doc_type": "LOSS_RUNS", "label": "Auto Loss Runs (5 Years)", "is_required": true, "min_quantity": 1, "instructions": "Upload auto loss runs for the past 5 years."},
      {"doc_type": "ACORD_125", "label": "ACORD 125 (Optional)", "is_required": false, "instructions": "Upload if you have a completed ACORD 125."},
      {"doc_type": "CARRIER_SUPPLEMENT", "label": "Carrier Supplements", "is_required": false, "instructions": "Upload any carrier-specific auto supplements."}
    ]'::JSONB,
    30,
    TRUE,
    TRUE
  ),
  
  -- Personal Lines Bind
  (
    'Personal Lines Bind',
    'Documents needed to bind a personal lines policy',
    'personal_lines_bind',
    'personal',
    '[
      {"doc_type": "PAYMENT_DOC", "label": "Payment Information", "is_required": true, "min_quantity": 1, "instructions": "Upload payment confirmation or provide payment method."},
      {"doc_type": "SIGNED_APP", "label": "Signed Application", "is_required": true, "min_quantity": 1, "instructions": "Upload the signed application."},
      {"doc_type": "PRIOR_POLICY", "label": "Proof of Prior Insurance", "is_required": false, "instructions": "Upload dec page showing continuous coverage if requested."}
    ]'::JSONB,
    14,
    TRUE,
    TRUE
  ),
  
  -- Certificate / COI Request
  (
    'Certificate / COI Request',
    'Documents needed to issue a certificate of insurance',
    'certificate_request',
    NULL,
    '[
      {"doc_type": "CERTIFICATE_REQUEST", "label": "Certificate Request Details", "is_required": true, "min_quantity": 1, "instructions": "Upload contract requirements or COI holder information."}
    ]'::JSONB,
    7,
    TRUE,
    TRUE
  ),
  
  -- Workers Comp Submission
  (
    'Workers Comp Submission',
    'Documents for workers compensation submission',
    'new_commercial_submission',
    'wc',
    '[
      {"doc_type": "CURRENT_DEC", "label": "Current WC Dec Page", "is_required": true, "min_quantity": 1, "instructions": "Upload your current workers comp dec page."},
      {"doc_type": "LOSS_RUNS", "label": "WC Loss Runs (5 Years)", "is_required": true, "min_quantity": 1, "instructions": "Upload workers comp loss runs for past 5 years."},
      {"doc_type": "WC_MOD_PAYROLL", "label": "Experience Mod & Payroll", "is_required": true, "min_quantity": 1, "instructions": "Upload experience mod worksheet and payroll by class."},
      {"doc_type": "ENTITY_DOCS", "label": "Entity Documents", "is_required": false, "instructions": "Upload if ownership or entity structure has changed."}
    ]'::JSONB,
    30,
    TRUE,
    TRUE
  ),
  
  -- Property Submission
  (
    'Property Submission',
    'Documents for commercial property submission',
    'new_commercial_submission',
    'property',
    '[
      {"doc_type": "CURRENT_DEC", "label": "Current Property Dec Page", "is_required": true, "min_quantity": 1, "instructions": "Upload your current property dec page."},
      {"doc_type": "PROPERTY_SOV", "label": "Schedule of Values (SOV)", "is_required": true, "min_quantity": 1, "instructions": "Upload your building/property schedule with values."},
      {"doc_type": "LOSS_RUNS", "label": "Property Loss Runs", "is_required": true, "min_quantity": 1, "instructions": "Upload property loss runs for the past 5 years."},
      {"doc_type": "PHOTOS", "label": "Property Photos", "is_required": false, "instructions": "Upload photos of buildings/locations if requested."}
    ]'::JSONB,
    30,
    TRUE,
    TRUE
  ),
  
  -- Quick Document Request (empty template)
  (
    'Quick Document Request',
    'Ad-hoc request for specific documents',
    'general',
    NULL,
    '[]'::JSONB,
    14,
    TRUE,
    TRUE
  )
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 4. LOB-BASED REQUIREMENT SUGGESTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.lob_document_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lob_key TEXT NOT NULL UNIQUE,
  lob_display_name TEXT NOT NULL,
  suggested_doc_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO lob_document_suggestions (lob_key, lob_display_name, suggested_doc_types)
VALUES
  ('personal_auto', 'Personal Auto', ARRAY['CURRENT_DEC', 'RENEWAL_DEC', 'ID_CARDS', 'DRIVER_LIST_MVR']),
  ('commercial_auto', 'Commercial Auto', ARRAY['CURRENT_DEC', 'VEHICLE_SCHEDULE', 'DRIVER_LIST_MVR', 'LOSS_RUNS']),
  ('gl', 'General Liability (CGL)', ARRAY['CURRENT_DEC', 'LOSS_RUNS', 'ACORD_125', 'CARRIER_SUPPLEMENT']),
  ('property', 'Commercial Property', ARRAY['CURRENT_DEC', 'PROPERTY_SOV', 'LOSS_RUNS', 'PHOTOS']),
  ('wc', 'Workers Compensation', ARRAY['CURRENT_DEC', 'LOSS_RUNS', 'WC_MOD_PAYROLL']),
  ('umbrella', 'Umbrella / Excess', ARRAY['CURRENT_DEC', 'LOSS_RUNS']),
  ('bop', 'Business Owners Policy', ARRAY['CURRENT_DEC', 'LOSS_RUNS', 'PROPERTY_SOV']),
  ('home', 'Homeowners', ARRAY['CURRENT_DEC', 'RENEWAL_DEC', 'PHOTOS']),
  ('professional', 'Professional Liability / E&O', ARRAY['CURRENT_DEC', 'LOSS_RUNS', 'ACORD_125'])
ON CONFLICT (lob_key) DO UPDATE SET
  lob_display_name = EXCLUDED.lob_display_name,
  suggested_doc_types = EXCLUDED.suggested_doc_types;

-- ============================================================================
-- 5. UPDATE COLLECTION_REQUIREMENTS TO USE DOC_TYPE_KEY
-- ============================================================================

-- Update the doc_type column to be more permissive and reference the taxonomy
ALTER TABLE public.collection_requirements 
  DROP CONSTRAINT IF EXISTS collection_requirements_doc_type_check;

-- Add reference column (keeping doc_type for backwards compatibility)
ALTER TABLE public.collection_requirements
  ADD COLUMN IF NOT EXISTS doc_type_definition_id UUID REFERENCES document_type_definitions(id);

-- ============================================================================
-- 6. HELPER FUNCTIONS
-- ============================================================================

-- Get document type definition by key
CREATE OR REPLACE FUNCTION public.get_doc_type_definition(p_doc_type_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', id,
    'doc_type_key', doc_type_key,
    'display_name', display_name,
    'short_description', short_description,
    'upload_instructions', upload_instructions,
    'accepted_file_types', accepted_file_types,
    'min_quantity', min_quantity,
    'max_quantity', max_quantity,
    'validation_hints', validation_hints,
    'acord_links', acord_links,
    'tags', tags
  ) INTO v_result
  FROM document_type_definitions
  WHERE doc_type_key = p_doc_type_key
    AND is_active = TRUE;
  
  RETURN v_result;
END;
$$;

-- Get suggested doc types for a LOB
CREATE OR REPLACE FUNCTION public.get_lob_suggested_docs(p_lob_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_doc_types TEXT[];
  v_result JSONB;
BEGIN
  SELECT suggested_doc_types INTO v_doc_types
  FROM lob_document_suggestions
  WHERE lob_key = p_lob_key;
  
  IF v_doc_types IS NULL THEN
    RETURN '[]'::JSONB;
  END IF;
  
  SELECT jsonb_agg(
    jsonb_build_object(
      'doc_type_key', doc_type_key,
      'display_name', display_name,
      'short_description', short_description,
      'upload_instructions', upload_instructions,
      'accepted_file_types', accepted_file_types,
      'min_quantity', min_quantity,
      'max_quantity', max_quantity
    ) ORDER BY display_order
  ) INTO v_result
  FROM document_type_definitions
  WHERE doc_type_key = ANY(v_doc_types)
    AND is_active = TRUE;
  
  RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;

-- Get all active document types
CREATE OR REPLACE FUNCTION public.get_all_doc_types()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'doc_type_key', doc_type_key,
      'display_name', display_name,
      'short_description', short_description,
      'upload_instructions', upload_instructions,
      'accepted_file_types', accepted_file_types,
      'min_quantity', min_quantity,
      'max_quantity', max_quantity,
      'tags', tags,
      'lob_relevance', lob_relevance
    ) ORDER BY display_order
  ) INTO v_result
  FROM document_type_definitions
  WHERE is_active = TRUE;
  
  RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;

-- ============================================================================
-- 7. RLS + GRANTS
-- ============================================================================

ALTER TABLE document_type_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lob_document_suggestions ENABLE ROW LEVEL SECURITY;

-- Everyone can read doc type definitions
DROP POLICY IF EXISTS "anyone_can_read_doc_types" ON document_type_definitions;
CREATE POLICY "anyone_can_read_doc_types" ON document_type_definitions
  FOR SELECT USING (TRUE);

-- Only authenticated can modify (for admin)
DROP POLICY IF EXISTS "authenticated_can_manage_doc_types" ON document_type_definitions;
CREATE POLICY "authenticated_can_manage_doc_types" ON document_type_definitions
  FOR ALL USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "anyone_can_read_lob_suggestions" ON lob_document_suggestions;
CREATE POLICY "anyone_can_read_lob_suggestions" ON lob_document_suggestions
  FOR SELECT USING (TRUE);

GRANT SELECT ON document_type_definitions TO anon, authenticated;
GRANT ALL ON document_type_definitions TO authenticated;
GRANT SELECT ON lob_document_suggestions TO anon, authenticated;

GRANT EXECUTE ON FUNCTION get_doc_type_definition TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_lob_suggested_docs TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_all_doc_types TO anon, authenticated;

