-- ============================================================================
-- SCHEMA PREREQUISITES: Run this BEFORE marketing automation or reputation
-- ============================================================================
-- This migration ensures all required schema elements exist before running
-- the Phase 1 (Marketing Automation) or Phase 2 (Reputation) migrations.
--
-- RUN THIS FIRST, then run the other migrations in order.
-- ============================================================================

-- ============================================================================
-- STEP 1: CREATE agency_workspaces IF NOT EXISTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS agency_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id),
  settings JSONB DEFAULT '{}',
  logo_url TEXT,
  primary_color TEXT DEFAULT '#0066cc',
  phone TEXT,
  email TEXT,
  address TEXT,
  website TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- STEP 2: CREATE agency_workspace_memberships IF NOT EXISTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS agency_workspace_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_workspace_id UUID NOT NULL REFERENCES agency_workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'producer', 'csr', 'accounting', 'viewer')),
  permissions JSONB DEFAULT '{}',
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active' CHECK (status IN ('pending', 'active', 'suspended', 'removed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agency_workspace_id, user_id)
);

-- ============================================================================
-- STEP 3: ADD agency_workspace_id TO ACCOUNTS
-- ============================================================================

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS
  agency_workspace_id UUID REFERENCES agency_workspaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_accounts_agency_workspace ON accounts(agency_workspace_id);

-- ============================================================================
-- STEP 4: ADD default_agency_workspace_id TO PROFILES
-- ============================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS
  default_agency_workspace_id UUID REFERENCES agency_workspaces(id) ON DELETE SET NULL;

-- ============================================================================
-- STEP 5: CREATE/REPLACE HELPER FUNCTIONS
-- ============================================================================

-- Update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

-- Get user's default/preferred agency
CREATE OR REPLACE FUNCTION get_user_default_agency_id()
RETURNS UUID AS $$
DECLARE
  v_default UUID;
  v_first UUID;
BEGIN
  SELECT default_agency_workspace_id INTO v_default
  FROM profiles WHERE id = auth.uid();

  IF v_default IS NOT NULL AND is_agency_member(v_default) THEN
    RETURN v_default;
  END IF;

  SELECT agency_workspace_id INTO v_first
  FROM agency_workspace_memberships
  WHERE user_id = auth.uid() AND status = 'active'
  ORDER BY created_at ASC
  LIMIT 1;

  RETURN v_first;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================================
-- STEP 6: RLS ON CORE TABLES
-- ============================================================================

ALTER TABLE agency_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_workspace_memberships ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies
DROP POLICY IF EXISTS "agency_workspaces_select" ON agency_workspaces;
DROP POLICY IF EXISTS "agency_workspaces_insert" ON agency_workspaces;
DROP POLICY IF EXISTS "agency_workspaces_update" ON agency_workspaces;
DROP POLICY IF EXISTS "agency_workspaces_delete" ON agency_workspaces;
DROP POLICY IF EXISTS "memberships_select" ON agency_workspace_memberships;
DROP POLICY IF EXISTS "memberships_insert" ON agency_workspace_memberships;
DROP POLICY IF EXISTS "memberships_update" ON agency_workspace_memberships;
DROP POLICY IF EXISTS "memberships_delete" ON agency_workspace_memberships;

CREATE POLICY "agency_workspaces_select" ON agency_workspaces
  FOR SELECT USING (is_agency_member(id));

CREATE POLICY "agency_workspaces_insert" ON agency_workspaces
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "agency_workspaces_update" ON agency_workspaces
  FOR UPDATE USING (is_agency_admin(id));

CREATE POLICY "agency_workspaces_delete" ON agency_workspaces
  FOR DELETE USING (is_agency_owner(id));

CREATE POLICY "memberships_select" ON agency_workspace_memberships
  FOR SELECT USING (is_agency_member(agency_workspace_id));

CREATE POLICY "memberships_insert" ON agency_workspace_memberships
  FOR INSERT WITH CHECK (is_agency_admin(agency_workspace_id));

CREATE POLICY "memberships_update" ON agency_workspace_memberships
  FOR UPDATE USING (
    is_agency_admin(agency_workspace_id)
    AND (role != 'owner' OR is_agency_owner(agency_workspace_id))
  );

CREATE POLICY "memberships_delete" ON agency_workspace_memberships
  FOR DELETE USING (
    is_agency_admin(agency_workspace_id)
    OR user_id = auth.uid()
  );

-- ============================================================================
-- STEP 7: CORE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_agency_workspaces_slug ON agency_workspaces(slug);
CREATE INDEX IF NOT EXISTS idx_agency_workspaces_owner ON agency_workspaces(owner_id);
CREATE INDEX IF NOT EXISTS idx_agency_workspaces_status ON agency_workspaces(status);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON agency_workspace_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_agency ON agency_workspace_memberships(agency_workspace_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user_status ON agency_workspace_memberships(user_id, status);

-- ============================================================================
-- STEP 8: AUTO-CREATE OWNER MEMBERSHIP TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_create_owner_membership()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO agency_workspace_memberships (
    agency_workspace_id, user_id, role, status, accepted_at, created_at, updated_at
  ) VALUES (
    NEW.id, NEW.owner_id, 'owner', 'active', NOW(), NOW(), NOW()
  )
  ON CONFLICT (agency_workspace_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS agency_workspace_auto_membership ON agency_workspaces;
CREATE TRIGGER agency_workspace_auto_membership
  AFTER INSERT ON agency_workspaces
  FOR EACH ROW EXECUTE FUNCTION auto_create_owner_membership();

-- ============================================================================
-- STEP 9: BOOTSTRAP AGENCY FOR STAFF USERS (if needed)
-- ============================================================================

DO $$
DECLARE
  v_user_record RECORD;
  v_agency_id UUID;
  v_agency_slug TEXT;
  v_counter INTEGER := 0;
BEGIN
  FOR v_user_record IN
    SELECT
      p.id as user_id,
      COALESCE(p.full_name, 'Agency Owner') as full_name,
      p.phone,
      au.email
    FROM profiles p
    JOIN auth.users au ON au.id = p.id
    WHERE (p.is_staff = TRUE OR p.role = 'admin' OR p.role = 'agent')
      AND NOT EXISTS (
        SELECT 1 FROM agency_workspace_memberships awm
        WHERE awm.user_id = p.id AND awm.status = 'active'
      )
    ORDER BY p.created_at ASC
  LOOP
    v_agency_slug := lower(regexp_replace(v_user_record.full_name, '[^a-zA-Z0-9]+', '-', 'g'));
    v_agency_slug := trim(both '-' from v_agency_slug) || '-agency';

    WHILE EXISTS (SELECT 1 FROM agency_workspaces WHERE slug = v_agency_slug) LOOP
      v_agency_slug := v_agency_slug || '-' || floor(random() * 1000)::text;
    END LOOP;

    INSERT INTO agency_workspaces (name, slug, owner_id, phone, email, settings, status)
    VALUES (
      v_user_record.full_name || '''s Agency',
      v_agency_slug,
      v_user_record.user_id,
      v_user_record.phone,
      v_user_record.email,
      jsonb_build_object('timezone', 'America/Chicago', 'auto_created', true),
      'active'
    )
    RETURNING id INTO v_agency_id;

    v_counter := v_counter + 1;
    RAISE NOTICE 'Created agency for user % (% total)', v_user_record.user_id, v_counter;
  END LOOP;

  IF v_counter > 0 THEN
    RAISE NOTICE 'Bootstrap complete: Created % agencies', v_counter;
  ELSE
    RAISE NOTICE 'No new agencies needed - all staff users already have agencies';
  END IF;
END $$;

-- ============================================================================
-- STEP 10: SET DEFAULT AGENCY FOR USERS
-- ============================================================================

UPDATE profiles p
SET default_agency_workspace_id = (
  SELECT awm.agency_workspace_id
  FROM agency_workspace_memberships awm
  WHERE awm.user_id = p.id AND awm.status = 'active'
  ORDER BY awm.created_at ASC
  LIMIT 1
)
WHERE p.default_agency_workspace_id IS NULL
  AND EXISTS (
    SELECT 1 FROM agency_workspace_memberships awm
    WHERE awm.user_id = p.id AND awm.status = 'active'
  );

-- ============================================================================
-- STEP 11: BACKFILL ACCOUNTS WITH agency_workspace_id
-- ============================================================================

-- Helper function to determine agency from account owner
CREATE OR REPLACE FUNCTION get_agency_for_account(p_account_id UUID)
RETURNS UUID AS $$
DECLARE
  v_owner_id UUID;
  v_agency_id UUID;
BEGIN
  SELECT owner_agent_id INTO v_owner_id
  FROM accounts WHERE id = p_account_id;

  IF v_owner_id IS NOT NULL THEN
    SELECT default_agency_workspace_id INTO v_agency_id
    FROM profiles WHERE id = v_owner_id;

    IF v_agency_id IS NOT NULL THEN
      RETURN v_agency_id;
    END IF;

    SELECT agency_workspace_id INTO v_agency_id
    FROM agency_workspace_memberships
    WHERE user_id = v_owner_id AND status = 'active'
    ORDER BY created_at ASC LIMIT 1;

    RETURN v_agency_id;
  END IF;

  SELECT get_user_default_agency_id() INTO v_agency_id;
  RETURN v_agency_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Backfill
UPDATE accounts a
SET agency_workspace_id = get_agency_for_account(a.id)
WHERE a.agency_workspace_id IS NULL;

-- ============================================================================
-- SUMMARY
-- ============================================================================

DO $$
DECLARE
  v_agencies INTEGER;
  v_memberships INTEGER;
  v_accounts_with_agency INTEGER;
  v_accounts_total INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_agencies FROM agency_workspaces;
  SELECT COUNT(*) INTO v_memberships FROM agency_workspace_memberships WHERE status = 'active';
  SELECT COUNT(*) INTO v_accounts_with_agency FROM accounts WHERE agency_workspace_id IS NOT NULL;
  SELECT COUNT(*) INTO v_accounts_total FROM accounts WHERE deleted_at IS NULL;

  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Schema Prerequisites Complete';
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Agency workspaces: %', v_agencies;
  RAISE NOTICE 'Active memberships: %', v_memberships;
  RAISE NOTICE 'Accounts with agency: % / %', v_accounts_with_agency, v_accounts_total;
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'You can now run the marketing automation and reputation migrations.';
END $$;
