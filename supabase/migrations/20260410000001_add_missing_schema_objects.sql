-- Migration: Add missing schema objects referenced in codebase
-- Date: 2024-12-04
-- Description: Adds tables and columns that the TypeScript code expects but don't exist in production

-- ============================================================================
-- Add missing columns to existing tables
-- ============================================================================

-- Add is_staff to profiles (used by useAuth.ts)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS is_staff BOOLEAN DEFAULT false;

-- Add contact tracking columns to leads (referenced in LeadDetailView)
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS contact_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS email_opens INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS email_clicks INTEGER DEFAULT 0;

-- ============================================================================
-- Create lead_auto_drivers table (used by useAutoDrivers.ts)
-- ============================================================================

CREATE TABLE IF NOT EXISTS lead_auto_drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth DATE,
  license_number TEXT,
  license_state TEXT,
  gender TEXT,
  marital_status TEXT,
  relation_to_insured TEXT,
  years_licensed INTEGER,
  accidents_violations JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes for lead_auto_drivers
CREATE INDEX IF NOT EXISTS idx_lead_auto_drivers_lead_id ON lead_auto_drivers(lead_id);

-- Add RLS policies for lead_auto_drivers
ALTER TABLE lead_auto_drivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view drivers for their account's leads"
  ON lead_auto_drivers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leads l
      JOIN account_memberships am ON l.account_id = am.account_id
      WHERE l.id = lead_auto_drivers.lead_id
        AND am.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert drivers for their account's leads"
  ON lead_auto_drivers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM leads l
      JOIN account_memberships am ON l.account_id = am.account_id
      WHERE l.id = lead_auto_drivers.lead_id
        AND am.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update drivers for their account's leads"
  ON lead_auto_drivers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM leads l
      JOIN account_memberships am ON l.account_id = am.account_id
      WHERE l.id = lead_auto_drivers.lead_id
        AND am.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete drivers for their account's leads"
  ON lead_auto_drivers FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM leads l
      JOIN account_memberships am ON l.account_id = am.account_id
      WHERE l.id = lead_auto_drivers.lead_id
        AND am.user_id = auth.uid()
    )
  );

-- ============================================================================
-- Create lead_auto_vehicles table (used by useAutoVehicles.ts)
-- ============================================================================

CREATE TABLE IF NOT EXISTS lead_auto_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  vin TEXT,
  ownership TEXT, -- own, lease, finance
  primary_use TEXT, -- commute, pleasure, business
  annual_mileage INTEGER,
  garage_address TEXT,
  safety_features JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes for lead_auto_vehicles
CREATE INDEX IF NOT EXISTS idx_lead_auto_vehicles_lead_id ON lead_auto_vehicles(lead_id);

-- Add RLS policies for lead_auto_vehicles
ALTER TABLE lead_auto_vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view vehicles for their account's leads"
  ON lead_auto_vehicles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leads l
      JOIN account_memberships am ON l.account_id = am.account_id
      WHERE l.id = lead_auto_vehicles.lead_id
        AND am.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert vehicles for their account's leads"
  ON lead_auto_vehicles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM leads l
      JOIN account_memberships am ON l.account_id = am.account_id
      WHERE l.id = lead_auto_vehicles.lead_id
        AND am.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update vehicles for their account's leads"
  ON lead_auto_vehicles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM leads l
      JOIN account_memberships am ON l.account_id = am.account_id
      WHERE l.id = lead_auto_vehicles.lead_id
        AND am.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete vehicles for their account's leads"
  ON lead_auto_vehicles FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM leads l
      JOIN account_memberships am ON l.account_id = am.account_id
      WHERE l.id = lead_auto_vehicles.lead_id
        AND am.user_id = auth.uid()
    )
  );

-- ============================================================================
-- Create knowledge_base_queries table FIRST
-- (Required for the views below)
-- ============================================================================

CREATE TABLE IF NOT EXISTS knowledge_base_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_id UUID REFERENCES knowledge_base(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  query_text TEXT NOT NULL,
  helpful BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_base_queries_knowledge_id ON knowledge_base_queries(knowledge_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_queries_user_id ON knowledge_base_queries(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_queries_created_at ON knowledge_base_queries(created_at);

-- Add RLS for knowledge_base_queries
ALTER TABLE knowledge_base_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own knowledge queries"
  ON knowledge_base_queries FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own knowledge queries"
  ON knowledge_base_queries FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- Create knowledge analytics views (used by useKnowledgeAnalytics.ts)
-- Now that knowledge_base_queries table exists, we can create the views
-- ============================================================================

CREATE OR REPLACE VIEW knowledge_usage_stats AS
SELECT
  kb.id as knowledge_id,
  kb.title,
  kb.category,
  COUNT(DISTINCT kbq.id) as query_count,
  COUNT(DISTINCT kbq.user_id) as unique_users,
  AVG(CASE WHEN kbq.helpful = true THEN 1.0 ELSE 0.0 END) as helpfulness_score,
  MAX(kbq.created_at) as last_accessed_at
FROM knowledge_base kb
LEFT JOIN knowledge_base_queries kbq ON kb.id = kbq.knowledge_id
GROUP BY kb.id, kb.title, kb.category;

CREATE OR REPLACE VIEW knowledge_search_trends AS
SELECT
  DATE_TRUNC('day', kbq.created_at) as date,
  kbq.query_text,
  COUNT(*) as search_count,
  AVG(CASE WHEN kbq.helpful = true THEN 1.0 ELSE 0.0 END) as avg_helpfulness
FROM knowledge_base_queries kbq
WHERE kbq.created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', kbq.created_at), kbq.query_text
ORDER BY date DESC, search_count DESC;

CREATE OR REPLACE VIEW knowledge_gap_trends AS
SELECT
  DATE_TRUNC('day', kbq.created_at) as date,
  kbq.query_text,
  COUNT(*) as unanswered_count
FROM knowledge_base_queries kbq
WHERE kbq.knowledge_id IS NULL  -- No matching knowledge found
  AND kbq.created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', kbq.created_at), kbq.query_text
ORDER BY date DESC, unanswered_count DESC;

CREATE OR REPLACE VIEW knowledge_category_stats AS
SELECT
  kb.category,
  COUNT(DISTINCT kb.id) as article_count,
  COUNT(DISTINCT kbq.id) as total_queries,
  AVG(CASE WHEN kbq.helpful = true THEN 1.0 ELSE 0.0 END) as avg_helpfulness
FROM knowledge_base kb
LEFT JOIN knowledge_base_queries kbq ON kb.id = kbq.knowledge_id
GROUP BY kb.category;

-- ============================================================================
-- Grant permissions
-- ============================================================================

GRANT SELECT ON knowledge_usage_stats TO authenticated;
GRANT SELECT ON knowledge_search_trends TO authenticated;
GRANT SELECT ON knowledge_gap_trends TO authenticated;
GRANT SELECT ON knowledge_category_stats TO authenticated;
