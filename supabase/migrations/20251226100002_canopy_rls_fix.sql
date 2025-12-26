-- ============================================================================
-- CANOPY CONNECT RLS POLICY FIX
-- ============================================================================
-- Safely recreates RLS policies for Canopy tables
-- Handles case where policies may or may not already exist
-- ============================================================================

-- Drop existing policies if they exist (safe to run multiple times)
DROP POLICY IF EXISTS "Staff can view all canopy pulls" ON canopy_pulls;
DROP POLICY IF EXISTS "Staff can insert canopy pulls" ON canopy_pulls;
DROP POLICY IF EXISTS "Staff can update canopy pulls" ON canopy_pulls;
DROP POLICY IF EXISTS "Staff can view all canopy policies" ON canopy_policies;
DROP POLICY IF EXISTS "Staff can insert canopy policies" ON canopy_policies;
DROP POLICY IF EXISTS "Staff can view all canopy vehicles" ON canopy_vehicles;
DROP POLICY IF EXISTS "Staff can insert canopy vehicles" ON canopy_vehicles;
DROP POLICY IF EXISTS "Staff can view all canopy drivers" ON canopy_drivers;
DROP POLICY IF EXISTS "Staff can insert canopy drivers" ON canopy_drivers;
DROP POLICY IF EXISTS "Staff can view all canopy dwellings" ON canopy_dwellings;
DROP POLICY IF EXISTS "Staff can insert canopy dwellings" ON canopy_dwellings;
DROP POLICY IF EXISTS "Staff can view all canopy documents" ON canopy_documents;
DROP POLICY IF EXISTS "Staff can insert canopy documents" ON canopy_documents;
DROP POLICY IF EXISTS "Staff can update canopy documents" ON canopy_documents;
DROP POLICY IF EXISTS "Staff can view all canopy claims" ON canopy_claims;
DROP POLICY IF EXISTS "Staff can insert canopy claims" ON canopy_claims;
DROP POLICY IF EXISTS "Staff can view all canopy enrichment" ON canopy_enrichment;
DROP POLICY IF EXISTS "Staff can insert canopy enrichment" ON canopy_enrichment;
DROP POLICY IF EXISTS "Service role can manage webhook logs" ON canopy_webhook_log;

-- ============================================================================
-- HELPER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION is_canopy_staff()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'staff', 'producer', 'csr', 'owner')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- ENABLE RLS ON ALL TABLES (safe to run even if already enabled)
-- ============================================================================

ALTER TABLE canopy_pulls ENABLE ROW LEVEL SECURITY;
ALTER TABLE canopy_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE canopy_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE canopy_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE canopy_dwellings ENABLE ROW LEVEL SECURITY;
ALTER TABLE canopy_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE canopy_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE canopy_enrichment ENABLE ROW LEVEL SECURITY;
ALTER TABLE canopy_webhook_log ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CANOPY_PULLS POLICIES
-- ============================================================================

CREATE POLICY "Staff can view all canopy pulls" ON canopy_pulls
  FOR SELECT USING (is_canopy_staff());

CREATE POLICY "Staff can insert canopy pulls" ON canopy_pulls
  FOR INSERT WITH CHECK (is_canopy_staff());

CREATE POLICY "Staff can update canopy pulls" ON canopy_pulls
  FOR UPDATE USING (is_canopy_staff());

-- ============================================================================
-- CANOPY_POLICIES POLICIES
-- ============================================================================

CREATE POLICY "Staff can view all canopy policies" ON canopy_policies
  FOR SELECT USING (is_canopy_staff());

CREATE POLICY "Staff can insert canopy policies" ON canopy_policies
  FOR INSERT WITH CHECK (is_canopy_staff());

-- ============================================================================
-- CANOPY_VEHICLES POLICIES
-- ============================================================================

CREATE POLICY "Staff can view all canopy vehicles" ON canopy_vehicles
  FOR SELECT USING (is_canopy_staff());

CREATE POLICY "Staff can insert canopy vehicles" ON canopy_vehicles
  FOR INSERT WITH CHECK (is_canopy_staff());

-- ============================================================================
-- CANOPY_DRIVERS POLICIES
-- ============================================================================

CREATE POLICY "Staff can view all canopy drivers" ON canopy_drivers
  FOR SELECT USING (is_canopy_staff());

CREATE POLICY "Staff can insert canopy drivers" ON canopy_drivers
  FOR INSERT WITH CHECK (is_canopy_staff());

-- ============================================================================
-- CANOPY_DWELLINGS POLICIES
-- ============================================================================

CREATE POLICY "Staff can view all canopy dwellings" ON canopy_dwellings
  FOR SELECT USING (is_canopy_staff());

CREATE POLICY "Staff can insert canopy dwellings" ON canopy_dwellings
  FOR INSERT WITH CHECK (is_canopy_staff());

-- ============================================================================
-- CANOPY_DOCUMENTS POLICIES
-- ============================================================================

CREATE POLICY "Staff can view all canopy documents" ON canopy_documents
  FOR SELECT USING (is_canopy_staff());

CREATE POLICY "Staff can insert canopy documents" ON canopy_documents
  FOR INSERT WITH CHECK (is_canopy_staff());

CREATE POLICY "Staff can update canopy documents" ON canopy_documents
  FOR UPDATE USING (is_canopy_staff());

-- ============================================================================
-- CANOPY_CLAIMS POLICIES
-- ============================================================================

CREATE POLICY "Staff can view all canopy claims" ON canopy_claims
  FOR SELECT USING (is_canopy_staff());

CREATE POLICY "Staff can insert canopy claims" ON canopy_claims
  FOR INSERT WITH CHECK (is_canopy_staff());

-- ============================================================================
-- CANOPY_ENRICHMENT POLICIES
-- ============================================================================

CREATE POLICY "Staff can view all canopy enrichment" ON canopy_enrichment
  FOR SELECT USING (is_canopy_staff());

CREATE POLICY "Staff can insert canopy enrichment" ON canopy_enrichment
  FOR INSERT WITH CHECK (is_canopy_staff());

-- ============================================================================
-- CANOPY_WEBHOOK_LOG POLICIES (Service Role Only)
-- ============================================================================

CREATE POLICY "Service role can manage webhook logs" ON canopy_webhook_log
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- DONE
-- ============================================================================
