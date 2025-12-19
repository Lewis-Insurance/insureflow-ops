-- AO Renewals: Add "moved" status and carrier tracking
-- This migration adds support for tracking renewals moved to partner carriers

-- 1. Add moved tracking columns to ao_renewals
ALTER TABLE ao_renewals
ADD COLUMN IF NOT EXISTS moved_carrier TEXT,
ADD COLUMN IF NOT EXISTS moved_term TEXT CHECK (moved_term IN ('6_month', 'annual')),
ADD COLUMN IF NOT EXISTS moved_premium DECIMAL(10,2);

-- 2. Update status check constraint to include 'moved'
-- First drop the existing constraint if it exists
ALTER TABLE ao_renewals DROP CONSTRAINT IF EXISTS ao_renewals_status_check;

-- Add new constraint with 'moved' status
ALTER TABLE ao_renewals ADD CONSTRAINT ao_renewals_status_check
CHECK (status IN ('pending', 'contacted', 'quoted', 'renewed', 'lost', 'cancelled', 'moved'));

-- 3. Create configurable carrier list table
CREATE TABLE IF NOT EXISTS ao_moved_carriers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on carrier table
ALTER TABLE ao_moved_carriers ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Staff can read carriers" ON ao_moved_carriers;
DROP POLICY IF EXISTS "Admin can manage carriers" ON ao_moved_carriers;

-- Staff can read carriers
CREATE POLICY "Staff can read carriers" ON ao_moved_carriers
  FOR SELECT USING (public.is_staff());

-- Admin can manage carriers
CREATE POLICY "Admin can manage carriers" ON ao_moved_carriers
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 4. Seed initial carriers
INSERT INTO ao_moved_carriers (name, display_order) VALUES
  ('Progressive', 1),
  ('Geico', 2),
  ('Nationwide', 3)
ON CONFLICT (name) DO NOTHING;

-- 5. Create index for analytics queries
CREATE INDEX IF NOT EXISTS idx_ao_renewals_moved_carrier ON ao_renewals(moved_carrier) WHERE status = 'moved';
CREATE INDEX IF NOT EXISTS idx_ao_renewals_status ON ao_renewals(status);
CREATE INDEX IF NOT EXISTS idx_ao_renewals_assigned_to ON ao_renewals(assigned_to);

-- 6. Create analytics view for premium tracking
CREATE OR REPLACE VIEW ao_renewals_analytics AS
SELECT
  -- Overall counts
  COUNT(*) AS total_renewals,
  COUNT(*) FILTER (WHERE status = 'renewed') AS renewed_count,
  COUNT(*) FILTER (WHERE status = 'moved') AS moved_count,
  COUNT(*) FILTER (WHERE status IN ('lost', 'cancelled')) AS lost_count,

  -- Premium totals
  COALESCE(SUM(current_premium), 0) AS total_premium,
  COALESCE(SUM(current_premium) FILTER (WHERE status = 'renewed'), 0) AS renewed_premium,
  COALESCE(SUM(moved_premium) FILTER (WHERE status = 'moved'), 0) AS moved_premium_retained,
  COALESCE(SUM(current_premium) FILTER (WHERE status IN ('lost', 'cancelled')), 0) AS lost_premium,

  -- Retention rate calculation
  CASE
    WHEN SUM(current_premium) FILTER (WHERE status IN ('lost', 'cancelled', 'moved')) > 0
    THEN ROUND(
      (COALESCE(SUM(moved_premium) FILTER (WHERE status = 'moved'), 0)::NUMERIC /
       NULLIF(SUM(current_premium) FILTER (WHERE status IN ('lost', 'cancelled', 'moved')), 0)) * 100,
      1
    )
    ELSE 0
  END AS retention_rate
FROM ao_renewals;

-- 7. Create view for carrier breakdown
CREATE OR REPLACE VIEW ao_renewals_by_carrier AS
SELECT
  moved_carrier,
  COUNT(*) AS policies_moved,
  COALESCE(SUM(moved_premium), 0) AS total_premium,
  ROUND(AVG(moved_premium)::NUMERIC, 2) AS avg_premium,
  COUNT(*) FILTER (WHERE moved_term = '6_month') AS six_month_count,
  COUNT(*) FILTER (WHERE moved_term = 'annual') AS annual_count
FROM ao_renewals
WHERE status = 'moved' AND moved_carrier IS NOT NULL
GROUP BY moved_carrier
ORDER BY total_premium DESC;

-- Grant access to views
GRANT SELECT ON ao_renewals_analytics TO authenticated;
GRANT SELECT ON ao_renewals_by_carrier TO authenticated;

-- 8. Add updated_at trigger to carriers table
CREATE OR REPLACE FUNCTION update_ao_moved_carriers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_ao_moved_carriers_updated_at ON ao_moved_carriers;
CREATE TRIGGER update_ao_moved_carriers_updated_at
  BEFORE UPDATE ON ao_moved_carriers
  FOR EACH ROW EXECUTE FUNCTION update_ao_moved_carriers_updated_at();
