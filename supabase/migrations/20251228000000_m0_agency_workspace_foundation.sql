-- ============================================================================
-- M0: AGENCY WORKSPACE FOUNDATION
-- ============================================================================
-- Creates the unified agency tenant model without breaking existing org_id
-- This is the foundational migration for InsureFlow Market Leadership
-- ============================================================================

-- ============================================================================
-- STEP 1: RENAME EXISTING WORKSPACES TABLE
-- ============================================================================
-- The existing 'workspaces' table is used for comparison jobs, not tenancy
-- Rename it to reflect its actual purpose

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'workspaces' AND table_schema = 'public') THEN
    -- Check if comparison_workspaces already exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'comparison_workspaces' AND table_schema = 'public') THEN
      ALTER TABLE workspaces RENAME TO comparison_workspaces;

      -- Also rename any indexes
      IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'workspaces_pkey') THEN
        ALTER INDEX workspaces_pkey RENAME TO comparison_workspaces_pkey;
      END IF;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- STEP 2: AGENCY WORKSPACES (The True Tenant)
-- ============================================================================
CREATE TABLE IF NOT EXISTS agency_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,  -- URL-friendly: /app/acme-insurance/...

  -- Ownership
  owner_id UUID NOT NULL REFERENCES auth.users(id),

  -- Settings
  settings JSONB DEFAULT '{}',
  -- {
  --   "timezone": "America/Chicago",
  --   "business_hours": {"start": "09:00", "end": "17:00"},
  --   "default_sender_name": "Acme Insurance",
  --   "features": {"automation": true, "portal": true}
  -- }

  -- Branding (for portal)
  logo_url TEXT,
  primary_color TEXT DEFAULT '#0066cc',

  -- Contact info
  phone TEXT,
  email TEXT,
  address TEXT,
  website TEXT,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- STEP 3: AGENCY WORKSPACE MEMBERSHIPS (Team Access)
-- ============================================================================
CREATE TABLE IF NOT EXISTS agency_workspace_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_workspace_id UUID NOT NULL REFERENCES agency_workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Role within agency
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'producer', 'csr', 'accounting', 'viewer')),

  -- Permissions override (optional fine-grained control)
  permissions JSONB DEFAULT '{}',
  -- {"can_delete_policies": false, "can_view_commissions": true}

  -- Invitation tracking
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('pending', 'active', 'suspended', 'removed')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(agency_workspace_id, user_id)
);

-- ============================================================================
-- STEP 4: LEGACY ORG_ID BRIDGE TABLE
-- ============================================================================
-- Maps old org_id values to new agency_workspace_id for incremental migration
CREATE TABLE IF NOT EXISTS agency_workspace_legacy_org_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_workspace_id UUID NOT NULL REFERENCES agency_workspaces(id) ON DELETE CASCADE,
  legacy_org_id UUID NOT NULL UNIQUE,  -- The old org_id value
  migrated_at TIMESTAMPTZ DEFAULT NOW(),
  migration_notes TEXT
);

-- Index for fast lookups during transition
CREATE INDEX IF NOT EXISTS idx_legacy_org_map_org_id ON agency_workspace_legacy_org_map(legacy_org_id);
CREATE INDEX IF NOT EXISTS idx_legacy_org_map_workspace ON agency_workspace_legacy_org_map(agency_workspace_id);

-- ============================================================================
-- STEP 5: USER PREFERENCES (Active Agency Selection)
-- ============================================================================
-- Add column to profiles for default agency preference
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS
  default_agency_workspace_id UUID REFERENCES agency_workspaces(id) ON DELETE SET NULL;

-- ============================================================================
-- STEP 6: HARDENED HELPER FUNCTIONS
-- ============================================================================

-- Check if current user is a member of specified agency
CREATE OR REPLACE FUNCTION is_agency_member(p_agency_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  IF p_agency_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM agency_workspace_memberships
    WHERE agency_workspace_id = p_agency_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if current user is admin or owner of specified agency
CREATE OR REPLACE FUNCTION is_agency_admin(p_agency_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  IF p_agency_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM agency_workspace_memberships
    WHERE agency_workspace_id = p_agency_id
      AND user_id = auth.uid()
      AND status = 'active'
      AND role IN ('owner', 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if current user is the owner of specified agency
CREATE OR REPLACE FUNCTION is_agency_owner(p_agency_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  IF p_agency_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM agency_workspace_memberships
    WHERE agency_workspace_id = p_agency_id
      AND user_id = auth.uid()
      AND status = 'active'
      AND role = 'owner'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Get all agency IDs the current user belongs to
CREATE OR REPLACE FUNCTION get_user_agency_ids()
RETURNS SETOF UUID AS $$
  SELECT agency_workspace_id
  FROM agency_workspace_memberships
  WHERE user_id = auth.uid() AND status = 'active';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Get user's default/preferred agency (for UI context)
CREATE OR REPLACE FUNCTION get_user_default_agency_id()
RETURNS UUID AS $$
DECLARE
  v_default UUID;
  v_first UUID;
BEGIN
  -- Try profile preference first
  SELECT default_agency_workspace_id INTO v_default
  FROM profiles WHERE id = auth.uid();

  IF v_default IS NOT NULL AND is_agency_member(v_default) THEN
    RETURN v_default;
  END IF;

  -- Fall back to first membership
  SELECT agency_workspace_id INTO v_first
  FROM agency_workspace_memberships
  WHERE user_id = auth.uid() AND status = 'active'
  ORDER BY created_at ASC
  LIMIT 1;

  RETURN v_first;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Bridge function: get agency_workspace_id from legacy org_id
CREATE OR REPLACE FUNCTION get_agency_from_legacy_org(p_org_id UUID)
RETURNS UUID AS $$
  SELECT agency_workspace_id
  FROM agency_workspace_legacy_org_map
  WHERE legacy_org_id = p_org_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if user has specific permission in agency
CREATE OR REPLACE FUNCTION has_agency_permission(p_agency_id UUID, p_permission TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_role TEXT;
  v_permissions JSONB;
BEGIN
  IF p_agency_id IS NULL OR p_permission IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT role, permissions INTO v_role, v_permissions
  FROM agency_workspace_memberships
  WHERE agency_workspace_id = p_agency_id
    AND user_id = auth.uid()
    AND status = 'active';

  IF v_role IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Owner and admin have all permissions
  IF v_role IN ('owner', 'admin') THEN
    RETURN TRUE;
  END IF;

  -- Check explicit permission override
  IF v_permissions IS NOT NULL AND v_permissions ? p_permission THEN
    RETURN (v_permissions->>p_permission)::boolean;
  END IF;

  -- Default permissions by role
  RETURN CASE v_role
    WHEN 'producer' THEN p_permission IN (
      'view_policies', 'edit_policies', 'view_leads', 'edit_leads',
      'view_commissions', 'view_accounts', 'edit_accounts', 'view_tasks',
      'edit_tasks', 'view_documents', 'upload_documents'
    )
    WHEN 'csr' THEN p_permission IN (
      'view_policies', 'view_leads', 'edit_leads', 'create_tasks',
      'view_accounts', 'edit_accounts', 'view_tasks', 'edit_tasks',
      'view_documents', 'upload_documents'
    )
    WHEN 'accounting' THEN p_permission IN (
      'view_policies', 'view_commissions', 'edit_commissions',
      'view_accounts', 'view_reports'
    )
    WHEN 'viewer' THEN p_permission IN (
      'view_policies', 'view_leads', 'view_accounts', 'view_tasks',
      'view_documents'
    )
    ELSE FALSE
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Get user's role in a specific agency
CREATE OR REPLACE FUNCTION get_user_agency_role(p_agency_id UUID)
RETURNS TEXT AS $$
  SELECT role
  FROM agency_workspace_memberships
  WHERE agency_workspace_id = p_agency_id
    AND user_id = auth.uid()
    AND status = 'active';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================================
-- STEP 7: RLS POLICIES
-- ============================================================================
ALTER TABLE agency_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_workspace_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_workspace_legacy_org_map ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "agency_workspaces_select" ON agency_workspaces;
DROP POLICY IF EXISTS "agency_workspaces_insert" ON agency_workspaces;
DROP POLICY IF EXISTS "agency_workspaces_update" ON agency_workspaces;
DROP POLICY IF EXISTS "agency_workspaces_delete" ON agency_workspaces;
DROP POLICY IF EXISTS "memberships_select" ON agency_workspace_memberships;
DROP POLICY IF EXISTS "memberships_insert" ON agency_workspace_memberships;
DROP POLICY IF EXISTS "memberships_update" ON agency_workspace_memberships;
DROP POLICY IF EXISTS "memberships_delete" ON agency_workspace_memberships;
DROP POLICY IF EXISTS "legacy_map_select" ON agency_workspace_legacy_org_map;
DROP POLICY IF EXISTS "legacy_map_insert" ON agency_workspace_legacy_org_map;

-- Agency Workspaces: Members can view their agencies
CREATE POLICY "agency_workspaces_select" ON agency_workspaces
  FOR SELECT USING (is_agency_member(id));

-- Anyone can create an agency (they become owner)
CREATE POLICY "agency_workspaces_insert" ON agency_workspaces
  FOR INSERT WITH CHECK (owner_id = auth.uid());

-- Only admins can update agency settings
CREATE POLICY "agency_workspaces_update" ON agency_workspaces
  FOR UPDATE USING (is_agency_admin(id));

-- Only owners can delete agencies
CREATE POLICY "agency_workspaces_delete" ON agency_workspaces
  FOR DELETE USING (is_agency_owner(id));

-- Memberships: Members can view all memberships in their agencies
CREATE POLICY "memberships_select" ON agency_workspace_memberships
  FOR SELECT USING (is_agency_member(agency_workspace_id));

-- Only admins can add members
CREATE POLICY "memberships_insert" ON agency_workspace_memberships
  FOR INSERT WITH CHECK (is_agency_admin(agency_workspace_id));

-- Admins can update memberships (except owner role)
CREATE POLICY "memberships_update" ON agency_workspace_memberships
  FOR UPDATE USING (
    is_agency_admin(agency_workspace_id)
    AND (role != 'owner' OR is_agency_owner(agency_workspace_id))
  );

-- Admins can remove members, users can remove themselves
CREATE POLICY "memberships_delete" ON agency_workspace_memberships
  FOR DELETE USING (
    is_agency_admin(agency_workspace_id)
    OR user_id = auth.uid()
  );

-- Legacy map: Members can view, admins can insert
CREATE POLICY "legacy_map_select" ON agency_workspace_legacy_org_map
  FOR SELECT USING (is_agency_member(agency_workspace_id));

CREATE POLICY "legacy_map_insert" ON agency_workspace_legacy_org_map
  FOR INSERT WITH CHECK (is_agency_admin(agency_workspace_id));

-- ============================================================================
-- STEP 8: INDEXES FOR PERFORMANCE
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_agency_workspaces_slug ON agency_workspaces(slug);
CREATE INDEX IF NOT EXISTS idx_agency_workspaces_owner ON agency_workspaces(owner_id);
CREATE INDEX IF NOT EXISTS idx_agency_workspaces_status ON agency_workspaces(status);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON agency_workspace_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_agency ON agency_workspace_memberships(agency_workspace_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user_status ON agency_workspace_memberships(user_id, status);
CREATE INDEX IF NOT EXISTS idx_memberships_agency_role ON agency_workspace_memberships(agency_workspace_id, role);

-- ============================================================================
-- STEP 9: TRIGGERS
-- ============================================================================

-- Auto-update updated_at (create if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to agency_workspaces
DROP TRIGGER IF EXISTS agency_workspaces_updated_at ON agency_workspaces;
CREATE TRIGGER agency_workspaces_updated_at
  BEFORE UPDATE ON agency_workspaces
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Apply updated_at trigger to memberships
DROP TRIGGER IF EXISTS agency_memberships_updated_at ON agency_workspace_memberships;
CREATE TRIGGER agency_memberships_updated_at
  BEFORE UPDATE ON agency_workspace_memberships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-create owner membership when workspace is created
CREATE OR REPLACE FUNCTION auto_create_owner_membership()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO agency_workspace_memberships (
    agency_workspace_id,
    user_id,
    role,
    status,
    accepted_at,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.owner_id,
    'owner',
    'active',
    NOW(),
    NOW(),
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS agency_workspace_auto_membership ON agency_workspaces;
CREATE TRIGGER agency_workspace_auto_membership
  AFTER INSERT ON agency_workspaces
  FOR EACH ROW EXECUTE FUNCTION auto_create_owner_membership();

-- Generate slug from name if not provided
CREATE OR REPLACE FUNCTION generate_agency_slug()
RETURNS TRIGGER AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
BEGIN
  -- If slug is provided and valid, use it
  IF NEW.slug IS NOT NULL AND NEW.slug != '' THEN
    RETURN NEW;
  END IF;

  -- Generate base slug from name
  base_slug := lower(regexp_replace(NEW.name, '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);

  -- Check for uniqueness and append counter if needed
  final_slug := base_slug;
  WHILE EXISTS (SELECT 1 FROM agency_workspaces WHERE slug = final_slug AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;

  NEW.slug := final_slug;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agency_workspace_generate_slug ON agency_workspaces;
CREATE TRIGGER agency_workspace_generate_slug
  BEFORE INSERT OR UPDATE ON agency_workspaces
  FOR EACH ROW EXECUTE FUNCTION generate_agency_slug();

-- ============================================================================
-- STEP 10: COMMENTS FOR DOCUMENTATION
-- ============================================================================
COMMENT ON TABLE agency_workspaces IS 'Agency tenant table - represents an insurance agency organization';
COMMENT ON TABLE agency_workspace_memberships IS 'Links users to agencies with role-based access control';
COMMENT ON TABLE agency_workspace_legacy_org_map IS 'Bridge table mapping legacy org_id values to new agency_workspace_id';

COMMENT ON FUNCTION is_agency_member(UUID) IS 'Check if current user is an active member of the specified agency';
COMMENT ON FUNCTION is_agency_admin(UUID) IS 'Check if current user is an admin or owner of the specified agency';
COMMENT ON FUNCTION is_agency_owner(UUID) IS 'Check if current user is the owner of the specified agency';
COMMENT ON FUNCTION get_user_agency_ids() IS 'Get all agency IDs the current user belongs to';
COMMENT ON FUNCTION get_user_default_agency_id() IS 'Get the user default agency from profile or first membership';
COMMENT ON FUNCTION get_agency_from_legacy_org(UUID) IS 'Bridge function to get agency_workspace_id from legacy org_id';
COMMENT ON FUNCTION has_agency_permission(UUID, TEXT) IS 'Check if user has specific permission in agency (role-based with overrides)';
COMMENT ON FUNCTION get_user_agency_role(UUID) IS 'Get the user role in a specific agency';

-- ============================================================================
-- M0 FOUNDATION COMPLETE
-- ============================================================================
-- Next steps:
-- 1. Create useActiveAgency hook in React
-- 2. Create useAgencyMemberships hook in React
-- 3. Run bootstrap migration to create agencies from existing org_ids
-- ============================================================================
