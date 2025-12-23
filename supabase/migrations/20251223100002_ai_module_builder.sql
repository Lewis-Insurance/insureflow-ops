-- ============================================================
-- AI MODULES & MODULE BUILDER MIGRATION
-- Creates tables for AI module management and builder sessions
-- ============================================================

-- ============================================================
-- AI MODULES TABLE
-- Stores configuration for all AI modules/widgets
-- ============================================================

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
  
  -- Status & Access
  status TEXT DEFAULT 'published' CHECK (status IN ('draft', 'testing', 'published', 'archived')),
  is_system BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  required_role TEXT DEFAULT 'staff',
  
  -- Wizard conversation that created this module
  wizard_conversation JSONB,
  
  -- Versioning
  parent_module_id UUID REFERENCES public.ai_modules(id),
  version INTEGER DEFAULT 1,
  
  -- Publishing
  published_at TIMESTAMPTZ,
  published_by UUID REFERENCES public.profiles(id),
  
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
CREATE INDEX IF NOT EXISTS idx_ai_modules_status ON public.ai_modules(status);
CREATE INDEX IF NOT EXISTS idx_ai_modules_category ON public.ai_modules(category);
CREATE INDEX IF NOT EXISTS idx_ai_modules_created_by ON public.ai_modules(created_by);

-- RLS
ALTER TABLE public.ai_modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view published modules and own drafts" ON public.ai_modules;
CREATE POLICY "Users can view published modules and own drafts"
  ON public.ai_modules FOR SELECT
  USING (status = 'published' OR created_by = auth.uid());

DROP POLICY IF EXISTS "Users can create modules" ON public.ai_modules;
CREATE POLICY "Users can create modules"
  ON public.ai_modules FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can update own modules" ON public.ai_modules;
CREATE POLICY "Users can update own modules"
  ON public.ai_modules FOR UPDATE
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "Users can delete own draft modules" ON public.ai_modules;
CREATE POLICY "Users can delete own draft modules"
  ON public.ai_modules FOR DELETE
  USING (created_by = auth.uid() AND status IN ('draft', 'testing'));

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_ai_modules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_ai_modules_updated_at ON public.ai_modules;
CREATE TRIGGER trigger_ai_modules_updated_at
  BEFORE UPDATE ON public.ai_modules
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_modules_updated_at();

-- ============================================================
-- AI MODULE BUILDER SESSIONS TABLE
-- Tracks wizard conversations for creating/editing modules
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_module_builder_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- The module being created/edited
  module_id UUID REFERENCES public.ai_modules(id) ON DELETE SET NULL,
  
  -- Session type
  session_type TEXT NOT NULL DEFAULT 'create' CHECK (session_type IN ('create', 'improve', 'clone')),
  
  -- Conversation history
  messages JSONB NOT NULL DEFAULT '[]',
  
  -- Generated config (before user edits)
  generated_config JSONB,
  
  -- Final config (what was actually saved)
  final_config JSONB,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'ready_to_test', 'testing', 'completed', 'abandoned')),
  
  -- Metadata
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_builder_sessions_user ON public.ai_module_builder_sessions(created_by);
CREATE INDEX IF NOT EXISTS idx_builder_sessions_module ON public.ai_module_builder_sessions(module_id);
CREATE INDEX IF NOT EXISTS idx_builder_sessions_status ON public.ai_module_builder_sessions(status);

-- RLS
ALTER TABLE public.ai_module_builder_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own builder sessions" ON public.ai_module_builder_sessions;
CREATE POLICY "Users can manage own builder sessions"
  ON public.ai_module_builder_sessions FOR ALL
  USING (created_by = auth.uid());

-- Updated_at trigger
DROP TRIGGER IF EXISTS trigger_builder_sessions_updated_at ON public.ai_module_builder_sessions;
CREATE TRIGGER trigger_builder_sessions_updated_at
  BEFORE UPDATE ON public.ai_module_builder_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_modules_updated_at();

-- ============================================================
-- SEED DEFAULT MODULES
-- ============================================================

INSERT INTO public.ai_modules (slug, name, description, icon, color, category, system_prompt, input_config, output_config, is_system, status)
VALUES 
(
  'quote-comparison',
  'Quote Comparison',
  'Compare coverage details between multiple quote or policy options',
  'Scale',
  'blue',
  'comparison',
  'You are an insurance document analyst. Compare the uploaded insurance documents and provide:
1. Premium comparison with dollar and percentage differences
2. Coverage comparison table showing each coverage type, limits, and which option is better
3. Deductible comparison
4. Coverage gaps - what''s in one but not the other
5. Clear recommendation based on price vs coverage tradeoffs

Format output as structured JSON with sections: premium_comparison, coverage_table, deductibles, gaps, recommendation, email_draft',
  '{"min_documents": 2, "max_documents": 5, "document_labels": ["Current Policy", "Quote Option"], "allow_text_input": true}',
  '{"format": "structured", "sections": ["premium_comparison", "coverage_table", "gaps", "recommendation"], "show_email_draft": true, "show_download_report": true}',
  true,
  'published'
),
(
  'explore-policy',
  'Explore a Policy',
  'Ask questions about a policy, quote, binder, or other document',
  'Search',
  'purple',
  'analysis',
  'You are an insurance document expert. The user has uploaded an insurance document and wants to ask questions about it. Answer questions clearly and accurately based on the document content. If information is not in the document, say so. Cite specific sections or pages when possible.',
  '{"min_documents": 1, "max_documents": 1, "allow_text_input": true, "text_input_placeholder": "What would you like to know about this document?"}',
  '{"format": "chat", "show_sources": true}',
  true,
  'published'
),
(
  'certificate-review',
  'Certificate Review',
  'Review a certificate for correctness, discrepancies, and E&O exposure',
  'FileCheck',
  'green',
  'review',
  'You are an insurance E&O specialist reviewing a Certificate of Insurance. Analyze and identify:
1. Missing or incomplete information
2. Coverage limit adequacy issues
3. Named insured discrepancies
4. Additional insured issues
5. Date/term problems
6. Any potential E&O exposure

Rate overall risk: Low, Medium, High, Critical. Provide specific recommendations.',
  '{"min_documents": 1, "max_documents": 1, "additional_fields": [{"name": "certificate_holder", "type": "text", "label": "Certificate Holder Name (if known)"}]}',
  '{"format": "structured", "sections": ["risk_rating", "issues", "recommendations"], "show_checklist": true}',
  true,
  'published'
),
(
  'policy-summary',
  'Policy Summary',
  'Generate a quick summary of key policy details',
  'FileDigit',
  'indigo',
  'extraction',
  'Extract and summarize the key information from this insurance policy:
1. Named Insured
2. Policy Number
3. Carrier
4. Policy Period
5. All coverages with limits and deductibles
6. Premium breakdown
7. Notable exclusions or endorsements

Format as a clean, scannable summary.',
  '{"min_documents": 1, "max_documents": 1}',
  '{"format": "structured", "sections": ["basic_info", "coverages", "premium", "notes"]}',
  true,
  'published'
)
ON CONFLICT (slug) DO NOTHING;
