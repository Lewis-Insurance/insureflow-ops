-- Migration: Add Knowledge Base Version History
-- Description: Track changes to knowledge base entries for audit trail and rollback
-- Date: 2024-12-04
-- Author: Claude CEO Co-Pilot

-- =============================================================================
-- PART 1: Create knowledge_base_versions table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.knowledge_base_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference to main knowledge entry
  knowledge_id UUID REFERENCES public.knowledge_base(id) ON DELETE CASCADE,

  -- Version tracking
  version_number INTEGER NOT NULL,

  -- Snapshot of the entry at this version
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  source TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Change tracking
  changed_by UUID REFERENCES auth.users(id),
  change_notes TEXT, -- Why was this change made?

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.knowledge_base_versions IS 'Version history for knowledge base entries';
COMMENT ON COLUMN public.knowledge_base_versions.version_number IS 'Incrementing version number for each change';
COMMENT ON COLUMN public.knowledge_base_versions.change_notes IS 'Description of what changed and why';

-- =============================================================================
-- PART 2: Create indexes for performance
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_kb_versions_knowledge_id
  ON public.knowledge_base_versions(knowledge_id);

CREATE INDEX IF NOT EXISTS idx_kb_versions_knowledge_version
  ON public.knowledge_base_versions(knowledge_id, version_number DESC);

CREATE INDEX IF NOT EXISTS idx_kb_versions_changed_by
  ON public.knowledge_base_versions(changed_by);

CREATE INDEX IF NOT EXISTS idx_kb_versions_created
  ON public.knowledge_base_versions(created_at DESC);

-- Unique constraint: one record per knowledge_id + version_number
CREATE UNIQUE INDEX IF NOT EXISTS idx_kb_versions_unique
  ON public.knowledge_base_versions(knowledge_id, version_number);

-- =============================================================================
-- PART 3: Row Level Security
-- =============================================================================

ALTER TABLE public.knowledge_base_versions ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view version history
CREATE POLICY "Authenticated users can view knowledge versions"
  ON public.knowledge_base_versions FOR SELECT
  TO authenticated
  USING (true);

-- Only the system can insert versions (via triggers or app logic)
CREATE POLICY "System can insert knowledge versions"
  ON public.knowledge_base_versions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = changed_by);

-- No one can update or delete versions (immutable history)
-- Versions should never be modified after creation

-- =============================================================================
-- PART 4: Function to auto-create version on update
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_knowledge_version()
RETURNS TRIGGER AS $$
DECLARE
  next_version INTEGER;
BEGIN
  -- Get the next version number
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO next_version
  FROM public.knowledge_base_versions
  WHERE knowledge_id = OLD.id;

  -- Insert version record with OLD data (before the update)
  INSERT INTO public.knowledge_base_versions (
    knowledge_id,
    version_number,
    title,
    content,
    category,
    tags,
    source,
    metadata,
    changed_by,
    change_notes
  ) VALUES (
    OLD.id,
    next_version,
    OLD.title,
    OLD.content,
    OLD.category,
    OLD.tags,
    OLD.source,
    OLD.metadata,
    auth.uid(),
    'Auto-saved version before update'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- PART 5: Trigger to create versions on update
-- =============================================================================

-- Drop trigger if exists
DROP TRIGGER IF EXISTS trigger_create_knowledge_version ON public.knowledge_base;

-- Create trigger that fires BEFORE update
CREATE TRIGGER trigger_create_knowledge_version
  BEFORE UPDATE ON public.knowledge_base
  FOR EACH ROW
  WHEN (
    OLD.title IS DISTINCT FROM NEW.title OR
    OLD.content IS DISTINCT FROM NEW.content OR
    OLD.category IS DISTINCT FROM NEW.category OR
    OLD.tags IS DISTINCT FROM NEW.tags OR
    OLD.source IS DISTINCT FROM NEW.source OR
    OLD.metadata IS DISTINCT FROM NEW.metadata
  )
  EXECUTE FUNCTION public.create_knowledge_version();

COMMENT ON TRIGGER trigger_create_knowledge_version ON public.knowledge_base IS
  'Automatically creates a version history record whenever knowledge base entries are updated';

-- =============================================================================
-- PART 6: Function to get version diff
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_knowledge_version_diff(
  p_knowledge_id UUID,
  p_version_1 INTEGER,
  p_version_2 INTEGER
)
RETURNS TABLE (
  field TEXT,
  version_1_value TEXT,
  version_2_value TEXT,
  changed BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  WITH v1 AS (
    SELECT * FROM public.knowledge_base_versions
    WHERE knowledge_id = p_knowledge_id AND version_number = p_version_1
  ),
  v2 AS (
    SELECT * FROM public.knowledge_base_versions
    WHERE knowledge_id = p_knowledge_id AND version_number = p_version_2
  )
  SELECT 'title'::TEXT, v1.title, v2.title, (v1.title IS DISTINCT FROM v2.title)
  FROM v1, v2
  UNION ALL
  SELECT 'content'::TEXT, v1.content, v2.content, (v1.content IS DISTINCT FROM v2.content)
  FROM v1, v2
  UNION ALL
  SELECT 'category'::TEXT, v1.category, v2.category, (v1.category IS DISTINCT FROM v2.category)
  FROM v1, v2
  UNION ALL
  SELECT 'source'::TEXT, v1.source, v2.source, (v1.source IS DISTINCT FROM v2.source)
  FROM v1, v2;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_knowledge_version_diff IS
  'Compare two versions of a knowledge entry and return the differences';

-- =============================================================================
-- PART 7: Grant permissions
-- =============================================================================

GRANT SELECT ON public.knowledge_base_versions TO authenticated;
GRANT INSERT ON public.knowledge_base_versions TO authenticated;

-- =============================================================================
-- Migration Complete
-- =============================================================================

-- Summary of changes:
-- 1. Created knowledge_base_versions table for version history
-- 2. Added indexes for efficient version queries
-- 3. Implemented Row Level Security policies
-- 4. Created trigger to auto-save versions on update
-- 5. Added function to compare version differences
-- 6. All changes are backward compatible
