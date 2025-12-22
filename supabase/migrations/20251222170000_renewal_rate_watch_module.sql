-- ============================================================================
-- RENEWAL RATE WATCH MODULE
-- Multi-carrier quote comparison for renewal premium shock
-- Aligned with existing workspace/comparison architecture
-- ============================================================================

-- ============================================================================
-- 1. EXTEND WORKSPACES WITH TASK TYPE
-- ============================================================================

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS task_type TEXT DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS policy_id UUID REFERENCES public.policies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ao_renewal_id UUID REFERENCES public.ao_renewals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'ready', 'reviewed', 'sent', 'archived')),
  ADD COLUMN IF NOT EXISTS lob TEXT, -- Personal Auto, Home, Package, etc.
  ADD COLUMN IF NOT EXISTS recommendation_status TEXT CHECK (recommendation_status IN ('pending', 'switch_recommended', 'stay_recommended', 'options_presented', 'no_better_option')),
  ADD COLUMN IF NOT EXISTS recommendation_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_workspaces_task_type ON public.workspaces(task_type);
CREATE INDEX IF NOT EXISTS idx_workspaces_ao_renewal ON public.workspaces(ao_renewal_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_account ON public.workspaces(account_id);

-- ============================================================================
-- 2. EXTEND WORKSPACE_DOCUMENTS WITH RENEWAL ROLES
-- ============================================================================

-- Update doc_role constraint to include renewal-specific roles
ALTER TABLE public.workspace_documents 
  DROP CONSTRAINT IF EXISTS workspace_documents_doc_role_check;

ALTER TABLE public.workspace_documents
  ADD CONSTRAINT workspace_documents_doc_role_check 
  CHECK (doc_role IN ('A', 'B', 'reference', 'CURRENT', 'RENEWAL', 'QUOTE'));

-- Add carrier and bundle grouping for quote documents
ALTER TABLE public.workspace_documents
  ADD COLUMN IF NOT EXISTS carrier_name TEXT,
  ADD COLUMN IF NOT EXISTS bundle_id UUID;

CREATE INDEX IF NOT EXISTS idx_workspace_docs_carrier ON workspace_documents(carrier_name);
CREATE INDEX IF NOT EXISTS idx_workspace_docs_bundle ON workspace_documents(bundle_id);

-- ============================================================================
-- 3. BUNDLE SNAPSHOTS
-- Merged snapshots per document bundle (CURRENT, RENEWAL, or QUOTE-per-carrier)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.bundle_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Bundle identification
  bundle_role TEXT NOT NULL CHECK (bundle_role IN ('CURRENT', 'RENEWAL', 'QUOTE')),
  carrier_name TEXT, -- Required for QUOTE bundles
  bundle_id UUID, -- Groups multiple docs into one bundle
  
  -- Source document IDs in this bundle
  document_ids UUID[] NOT NULL DEFAULT '{}',
  
  -- Merged normalized snapshot (PolicySnapshot schema)
  snapshot_json JSONB NOT NULL DEFAULT '{}',
  
  -- Evidence references for each field
  field_evidence JSONB NOT NULL DEFAULT '{}', -- Record<fieldName, {value, evidence_ids[], confidence}>
  
  -- Conflicts detected during merge
  merge_conflicts JSONB DEFAULT '[]',
  
  -- Extraction stats
  fields_extracted INTEGER DEFAULT 0,
  fields_with_evidence INTEGER DEFAULT 0,
  fields_with_conflicts INTEGER DEFAULT 0,
  overall_confidence REAL,
  
  -- Premium breakdown (denormalized for quick access)
  term_premium NUMERIC(10,2),
  annual_premium NUMERIC(10,2),
  monthly_premium NUMERIC(10,2),
  fees NUMERIC(10,2),
  
  -- Key dates
  effective_date DATE,
  expiration_date DATE,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'error')),
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(workspace_id, bundle_role, COALESCE(carrier_name, ''))
);

CREATE INDEX IF NOT EXISTS idx_bundle_snapshots_workspace ON bundle_snapshots(workspace_id);
CREATE INDEX IF NOT EXISTS idx_bundle_snapshots_role ON bundle_snapshots(bundle_role);

-- ============================================================================
-- 4. RENEWAL COMPARISON RESULTS
-- Deterministic comparison between bundles
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.renewal_comparison_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Reference bundles
  current_bundle_id UUID REFERENCES bundle_snapshots(id),
  renewal_bundle_id UUID REFERENCES bundle_snapshots(id),
  
  -- Renewal increase metrics
  current_term_premium NUMERIC(10,2),
  renewal_term_premium NUMERIC(10,2),
  renewal_increase_amount NUMERIC(10,2),
  renewal_increase_percent NUMERIC(5,2),
  
  -- Premium breakdown changes (if extractable)
  base_premium_change NUMERIC(10,2),
  fee_change NUMERIC(10,2),
  coverage_change_impact NUMERIC(10,2),
  
  -- Coverage changes detected
  coverage_changes JSONB DEFAULT '[]', -- [{field, current_value, renewal_value, change_type, impact}]
  
  -- Quote comparisons
  quote_comparisons JSONB DEFAULT '[]', -- [{carrier, bundle_id, term_premium, savings_vs_renewal, parity_score, critical_differences, recommendation}]
  
  -- Best alternative found
  best_alternative_carrier TEXT,
  best_alternative_savings NUMERIC(10,2),
  best_alternative_parity_score REAL,
  
  -- Recommendation
  recommendation_type TEXT CHECK (recommendation_type IN ('switch', 'stay', 'review_options', 'insufficient_data')),
  recommendation_reason TEXT,
  recommendation_confidence REAL,
  
  -- Items needing verification
  items_needing_verification JSONB DEFAULT '[]', -- [{ field, reason, current_value, suggested_action }]
  
  -- Computed at
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_comparison_results_workspace ON renewal_comparison_results(workspace_id);

-- ============================================================================
-- 5. REPORT ARTIFACTS
-- Generated PDF/HTML reports
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.renewal_report_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  comparison_result_id UUID REFERENCES renewal_comparison_results(id) ON DELETE SET NULL,
  
  -- Report type
  artifact_type TEXT NOT NULL CHECK (artifact_type IN ('summary_pdf', 'summary_html', 'full_report_pdf', 'internal_appendix')),
  
  -- Storage
  storage_path TEXT,
  storage_bucket TEXT DEFAULT 'reports',
  file_size_bytes INTEGER,
  
  -- Content (for HTML/inline)
  content_html TEXT,
  
  -- Metadata
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  generated_by UUID REFERENCES auth.users(id),
  
  -- Version tracking
  version INTEGER DEFAULT 1,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_artifacts_workspace ON renewal_report_artifacts(workspace_id);

-- ============================================================================
-- 6. EMAIL DRAFTS
-- Client-facing email drafts
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.renewal_email_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  comparison_result_id UUID REFERENCES renewal_comparison_results(id) ON DELETE SET NULL,
  
  -- Email content
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT, -- Plain text version
  
  -- Recipient info (from account)
  to_email TEXT,
  to_name TEXT,
  cc_emails TEXT[],
  
  -- Attachments
  attachment_ids UUID[], -- References to renewal_report_artifacts
  
  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'edited', 'approved', 'sent', 'failed')),
  edited_at TIMESTAMPTZ,
  edited_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),
  sent_at TIMESTAMPTZ,
  
  -- Generation metadata
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  generated_by UUID REFERENCES auth.users(id),
  prompt_version TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_drafts_workspace ON renewal_email_drafts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_email_drafts_status ON renewal_email_drafts(status);

-- ============================================================================
-- 7. LINK AO RENEWALS TO RATE WATCH JOBS
-- ============================================================================

ALTER TABLE public.ao_renewals
  ADD COLUMN IF NOT EXISTS rate_watch_workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS renewal_premium NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS premium_increase_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS premium_increase_percent NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS best_alternative_carrier TEXT,
  ADD COLUMN IF NOT EXISTS best_alternative_premium NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS rate_watch_status TEXT CHECK (rate_watch_status IN ('pending', 'processing', 'ready', 'reviewed', 'actioned'));

CREATE INDEX IF NOT EXISTS idx_ao_renewals_rate_watch ON ao_renewals(rate_watch_workspace_id);

-- ============================================================================
-- 8. RLS POLICIES
-- ============================================================================

ALTER TABLE bundle_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE renewal_comparison_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE renewal_report_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE renewal_email_drafts ENABLE ROW LEVEL SECURITY;

-- Bundle snapshots
DROP POLICY IF EXISTS "Staff can manage bundle snapshots" ON bundle_snapshots;
CREATE POLICY "Staff can manage bundle snapshots" ON bundle_snapshots
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Comparison results
DROP POLICY IF EXISTS "Staff can manage comparison results" ON renewal_comparison_results;
CREATE POLICY "Staff can manage comparison results" ON renewal_comparison_results
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Report artifacts
DROP POLICY IF EXISTS "Staff can manage report artifacts" ON renewal_report_artifacts;
CREATE POLICY "Staff can manage report artifacts" ON renewal_report_artifacts
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Email drafts
DROP POLICY IF EXISTS "Staff can manage email drafts" ON renewal_email_drafts;
CREATE POLICY "Staff can manage email drafts" ON renewal_email_drafts
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ============================================================================
-- 9. HELPER FUNCTIONS
-- ============================================================================

-- Calculate premium increase metrics
CREATE OR REPLACE FUNCTION public.calculate_renewal_metrics(
  p_current_premium NUMERIC,
  p_renewal_premium NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_increase_amount NUMERIC;
  v_increase_percent NUMERIC;
BEGIN
  IF p_current_premium IS NULL OR p_renewal_premium IS NULL THEN
    RETURN jsonb_build_object(
      'increase_amount', NULL,
      'increase_percent', NULL,
      'direction', 'unknown'
    );
  END IF;
  
  v_increase_amount := p_renewal_premium - p_current_premium;
  v_increase_percent := CASE 
    WHEN p_current_premium > 0 THEN ROUND((v_increase_amount / p_current_premium) * 100, 2)
    ELSE NULL
  END;
  
  RETURN jsonb_build_object(
    'increase_amount', v_increase_amount,
    'increase_percent', v_increase_percent,
    'direction', CASE 
      WHEN v_increase_amount > 0 THEN 'increase'
      WHEN v_increase_amount < 0 THEN 'decrease'
      ELSE 'unchanged'
    END
  );
END;
$$;

-- Get all rate watch jobs for an AO renewal
CREATE OR REPLACE FUNCTION public.get_ao_renewal_rate_watch_summary(p_ao_renewal_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'ao_renewal', row_to_json(r),
    'workspace', row_to_json(w),
    'comparison', row_to_json(c),
    'quotes_count', (
      SELECT COUNT(DISTINCT carrier_name) 
      FROM workspace_documents wd 
      WHERE wd.workspace_id = w.id AND wd.doc_role = 'QUOTE'
    ),
    'has_report', EXISTS (SELECT 1 FROM renewal_report_artifacts ra WHERE ra.workspace_id = w.id),
    'has_email', EXISTS (SELECT 1 FROM renewal_email_drafts ed WHERE ed.workspace_id = w.id)
  ) INTO v_result
  FROM ao_renewals r
  LEFT JOIN workspaces w ON w.ao_renewal_id = r.id
  LEFT JOIN renewal_comparison_results c ON c.workspace_id = w.id
  WHERE r.id = p_ao_renewal_id;
  
  RETURN v_result;
END;
$$;

-- ============================================================================
-- 10. GRANTS
-- ============================================================================

GRANT ALL ON bundle_snapshots TO authenticated;
GRANT ALL ON renewal_comparison_results TO authenticated;
GRANT ALL ON renewal_report_artifacts TO authenticated;
GRANT ALL ON renewal_email_drafts TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_renewal_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION get_ao_renewal_rate_watch_summary TO authenticated;

