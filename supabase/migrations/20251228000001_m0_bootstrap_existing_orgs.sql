-- ============================================================================
-- M0 BOOTSTRAP: CREATE AGENCIES FOR EXISTING USERS
-- ============================================================================
-- This migration creates agency_workspaces for existing staff users.
-- Since the current schema doesn't have org_id on profiles, we create
-- one agency per staff user.
--
-- IMPORTANT: This migration is idempotent - safe to run multiple times.
-- ============================================================================

-- ============================================================================
-- STEP 1: CREATE AGENCIES FOR STAFF USERS
-- ============================================================================
-- Each staff user gets their own agency workspace

DO $$
DECLARE
  v_user_record RECORD;
  v_agency_id UUID;
  v_agency_name TEXT;
  v_agency_slug TEXT;
  v_counter INTEGER := 0;
  v_skipped INTEGER := 0;
BEGIN
  RAISE NOTICE 'Starting M0 Bootstrap: Creating agencies for existing staff users...';

  -- Loop through staff users who don't already have an agency
  FOR v_user_record IN
    SELECT
      p.id as user_id,
      COALESCE(p.full_name, 'Agency Owner') as full_name,
      p.phone,
      au.email
    FROM profiles p
    JOIN auth.users au ON au.id = p.id
    WHERE p.is_staff = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM agency_workspace_memberships awm
        WHERE awm.user_id = p.id AND awm.status = 'active'
      )
    ORDER BY p.created_at ASC
  LOOP
    -- Generate agency name from user name
    v_agency_name := v_user_record.full_name || '''s Agency';

    -- Generate unique slug
    v_agency_slug := lower(regexp_replace(v_agency_name, '[^a-zA-Z0-9]+', '-', 'g'));
    v_agency_slug := trim(both '-' from v_agency_slug);

    -- Ensure slug uniqueness
    WHILE EXISTS (SELECT 1 FROM agency_workspaces WHERE slug = v_agency_slug) LOOP
      v_agency_slug := v_agency_slug || '-' || floor(random() * 1000)::text;
    END LOOP;

    -- Create agency workspace
    INSERT INTO agency_workspaces (
      name,
      slug,
      owner_id,
      phone,
      email,
      settings,
      status
    ) VALUES (
      v_agency_name,
      v_agency_slug,
      v_user_record.user_id,
      v_user_record.phone,
      v_user_record.email,
      jsonb_build_object(
        'timezone', 'America/Chicago',
        'migration_date', NOW()::text,
        'auto_created', true
      ),
      'active'
    )
    RETURNING id INTO v_agency_id;

    -- The auto_create_owner_membership trigger will create the owner membership

    v_counter := v_counter + 1;
    RAISE NOTICE 'Created agency "%" for user % (% of batch)', v_agency_name, v_user_record.user_id, v_counter;
  END LOOP;

  RAISE NOTICE 'M0 Bootstrap complete: Created % agencies', v_counter;
END $$;

-- ============================================================================
-- STEP 2: SET DEFAULT AGENCY FOR USERS
-- ============================================================================
-- Set each user's default agency to their first (and likely only) membership

UPDATE profiles p
SET default_agency_workspace_id = (
  SELECT awm.agency_workspace_id
  FROM agency_workspace_memberships awm
  WHERE awm.user_id = p.id
    AND awm.status = 'active'
  ORDER BY awm.created_at ASC
  LIMIT 1
)
WHERE p.default_agency_workspace_id IS NULL
  AND EXISTS (
    SELECT 1 FROM agency_workspace_memberships awm
    WHERE awm.user_id = p.id AND awm.status = 'active'
  );

-- ============================================================================
-- STEP 3: CREATE HELPER VIEW FOR AGENCY LOOKUPS
-- ============================================================================

CREATE OR REPLACE VIEW v_user_agencies AS
SELECT
  awm.user_id,
  aw.id as agency_workspace_id,
  aw.name as agency_name,
  aw.slug as agency_slug,
  aw.status as agency_status,
  awm.role as user_role,
  awm.status as membership_status
FROM agency_workspace_memberships awm
JOIN agency_workspaces aw ON aw.id = awm.agency_workspace_id
WHERE awm.status = 'active';

COMMENT ON VIEW v_user_agencies IS
  'Helper view to list all agencies a user belongs to';

-- ============================================================================
-- STEP 4: CREATE HELPER FUNCTION TO GET AGENCY FOR ACCOUNT
-- ============================================================================
-- Since accounts don't have agency_workspace_id yet, we need a way to determine
-- the agency from the account's owner_agent_id

CREATE OR REPLACE FUNCTION get_agency_for_account(p_account_id UUID)
RETURNS UUID AS $$
DECLARE
  v_owner_id UUID;
  v_agency_id UUID;
BEGIN
  -- Get the owner agent for this account
  SELECT owner_agent_id INTO v_owner_id
  FROM accounts
  WHERE id = p_account_id;

  IF v_owner_id IS NULL THEN
    -- If no owner, try to get from the user making the request
    SELECT get_user_default_agency_id() INTO v_agency_id;
    RETURN v_agency_id;
  END IF;

  -- Get the owner's default agency
  SELECT default_agency_workspace_id INTO v_agency_id
  FROM profiles
  WHERE id = v_owner_id;

  IF v_agency_id IS NOT NULL THEN
    RETURN v_agency_id;
  END IF;

  -- Fallback: Get any agency the owner belongs to
  SELECT agency_workspace_id INTO v_agency_id
  FROM agency_workspace_memberships
  WHERE user_id = v_owner_id AND status = 'active'
  ORDER BY created_at ASC
  LIMIT 1;

  RETURN v_agency_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_agency_for_account IS
  'Determines the agency_workspace_id for an account based on its owner';

-- ============================================================================
-- STEP 5: ADD agency_workspace_id TO KEY TABLES (NULLABLE FOR NOW)
-- ============================================================================
-- Add the column but don't require it yet - this enables gradual migration

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS
  agency_workspace_id UUID REFERENCES agency_workspaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_accounts_agency ON accounts(agency_workspace_id);

-- Backfill accounts with agency_workspace_id based on owner
UPDATE accounts a
SET agency_workspace_id = get_agency_for_account(a.id)
WHERE a.agency_workspace_id IS NULL;

-- ============================================================================
-- STEP 6: SUMMARY REPORT
-- ============================================================================

DO $$
DECLARE
  v_agency_count INTEGER;
  v_membership_count INTEGER;
  v_accounts_with_agency INTEGER;
  v_accounts_total INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_agency_count FROM agency_workspaces;
  SELECT COUNT(*) INTO v_membership_count FROM agency_workspace_memberships WHERE status = 'active';
  SELECT COUNT(*) INTO v_accounts_with_agency FROM accounts WHERE agency_workspace_id IS NOT NULL;
  SELECT COUNT(*) INTO v_accounts_total FROM accounts WHERE deleted_at IS NULL;

  RAISE NOTICE '============================================';
  RAISE NOTICE 'M0 Bootstrap Migration Summary';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Total agency workspaces: %', v_agency_count;
  RAISE NOTICE 'Total active memberships: %', v_membership_count;
  RAISE NOTICE 'Accounts with agency: % / %', v_accounts_with_agency, v_accounts_total;
  RAISE NOTICE '============================================';
END $$;

-- ============================================================================
-- M0 BOOTSTRAP COMPLETE
-- ============================================================================
-- Staff users now have agency workspaces.
-- Accounts have been backfilled with agency_workspace_id where possible.
--
-- Next steps:
-- 1. Deploy and verify in production
-- 2. Test agency switching in the UI
-- 3. Migrate remaining tables to use agency_workspace_id
-- ============================================================================
