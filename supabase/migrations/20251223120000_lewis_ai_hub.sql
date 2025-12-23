-- ============================================================================
-- Lewis AI Hub - Unified Document Intelligence Platform
-- ============================================================================
-- Creates configurable AI modules stored in database, execution tracking,
-- and seeds default modules for Quote Comparison, Certificate Review, etc.
-- ============================================================================

-- ============================================================================
-- AI MODULES TABLE - Configuration for all AI modules/widgets
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Display info
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'FileText',
  color TEXT DEFAULT 'blue',
  
  -- Module configuration
  system_prompt TEXT NOT NULL,
  input_config JSONB NOT NULL DEFAULT '{}',
  output_config JSONB NOT NULL DEFAULT '{}',
  
  -- Categorization
  category TEXT DEFAULT 'analysis',
  
  -- Access control
  is_system BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  required_role TEXT DEFAULT 'staff',
  
  -- Usage tracking
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  
  -- Metadata
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_modules_slug ON public.ai_modules(slug);
CREATE INDEX IF NOT EXISTS idx_ai_modules_category ON public.ai_modules(category);
CREATE INDEX IF NOT EXISTS idx_ai_modules_active ON public.ai_modules(is_active) WHERE is_active = true;

-- Comments
COMMENT ON TABLE public.ai_modules IS 'Configuration table for all AI modules/widgets in Lewis AI Hub';
COMMENT ON COLUMN public.ai_modules.slug IS 'URL-friendly identifier like quote-comparison';
COMMENT ON COLUMN public.ai_modules.system_prompt IS 'The AI instruction prompt for this module';
COMMENT ON COLUMN public.ai_modules.input_config IS 'JSON config: min_documents, max_documents, document_labels, additional_fields, allow_text_input';
COMMENT ON COLUMN public.ai_modules.output_config IS 'JSON config: format (structured/markdown/chat), sections, show_email_draft, show_download_report';
COMMENT ON COLUMN public.ai_modules.is_system IS 'True = built-in module that cannot be deleted by users';

-- ============================================================================
-- AI MODULE EXECUTIONS TABLE - Track all AI module runs for audit/history
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_module_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES public.ai_modules(id) ON DELETE CASCADE,
  module_slug TEXT NOT NULL,
  
  -- Context linking
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  policy_id UUID REFERENCES public.policies(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  
  -- Input
  document_ids UUID[] DEFAULT '{}',
  input_text TEXT,
  input_config JSONB,
  
  -- Output
  status TEXT NOT NULL DEFAULT 'pending',
  result JSONB,
  result_summary TEXT,
  error_message TEXT,
  
  -- Deliverables
  email_draft_subject TEXT,
  email_draft_body TEXT,
  report_html TEXT,
  
  -- Performance
  processing_time_ms INTEGER,
  tokens_used INTEGER,
  
  -- Metadata
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  -- Status constraint
  CONSTRAINT ai_module_executions_status_check CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_executions_module ON public.ai_module_executions(module_id);
CREATE INDEX IF NOT EXISTS idx_ai_executions_module_slug ON public.ai_module_executions(module_slug);
CREATE INDEX IF NOT EXISTS idx_ai_executions_account ON public.ai_module_executions(account_id);
CREATE INDEX IF NOT EXISTS idx_ai_executions_lead ON public.ai_module_executions(lead_id);
CREATE INDEX IF NOT EXISTS idx_ai_executions_policy ON public.ai_module_executions(policy_id);
CREATE INDEX IF NOT EXISTS idx_ai_executions_created ON public.ai_module_executions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_executions_user ON public.ai_module_executions(created_by);
CREATE INDEX IF NOT EXISTS idx_ai_executions_status ON public.ai_module_executions(status);

-- Comments
COMMENT ON TABLE public.ai_module_executions IS 'Audit trail of every AI module execution for history and analytics';
COMMENT ON COLUMN public.ai_module_executions.module_slug IS 'Denormalized for easier querying without joins';
COMMENT ON COLUMN public.ai_module_executions.document_ids IS 'Array of document UUIDs used in this execution';
COMMENT ON COLUMN public.ai_module_executions.result IS 'Full structured result from AI analysis';
COMMENT ON COLUMN public.ai_module_executions.result_summary IS 'Short summary for display in lists';

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.ai_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_module_executions ENABLE ROW LEVEL SECURITY;

-- AI Modules RLS Policies
DROP POLICY IF EXISTS "All authenticated users can view active modules" ON public.ai_modules;
CREATE POLICY "All authenticated users can view active modules"
  ON public.ai_modules FOR SELECT
  TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage modules" ON public.ai_modules;
CREATE POLICY "Admins can manage modules"
  ON public.ai_modules FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'owner')
    )
  );

-- AI Module Executions RLS Policies
DROP POLICY IF EXISTS "Users can view their own executions" ON public.ai_module_executions;
CREATE POLICY "Users can view their own executions"
  ON public.ai_module_executions FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "Users can create executions" ON public.ai_module_executions;
CREATE POLICY "Users can create executions"
  ON public.ai_module_executions FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Users can update their own executions" ON public.ai_module_executions;
CREATE POLICY "Users can update their own executions"
  ON public.ai_module_executions FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid());

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_ai_modules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ai_modules_updated_at ON public.ai_modules;
CREATE TRIGGER ai_modules_updated_at
  BEFORE UPDATE ON public.ai_modules
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_modules_updated_at();

-- ============================================================================
-- SEED DEFAULT MODULES
-- ============================================================================

INSERT INTO public.ai_modules (slug, name, description, icon, color, category, system_prompt, input_config, output_config, is_system) VALUES

-- Quote Comparison
('quote-comparison', 'Quote Comparison', 'Compare coverage details between multiple quote or policy options', 'Scale', 'blue', 'analysis',
'You are an insurance document analyst. Compare the uploaded insurance documents and provide:
1. Premium comparison with dollar and percentage differences
2. Coverage comparison table showing each coverage type, limits, and which option is better
3. Deductible comparison
4. Coverage gaps - what''s in one but not the other
5. Clear recommendation based on price vs coverage tradeoffs

Format your output as JSON with these sections:
{
  "premium_comparison": { "option1": {...}, "option2": {...}, "savings": {...} },
  "coverage_table": [{ "coverage": "...", "option1": "...", "option2": "...", "winner": "..." }],
  "deductibles": [...],
  "gaps": ["..."],
  "recommendation": "...",
  "email_draft": { "subject": "...", "body": "..." }
}',
'{"min_documents": 2, "max_documents": 5, "document_labels": ["Current Policy", "Quote Option"], "allow_text_input": true, "input_placeholder": "Any specific areas to focus on? (e.g., liability limits, deductibles)"}',
'{"format": "structured", "sections": ["premium_comparison", "coverage_table", "gaps", "recommendation"], "show_email_draft": true, "show_download_report": true}',
true),

-- Explore a Policy
('explore-policy', 'Explore a Policy', 'Ask Lewi to answer questions about a policy, quote, binder, or other document', 'Search', 'purple', 'analysis',
'You are an insurance document expert. The user has uploaded an insurance document and wants to ask questions about it. 
Answer questions clearly and accurately based on the document content.
If information is not in the document, say so clearly.
Cite specific sections, pages, or policy numbers when possible.
Be conversational but professional.',
'{"min_documents": 1, "max_documents": 1, "allow_text_input": true, "input_placeholder": "What would you like to know about this document?", "is_conversational": true}',
'{"format": "chat", "show_sources": true}',
true),

-- Certificate Review
('certificate-review', 'Certificate Review', 'Review a certificate for correctness, discrepancies, and E&O exposure', 'FileCheck', 'green', 'review',
'You are an insurance E&O (Errors & Omissions) specialist reviewing a Certificate of Insurance. Analyze the certificate and identify:
1. Missing or incomplete information
2. Coverage limit adequacy issues
3. Named insured discrepancies
4. Additional insured issues
5. Date/term problems
6. Any potential E&O exposure for the agency

Rate overall risk: Low, Medium, High, or Critical.
Provide specific recommendations to resolve each issue.

Format your output as JSON:
{
  "risk_rating": "Low|Medium|High|Critical",
  "risk_score": 0-100,
  "issues": [{ "category": "...", "severity": "...", "description": "...", "recommendation": "..." }],
  "checklist": [{ "item": "...", "status": "pass|fail|warning", "notes": "..." }],
  "summary": "...",
  "recommendations": ["..."]
}',
'{"min_documents": 1, "max_documents": 1, "additional_fields": [{"name": "certificate_holder", "type": "text", "label": "Certificate Holder Name (if known)", "required": false}]}',
'{"format": "structured", "sections": ["risk_rating", "issues", "checklist", "recommendations"], "show_checklist": true}',
true),

-- Contract Review
('contract-review', 'Contract Review', 'Review a contract for insurance requirements and compare to quote or policy details', 'FileSearch', 'orange', 'review',
'You are an insurance requirements analyst. Review the uploaded contract and:
1. Extract all insurance requirements (liability limits, coverage types, additional insured requirements, waiver of subrogation, etc.)
2. If a policy/quote is also uploaded, compare requirements to actual coverage
3. Identify any gaps where policy doesn''t meet contract requirements
4. Flag any unusual or problematic requirements
5. Provide recommendations

Format your output as JSON:
{
  "requirements": [{ "type": "...", "requirement": "...", "limit": "...", "notes": "..." }],
  "compliance_matrix": [{ "requirement": "...", "policy_coverage": "...", "status": "compliant|gap|partial", "notes": "..." }],
  "gaps": [{ "requirement": "...", "issue": "...", "recommendation": "..." }],
  "unusual_terms": ["..."],
  "recommendations": ["..."],
  "summary": "..."
}',
'{"min_documents": 1, "max_documents": 2, "document_labels": ["Contract", "Policy/Quote (optional)"]}',
'{"format": "structured", "sections": ["requirements", "compliance_matrix", "gaps", "recommendations"]}',
true),

-- Create Quote Proposal
('quote-proposal', 'Create Quote Proposal', 'Create a quote proposal for a customer from one or more quote documents', 'FileText', 'teal', 'generation',
'You are creating a professional insurance quote proposal for a customer. Using the uploaded quote document(s):
1. Extract key information: carrier, coverages, limits, deductibles, premium
2. Create a clean, professional proposal document
3. Highlight key coverages and benefits
4. Include any relevant disclaimers

Format your output as JSON:
{
  "proposal_html": "<html>...</html>",
  "carrier": "...",
  "premium": { "annual": ..., "monthly": ... },
  "coverages": [{ "name": "...", "limit": "...", "deductible": "..." }],
  "highlights": ["..."],
  "email_draft": { "subject": "...", "body": "..." }
}',
'{"min_documents": 1, "max_documents": 3, "additional_fields": [{"name": "customer_name", "type": "text", "label": "Customer Name", "required": true}, {"name": "greeting_style", "type": "select", "label": "Tone", "options": ["Formal", "Friendly", "Brief"], "default": "Friendly"}]}',
'{"format": "html", "show_email_draft": true, "show_download_report": true}',
true),

-- Policy Summary
('policy-summary', 'Policy Summary', 'Generate a quick summary of key policy details', 'FileDigit', 'indigo', 'extraction',
'Extract and summarize the key information from this insurance policy document:
1. Named Insured
2. Policy Number
3. Carrier
4. Policy Period (effective and expiration dates)
5. All coverages with limits and deductibles
6. Premium breakdown
7. Any notable exclusions or endorsements

Format your output as JSON:
{
  "basic_info": {
    "named_insured": "...",
    "policy_number": "...",
    "carrier": "...",
    "effective_date": "...",
    "expiration_date": "...",
    "policy_type": "..."
  },
  "coverages": [{ "name": "...", "limit": "...", "deductible": "...", "premium": "..." }],
  "premium": { "total": ..., "breakdown": {...} },
  "endorsements": ["..."],
  "exclusions": ["..."],
  "notes": ["..."]
}',
'{"min_documents": 1, "max_documents": 1}',
'{"format": "structured", "sections": ["basic_info", "coverages", "premium", "notes"]}',
true),

-- Document Intelligence (general)
('document-intelligence', 'Document Intelligence', 'Enhanced OCR + AI analysis for any insurance document', 'Brain', 'slate', 'analysis',
'You are a general insurance document intelligence assistant. Analyze the uploaded document and provide relevant insights based on the document type.

For policies: Extract key terms, coverages, and important dates.
For claims: Summarize the claim details and status.
For applications: Identify key risk factors and underwriting concerns.
For certificates: Verify completeness and accuracy.
For contracts: Extract insurance requirements.

Format your response as JSON with these sections:
{
  "document_type": "...",
  "summary": "...",
  "key_details": {...},
  "insights": ["..."],
  "action_items": ["..."],
  "confidence_score": 0-100
}',
'{"min_documents": 1, "max_documents": 10, "allow_text_input": true, "input_placeholder": "What would you like to know about these documents?"}',
'{"format": "structured", "sections": ["summary", "key_details", "insights", "action_items"]}',
true)

ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  category = EXCLUDED.category,
  system_prompt = EXCLUDED.system_prompt,
  input_config = EXCLUDED.input_config,
  output_config = EXCLUDED.output_config,
  is_system = EXCLUDED.is_system,
  updated_at = NOW();

-- ============================================================================
-- HELPER FUNCTION: Get module execution summary
-- ============================================================================

CREATE OR REPLACE FUNCTION get_ai_module_stats(p_days INTEGER DEFAULT 30)
RETURNS TABLE (
  module_slug TEXT,
  module_name TEXT,
  execution_count BIGINT,
  avg_processing_time_ms NUMERIC,
  success_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.slug,
    m.name,
    COUNT(e.id)::BIGINT as execution_count,
    AVG(e.processing_time_ms)::NUMERIC as avg_processing_time_ms,
    (COUNT(CASE WHEN e.status = 'completed' THEN 1 END)::NUMERIC / NULLIF(COUNT(e.id), 0) * 100)::NUMERIC as success_rate
  FROM public.ai_modules m
  LEFT JOIN public.ai_module_executions e ON e.module_id = m.id
    AND e.created_at >= NOW() - (p_days || ' days')::INTERVAL
  WHERE m.is_active = true
  GROUP BY m.slug, m.name
  ORDER BY execution_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_ai_module_stats(INTEGER) TO authenticated;

-- ============================================================================
-- DONE
-- ============================================================================

