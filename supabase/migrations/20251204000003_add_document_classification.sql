-- Migration: Add Document Classification Fields
-- Description: Add classification, routing, and auto-categorization fields to documents table
-- Date: 2024-12-04
-- Author: Claude CEO Co-Pilot

-- =============================================================================
-- PART 1: Add classification columns to documents table
-- =============================================================================

ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS document_type TEXT CHECK (document_type IN (
  'policy', 'quote', 'dec_page', 'endorsement', 'claim_form', 'coi', 'bill',
  'loss_run', 'application', 'renewal', 'cancellation', 'binder', 'certificate',
  'inspection', 'unknown'
)),
ADD COLUMN IF NOT EXISTS line_of_business TEXT CHECK (line_of_business IN (
  'auto', 'home', 'commercial', 'workers_comp', 'general_liability',
  'professional_liability', 'cyber', 'umbrella', 'property', 'unknown'
)),
ADD COLUMN IF NOT EXISTS urgency_level TEXT CHECK (urgency_level IN (
  'immediate', 'high', 'normal', 'low'
)) DEFAULT 'normal',
ADD COLUMN IF NOT EXISTS classification_confidence NUMERIC(5,2) CHECK (
  classification_confidence >= 0 AND classification_confidence <= 100
),
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS extracted_text TEXT,
ADD COLUMN IF NOT EXISTS file_path TEXT, -- Replaces "path" with more explicit name
ADD COLUMN IF NOT EXISTS file_name TEXT, -- Replaces "filename" with consistent naming
ADD COLUMN IF NOT EXISTS classified_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS auto_routed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS routed_to_queue TEXT,
ADD COLUMN IF NOT EXISTS related_entity_type TEXT CHECK (related_entity_type IN (
  'account', 'policy', 'quote', 'claim'
)),
ADD COLUMN IF NOT EXISTS related_entity_id UUID;

COMMENT ON COLUMN public.documents.document_type IS 'AI-classified document type (policy, quote, claim, etc.)';
COMMENT ON COLUMN public.documents.line_of_business IS 'Insurance line of business (auto, home, commercial, etc.)';
COMMENT ON COLUMN public.documents.urgency_level IS 'Processing urgency (immediate, high, normal, low)';
COMMENT ON COLUMN public.documents.classification_confidence IS 'AI confidence score 0-100';
COMMENT ON COLUMN public.documents.tags IS 'Auto-generated and manual tags for categorization';
COMMENT ON COLUMN public.documents.extracted_text IS 'OCR-extracted text content for search and classification';
COMMENT ON COLUMN public.documents.classified_at IS 'When document was auto-classified';
COMMENT ON COLUMN public.documents.auto_routed IS 'Whether document was automatically routed to a queue';
COMMENT ON COLUMN public.documents.routed_to_queue IS 'Queue name document was routed to';
COMMENT ON COLUMN public.documents.related_entity_type IS 'Type of entity this document relates to';
COMMENT ON COLUMN public.documents.related_entity_id IS 'ID of related entity (policy, quote, claim, etc.)';

-- =============================================================================
-- PART 2: Create indexes for classification queries
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_documents_document_type
  ON public.documents(document_type)
  WHERE document_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_line_of_business
  ON public.documents(line_of_business)
  WHERE line_of_business IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_urgency_level
  ON public.documents(urgency_level)
  WHERE urgency_level IN ('immediate', 'high');

CREATE INDEX IF NOT EXISTS idx_documents_unclassified
  ON public.documents(created_at DESC)
  WHERE document_type IS NULL OR document_type = 'unknown';

CREATE INDEX IF NOT EXISTS idx_documents_tags
  ON public.documents USING GIN(tags)
  WHERE tags IS NOT NULL AND array_length(tags, 1) > 0;

CREATE INDEX IF NOT EXISTS idx_documents_auto_routed
  ON public.documents(auto_routed, urgency_level)
  WHERE auto_routed = false AND urgency_level IN ('immediate', 'high');

CREATE INDEX IF NOT EXISTS idx_documents_related_entity
  ON public.documents(related_entity_type, related_entity_id)
  WHERE related_entity_type IS NOT NULL AND related_entity_id IS NOT NULL;

-- =============================================================================
-- PART 3: Create document queues table for routing
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.document_queues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Queue configuration
  queue_name TEXT NOT NULL UNIQUE,
  queue_description TEXT,
  queue_type TEXT NOT NULL CHECK (queue_type IN ('manual', 'auto', 'hybrid')),

  -- Auto-routing rules
  auto_route_rules JSONB DEFAULT '[]'::jsonb,
  -- Example: [
  --   {"document_type": "claim_form", "urgency_level": "immediate"},
  --   {"line_of_business": "workers_comp", "urgency_level": "high"}
  -- ]

  -- Queue settings
  max_queue_size INTEGER,
  assigned_user_ids UUID[] DEFAULT ARRAY[]::UUID[],
  enabled BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0, -- Higher priority queues get documents first

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.document_queues IS 'Document processing queues with auto-routing rules';
COMMENT ON COLUMN public.document_queues.auto_route_rules IS 'JSON rules for automatic document routing';
COMMENT ON COLUMN public.document_queues.priority IS 'Queue priority (higher number = higher priority)';

-- =============================================================================
-- PART 4: Create function to auto-route documents
-- =============================================================================

CREATE OR REPLACE FUNCTION public.auto_route_document(p_document_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_document RECORD;
  v_queue RECORD;
  v_matched_queue TEXT;
BEGIN
  -- Get document classification
  SELECT * INTO v_document
  FROM public.documents
  WHERE id = p_document_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Find matching queue (ordered by priority)
  FOR v_queue IN
    SELECT *
    FROM public.document_queues
    WHERE enabled = true
    ORDER BY priority DESC, created_at ASC
  LOOP
    -- Check if document matches any routing rule
    FOR rule IN SELECT * FROM jsonb_array_elements(v_queue.auto_route_rules) LOOP
      -- Simple rule matching (can be enhanced with more complex logic)
      IF (
        (rule->>'document_type' IS NULL OR rule->>'document_type' = v_document.document_type) AND
        (rule->>'line_of_business' IS NULL OR rule->>'line_of_business' = v_document.line_of_business) AND
        (rule->>'urgency_level' IS NULL OR rule->>'urgency_level' = v_document.urgency_level)
      ) THEN
        v_matched_queue := v_queue.queue_name;
        EXIT; -- Stop at first matching queue
      END IF;
    END LOOP;

    EXIT WHEN v_matched_queue IS NOT NULL;
  END LOOP;

  -- Update document with routing info
  IF v_matched_queue IS NOT NULL THEN
    UPDATE public.documents
    SET
      auto_routed = true,
      routed_to_queue = v_matched_queue,
      updated_at = now()
    WHERE id = p_document_id;
  END IF;

  RETURN v_matched_queue;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.auto_route_document IS 'Automatically route a document to the appropriate queue based on classification';

-- =============================================================================
-- PART 5: Create helper views and functions
-- =============================================================================

-- View for unprocessed high-urgency documents
CREATE OR REPLACE VIEW public.urgent_documents AS
SELECT
  d.*,
  a.name AS account_name
FROM public.documents d
JOIN public.accounts a ON a.id = d.account_id
WHERE
  d.urgency_level IN ('immediate', 'high')
  AND d.auto_routed = false
ORDER BY
  CASE d.urgency_level
    WHEN 'immediate' THEN 1
    WHEN 'high' THEN 2
  END,
  d.created_at ASC;

COMMENT ON VIEW public.urgent_documents IS 'High-priority documents needing immediate attention';

-- Function to get unclassified documents
CREATE OR REPLACE FUNCTION public.get_unclassified_documents(p_limit INTEGER DEFAULT 50)
RETURNS TABLE (
  id UUID,
  account_id UUID,
  file_name TEXT,
  content_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  days_unclassified INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.account_id,
    COALESCE(d.file_name, d.filename) AS file_name,
    d.content_type,
    d.created_at,
    EXTRACT(DAY FROM now() - d.created_at)::INTEGER AS days_unclassified
  FROM public.documents d
  WHERE d.document_type IS NULL OR d.document_type = 'unknown'
  ORDER BY d.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_unclassified_documents IS 'Get documents that need classification';

-- =============================================================================
-- PART 6: Create default document queues
-- =============================================================================

INSERT INTO public.document_queues (queue_name, queue_description, queue_type, auto_route_rules, priority)
VALUES
  ('urgent_review', 'Immediate attention required', 'auto', '[
    {"urgency_level": "immediate"},
    {"document_type": "cancellation"},
    {"document_type": "claim_form", "urgency_level": "high"}
  ]'::jsonb, 100),

  ('renewals', 'Renewal documents and expiring policies', 'auto', '[
    {"document_type": "renewal"},
    {"document_type": "dec_page", "urgency_level": "high"}
  ]'::jsonb, 80),

  ('quotes', 'Quote documents for review', 'auto', '[
    {"document_type": "quote"}
  ]'::jsonb, 60),

  ('claims', 'Claim forms and loss runs', 'auto', '[
    {"document_type": "claim_form"},
    {"document_type": "loss_run"}
  ]'::jsonb, 70),

  ('certificates', 'Certificates of Insurance', 'auto', '[
    {"document_type": "coi"},
    {"document_type": "certificate"}
  ]'::jsonb, 50),

  ('billing', 'Bills and invoices', 'auto', '[
    {"document_type": "bill"}
  ]'::jsonb, 40),

  ('general', 'General document processing', 'hybrid', '[]'::jsonb, 10)
ON CONFLICT (queue_name) DO NOTHING;

-- =============================================================================
-- PART 7: Add trigger for updated_at
-- =============================================================================

CREATE TRIGGER update_document_queues_updated_at
  BEFORE UPDATE ON public.document_queues
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- PART 8: Row Level Security for document_queues
-- =============================================================================

ALTER TABLE public.document_queues ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view queues
CREATE POLICY "Authenticated users can view document queues"
  ON public.document_queues FOR SELECT
  TO authenticated
  USING (true);

-- Staff can manage queues
CREATE POLICY "Staff can manage document queues"
  ON public.document_queues FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'staff')
    )
  );

-- =============================================================================
-- PART 9: Grant permissions
-- =============================================================================

GRANT SELECT ON public.document_queues TO authenticated;
GRANT SELECT ON public.urgent_documents TO authenticated;

-- =============================================================================
-- Migration Complete
-- =============================================================================

-- Summary of changes:
-- 1. Added classification fields to documents table
-- 2. Created document_queues table for auto-routing
-- 3. Created auto_route_document() function
-- 4. Created urgent_documents view
-- 5. Created get_unclassified_documents() function
-- 6. Populated default queues
-- 7. All changes are backward compatible
