-- Migration: Add Knowledge Base Version History
-- Description: Track changes to knowledge entries for audit and rollback
-- Date: 2024-12-03
-- Author: Claude CEO Co-Pilot

-- =============================================================================
-- PART 1: Add version tracking columns to knowledge_base table
-- =============================================================================

-- Add version and change tracking columns
ALTER TABLE public.knowledge_base
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS previous_version_id UUID REFERENCES public.knowledge_base(id),
ADD COLUMN IF NOT EXISTS is_current_version BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS change_summary TEXT,
ADD COLUMN IF NOT EXISTS edited_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.knowledge_base.version IS 'Version number of this knowledge entry';
COMMENT ON COLUMN public.knowledge_base.previous_version_id IS 'ID of the previous version (for version chain)';
COMMENT ON COLUMN public.knowledge_base.is_current_version IS 'Whether this is the current active version';
COMMENT ON COLUMN public.knowledge_base.change_summary IS 'Summary of what changed in this version';
COMMENT ON COLUMN public.knowledge_base.edited_by IS 'User who made this edit';

-- =============================================================================
-- PART 2: Create knowledge_base_history table for detailed change tracking
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.knowledge_base_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Knowledge entry reference
  knowledge_id UUID NOT NULL REFERENCES public.knowledge_base(id) ON DELETE CASCADE,

  -- Version info
  version INTEGER NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('created', 'updated', 'deleted', 'restored')),

  -- Changes captured
  field_changes JSONB DEFAULT '{}'::jsonb, -- Stores before/after for each field
  change_summary TEXT,

  -- Snapshot of entry at this version
  title_snapshot TEXT,
  content_snapshot TEXT,
  category_snapshot TEXT,
  tags_snapshot TEXT[],

  -- User who made the change
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Additional metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.knowledge_base_history IS 'Version history and audit trail for knowledge base entries';
COMMENT ON COLUMN public.knowledge_base_history.field_changes IS 'JSON object showing before/after values for each changed field';

-- =============================================================================
-- PART 3: Create function to track knowledge changes
-- =============================================================================

CREATE OR REPLACE FUNCTION public.track_knowledge_change()
RETURNS TRIGGER AS $$
DECLARE
  v_field_changes JSONB := '{}'::jsonb;
  v_change_type TEXT;
BEGIN
  -- Determine change type
  IF TG_OP = 'INSERT' THEN
    v_change_type := 'created';
  ELSIF TG_OP = 'UPDATE' THEN
    v_change_type := 'updated';
  ELSIF TG_OP = 'DELETE' THEN
    v_change_type := 'deleted';
  END IF;

  -- Build field changes JSON for UPDATE operations
  IF TG_OP = 'UPDATE' THEN
    IF OLD.title IS DISTINCT FROM NEW.title THEN
      v_field_changes := jsonb_set(v_field_changes, '{title}',
        jsonb_build_object('before', OLD.title, 'after', NEW.title));
    END IF;

    IF OLD.content IS DISTINCT FROM NEW.content THEN
      v_field_changes := jsonb_set(v_field_changes, '{content}',
        jsonb_build_object('before', OLD.content, 'after', NEW.content));
    END IF;

    IF OLD.category IS DISTINCT FROM NEW.category THEN
      v_field_changes := jsonb_set(v_field_changes, '{category}',
        jsonb_build_object('before', OLD.category, 'after', NEW.category));
    END IF;

    IF OLD.tags::TEXT IS DISTINCT FROM NEW.tags::TEXT THEN
      v_field_changes := jsonb_set(v_field_changes, '{tags}',
        jsonb_build_object('before', to_jsonb(OLD.tags), 'after', to_jsonb(NEW.tags)));
    END IF;
  END IF;

  -- Insert history record
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.knowledge_base_history (
      knowledge_id,
      version,
      change_type,
      field_changes,
      change_summary,
      title_snapshot,
      content_snapshot,
      category_snapshot,
      tags_snapshot,
      changed_by
    ) VALUES (
      OLD.id,
      COALESCE(OLD.version, 1),
      v_change_type,
      v_field_changes,
      'Entry deleted',
      OLD.title,
      OLD.content,
      OLD.category,
      OLD.tags,
      auth.uid()
    );
    RETURN OLD;
  ELSE
    INSERT INTO public.knowledge_base_history (
      knowledge_id,
      version,
      change_type,
      field_changes,
      change_summary,
      title_snapshot,
      content_snapshot,
      category_snapshot,
      tags_snapshot,
      changed_by
    ) VALUES (
      NEW.id,
      COALESCE(NEW.version, 1),
      v_change_type,
      v_field_changes,
      NEW.change_summary,
      NEW.title,
      NEW.content,
      NEW.category,
      NEW.tags,
      NEW.edited_by
    );
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- PART 4: Create trigger for automatic history tracking
-- =============================================================================

DROP TRIGGER IF EXISTS knowledge_base_history_trigger ON public.knowledge_base;

CREATE TRIGGER knowledge_base_history_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.knowledge_base
  FOR EACH ROW
  EXECUTE FUNCTION public.track_knowledge_change();

-- =============================================================================
-- PART 5: Create function to revert to previous version
-- =============================================================================

CREATE OR REPLACE FUNCTION public.revert_knowledge_to_version(
  p_knowledge_id UUID,
  p_version INTEGER
)
RETURNS UUID AS $$
DECLARE
  v_history_record RECORD;
  v_new_version INTEGER;
BEGIN
  -- Get the historical version
  SELECT * INTO v_history_record
  FROM public.knowledge_base_history
  WHERE knowledge_id = p_knowledge_id
    AND version = p_version
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Version % not found for knowledge entry %', p_version, p_knowledge_id;
  END IF;

  -- Get current max version
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_new_version
  FROM public.knowledge_base_history
  WHERE knowledge_id = p_knowledge_id;

  -- Update the knowledge entry with historical data
  UPDATE public.knowledge_base
  SET
    title = v_history_record.title_snapshot,
    content = v_history_record.content_snapshot,
    category = v_history_record.category_snapshot,
    tags = v_history_record.tags_snapshot,
    version = v_new_version,
    change_summary = 'Reverted to version ' || p_version,
    edited_by = auth.uid(),
    edited_at = NOW(),
    updated_at = NOW()
  WHERE id = p_knowledge_id;

  RETURN p_knowledge_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.revert_knowledge_to_version IS 'Revert a knowledge entry to a previous version';

-- =============================================================================
-- PART 6: Create indexes for performance
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_knowledge_base_version
  ON public.knowledge_base(id, version);

CREATE INDEX IF NOT EXISTS idx_knowledge_base_current_version
  ON public.knowledge_base(is_current_version)
  WHERE is_current_version = true;

CREATE INDEX IF NOT EXISTS idx_knowledge_base_history_knowledge
  ON public.knowledge_base_history(knowledge_id, version DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_base_history_changed_by
  ON public.knowledge_base_history(changed_by);

CREATE INDEX IF NOT EXISTS idx_knowledge_base_history_change_type
  ON public.knowledge_base_history(change_type);

CREATE INDEX IF NOT EXISTS idx_knowledge_base_history_changed_at
  ON public.knowledge_base_history(changed_at DESC);

-- =============================================================================
-- PART 7: Create view for knowledge with change statistics
-- =============================================================================

CREATE OR REPLACE VIEW public.knowledge_base_with_stats AS
SELECT
  kb.*,
  (
    SELECT COUNT(*)
    FROM public.knowledge_base_history
    WHERE knowledge_id = kb.id
  ) AS total_revisions,
  (
    SELECT changed_at
    FROM public.knowledge_base_history
    WHERE knowledge_id = kb.id
    ORDER BY changed_at DESC
    LIMIT 1
  ) AS last_modified_at,
  (
    SELECT u.email
    FROM public.knowledge_base_history h
    LEFT JOIN auth.users u ON u.id = h.changed_by
    WHERE h.knowledge_id = kb.id
    ORDER BY h.changed_at DESC
    LIMIT 1
  ) AS last_modified_by_email
FROM public.knowledge_base kb
WHERE kb.is_current_version = true;

COMMENT ON VIEW public.knowledge_base_with_stats IS 'Knowledge base entries with revision statistics';

-- =============================================================================
-- PART 8: Row Level Security for history table
-- =============================================================================

ALTER TABLE public.knowledge_base_history ENABLE ROW LEVEL SECURITY;

-- Users can view history for knowledge they can access
CREATE POLICY "Users can view knowledge history"
  ON public.knowledge_base_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'staff')
    )
  );

-- Only authenticated users can view their own changes
CREATE POLICY "Users can view their own changes"
  ON public.knowledge_base_history FOR SELECT
  USING (auth.uid() = changed_by);

-- =============================================================================
-- PART 9: Grant permissions
-- =============================================================================

GRANT SELECT ON public.knowledge_base_history TO authenticated;
GRANT SELECT ON public.knowledge_base_with_stats TO authenticated;
GRANT EXECUTE ON FUNCTION public.revert_knowledge_to_version TO authenticated;

-- =============================================================================
-- Migration Complete
-- =============================================================================

-- Summary of changes:
-- 1. Added version tracking columns to knowledge_base table
-- 2. Created knowledge_base_history table for detailed audit trail
-- 3. Added automatic change tracking trigger
-- 4. Created revert function for rollback capability
-- 5. Added comprehensive indexes
-- 6. Created view with revision statistics
-- 7. Implemented Row Level Security
-- 8. All changes are additive and backward compatible
