-- ============================================================
-- Training Materials Module
-- Gamma deck stacks for staff training
-- ============================================================

-- Training materials table
CREATE TABLE IF NOT EXISTS training_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  gamma_url TEXT NOT NULL,
  embed_url TEXT NOT NULL,
  thumbnail_url TEXT,
  duration_minutes INTEGER,
  difficulty TEXT DEFAULT 'beginner' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  is_required BOOLEAN DEFAULT false,
  view_count INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Training progress tracking
CREATE TABLE IF NOT EXISTS training_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES training_materials(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  last_viewed_at TIMESTAMPTZ DEFAULT now(),
  view_count INTEGER DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, material_id)
);

-- Training categories lookup (optional, for predefined categories)
CREATE TABLE IF NOT EXISTS training_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  color TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, name)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_training_materials_org ON training_materials(org_id);
CREATE INDEX IF NOT EXISTS idx_training_materials_category ON training_materials(category);
CREATE INDEX IF NOT EXISTS idx_training_materials_tags ON training_materials USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_training_materials_active ON training_materials(org_id, is_active);
CREATE INDEX IF NOT EXISTS idx_training_materials_required ON training_materials(org_id, is_required) WHERE is_required = true;

CREATE INDEX IF NOT EXISTS idx_training_progress_user ON training_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_training_progress_material ON training_progress(material_id);
CREATE INDEX IF NOT EXISTS idx_training_progress_completed ON training_progress(user_id) WHERE completed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_training_categories_org ON training_categories(org_id);

-- Enable RLS
ALTER TABLE training_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_categories ENABLE ROW LEVEL SECURITY;

-- RLS Policies for training_materials
CREATE POLICY "training_materials_select" ON training_materials
  FOR SELECT USING (
    org_id = get_user_org_id()
  );

CREATE POLICY "training_materials_insert" ON training_materials
  FOR INSERT WITH CHECK (
    org_id = get_user_org_id() AND is_staff()
  );

CREATE POLICY "training_materials_update" ON training_materials
  FOR UPDATE USING (
    org_id = get_user_org_id() AND is_staff()
  );

CREATE POLICY "training_materials_delete" ON training_materials
  FOR DELETE USING (
    org_id = get_user_org_id() AND is_staff()
  );

-- RLS Policies for training_progress
CREATE POLICY "training_progress_select" ON training_progress
  FOR SELECT USING (
    user_id = auth.uid() OR is_staff()
  );

CREATE POLICY "training_progress_insert" ON training_progress
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
  );

CREATE POLICY "training_progress_update" ON training_progress
  FOR UPDATE USING (
    user_id = auth.uid()
  );

CREATE POLICY "training_progress_delete" ON training_progress
  FOR DELETE USING (
    user_id = auth.uid()
  );

-- RLS Policies for training_categories
CREATE POLICY "training_categories_select" ON training_categories
  FOR SELECT USING (
    org_id = get_user_org_id()
  );

CREATE POLICY "training_categories_insert" ON training_categories
  FOR INSERT WITH CHECK (
    org_id = get_user_org_id() AND is_staff()
  );

CREATE POLICY "training_categories_update" ON training_categories
  FOR UPDATE USING (
    org_id = get_user_org_id() AND is_staff()
  );

CREATE POLICY "training_categories_delete" ON training_categories
  FOR DELETE USING (
    org_id = get_user_org_id() AND is_staff()
  );

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_training_materials_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER training_materials_updated_at
  BEFORE UPDATE ON training_materials
  FOR EACH ROW EXECUTE FUNCTION update_training_materials_timestamp();

CREATE TRIGGER training_progress_updated_at
  BEFORE UPDATE ON training_progress
  FOR EACH ROW EXECUTE FUNCTION update_training_materials_timestamp();

-- Function to increment view count
CREATE OR REPLACE FUNCTION increment_training_view_count(material_uuid UUID)
RETURNS void AS $$
BEGIN
  UPDATE training_materials
  SET view_count = view_count + 1
  WHERE id = material_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: Default categories will be created per-org when first training material is added
-- Or can be seeded via the application layer using get_user_org_id()

-- View for training materials with progress
CREATE OR REPLACE VIEW training_materials_with_progress AS
SELECT
  tm.*,
  tp.started_at AS user_started_at,
  tp.completed_at AS user_completed_at,
  tp.last_viewed_at AS user_last_viewed,
  tp.view_count AS user_view_count,
  CASE
    WHEN tp.completed_at IS NOT NULL THEN 'completed'
    WHEN tp.started_at IS NOT NULL THEN 'in_progress'
    ELSE 'not_started'
  END AS user_status
FROM training_materials tm
LEFT JOIN training_progress tp ON tm.id = tp.material_id AND tp.user_id = auth.uid();

-- View for training statistics per user
CREATE OR REPLACE VIEW training_user_stats AS
SELECT
  tp.user_id,
  COUNT(DISTINCT tp.material_id) AS materials_started,
  COUNT(DISTINCT CASE WHEN tp.completed_at IS NOT NULL THEN tp.material_id END) AS materials_completed,
  SUM(tp.view_count) AS total_views,
  MAX(tp.last_viewed_at) AS last_activity,
  (
    SELECT COUNT(*) FROM training_materials tm
    WHERE tm.is_required = true AND tm.is_active = true
    AND tm.org_id = get_user_org_id()
  ) AS required_total,
  (
    SELECT COUNT(*) FROM training_progress tp2
    JOIN training_materials tm2 ON tp2.material_id = tm2.id
    WHERE tp2.user_id = tp.user_id
    AND tp2.completed_at IS NOT NULL
    AND tm2.is_required = true
  ) AS required_completed
FROM training_progress tp
GROUP BY tp.user_id;

COMMENT ON TABLE training_materials IS 'Gamma deck stacks and other training materials for staff';
COMMENT ON TABLE training_progress IS 'User progress tracking for training materials';
COMMENT ON TABLE training_categories IS 'Predefined categories for organizing training materials';
