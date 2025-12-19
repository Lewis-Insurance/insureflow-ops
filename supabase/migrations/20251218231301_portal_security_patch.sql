-- ============================================================================
-- INSUREFLOW CLIENT PORTAL - SECURITY PATCH v2
-- ============================================================================
-- Apply AFTER the main migration to fix identified security issues:
-- 1. Disabled users can still pass access checks
-- 2. Household permissions not enforced on SELECT
-- 3. Document uploads update scope too broad
-- 4. Missing REVOKE/GRANT on helper functions
-- 5. Need atomic increment RPC for downloads
-- ============================================================================

-- ============================================================================
-- SECTION 1: DROP DEPENDENT POLICIES FIRST
-- ============================================================================
-- Must drop policies before we can recreate the functions they depend on

DROP POLICY IF EXISTS "Users can view their visible documents" ON portal_documents;
DROP POLICY IF EXISTS "Users can view their ID cards" ON portal_id_cards;
DROP POLICY IF EXISTS "Users can view their service requests" ON portal_service_requests;
DROP POLICY IF EXISTS "Users can view non-internal messages on their requests" ON portal_service_request_messages;
DROP POLICY IF EXISTS "Users can insert messages on their requests" ON portal_service_request_messages;
DROP POLICY IF EXISTS "Users can view their uploads" ON portal_document_uploads;
DROP POLICY IF EXISTS "Users can create uploads" ON portal_document_uploads;
DROP POLICY IF EXISTS "Users can update their pending uploads" ON portal_document_uploads;
DROP POLICY IF EXISTS "Users can view their quote requests" ON portal_quote_requests;
DROP POLICY IF EXISTS "Users can view their referrals" ON portal_referrals;
DROP POLICY IF EXISTS "Users can view their opportunities" ON portal_coverage_opportunities;
DROP POLICY IF EXISTS "Users can update opportunity status" ON portal_coverage_opportunities;


-- ============================================================================
-- SECTION 2: FIX HELPER FUNCTIONS (Add portal_status checks)
-- ============================================================================

-- Now we can safely drop and recreate functions
DROP FUNCTION IF EXISTS portal_accessible_account_ids();
DROP FUNCTION IF EXISTS portal_has_permission(TEXT);
DROP FUNCTION IF EXISTS get_my_portal_user_id();
DROP FUNCTION IF EXISTS get_my_household_member_id();

-- ----------------------------------------------------------------------------
-- 2.1 Get accessible account IDs (FIXED: checks portal_status = 'active')
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION portal_accessible_account_ids()
RETURNS TABLE(account_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Direct portal user access (must be active)
  SELECT cpu.account_id
  FROM client_portal_users cpu
  WHERE cpu.auth_user_id = auth.uid()
    AND cpu.portal_status = 'active'  -- CRITICAL: only active users

  UNION

  -- Household member access (must be active, primary must be active)
  SELECT cpu2.account_id
  FROM portal_household_members phm
  JOIN client_portal_users cpu2 ON cpu2.id = phm.primary_user_id
  WHERE phm.auth_user_id = auth.uid()
    AND phm.status = 'active'           -- Household member must be active
    AND cpu2.portal_status = 'active';  -- Primary user must be active
$$;

REVOKE ALL ON FUNCTION portal_accessible_account_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION portal_accessible_account_ids() TO authenticated;

-- ----------------------------------------------------------------------------
-- 2.2 Check if current user has specific permission (FIXED: status checks)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION portal_has_permission(p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- Primary users have all permissions (if active)
    SELECT 1
    FROM client_portal_users cpu
    WHERE cpu.auth_user_id = auth.uid()
      AND cpu.portal_status = 'active'
  )
  OR EXISTS (
    -- Household members need specific permission (both must be active)
    SELECT 1
    FROM portal_household_members phm
    JOIN client_portal_users cpu ON cpu.id = phm.primary_user_id
    WHERE phm.auth_user_id = auth.uid()
      AND phm.status = 'active'
      AND cpu.portal_status = 'active'
      AND (phm.permissions->>p_permission)::boolean = true
  );
$$;

REVOKE ALL ON FUNCTION portal_has_permission(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION portal_has_permission(TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2.3 Get current portal user ID (FIXED: status check)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_my_portal_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM client_portal_users
  WHERE auth_user_id = auth.uid()
    AND portal_status = 'active'  -- CRITICAL: only active users
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION get_my_portal_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_my_portal_user_id() TO authenticated;

-- ----------------------------------------------------------------------------
-- 2.4 Get current household member ID (FIXED: status checks)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_my_household_member_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT phm.id
  FROM portal_household_members phm
  JOIN client_portal_users cpu ON cpu.id = phm.primary_user_id
  WHERE phm.auth_user_id = auth.uid()
    AND phm.status = 'active'
    AND cpu.portal_status = 'active'  -- Primary must also be active
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION get_my_household_member_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_my_household_member_id() TO authenticated;


-- ============================================================================
-- SECTION 3: RECREATE RLS POLICIES WITH PERMISSION CHECKS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 3.1 PORTAL DOCUMENTS (with view_documents permission)
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view their visible documents"
  ON portal_documents FOR SELECT
  USING (
    is_client_visible = TRUE
    AND verified_for_client_view = TRUE
    AND account_id IN (SELECT account_id FROM portal_accessible_account_ids())
    AND portal_has_permission('view_documents')  -- ADDED: permission check
  );

-- ----------------------------------------------------------------------------
-- 3.2 ID CARDS (with view_id_cards permission)
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view their ID cards"
  ON portal_id_cards FOR SELECT
  USING (
    account_id IN (SELECT account_id FROM portal_accessible_account_ids())
    AND portal_has_permission('view_id_cards')  -- ADDED: permission check
    AND is_active = TRUE
  );

-- ----------------------------------------------------------------------------
-- 3.3 SERVICE REQUESTS (with view permission - use request_service_changes)
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view their service requests"
  ON portal_service_requests FOR SELECT
  USING (
    account_id IN (SELECT account_id FROM portal_accessible_account_ids())
    -- Primary users can always view; household needs permission
    AND (
      -- Is primary user
      EXISTS (
        SELECT 1 FROM client_portal_users
        WHERE auth_user_id = auth.uid() AND portal_status = 'active'
      )
      OR
      -- Household member with request_service_changes permission
      portal_has_permission('request_service_changes')
    )
  );

-- ----------------------------------------------------------------------------
-- 3.4 SERVICE REQUEST MESSAGES (recreate)
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view non-internal messages on their requests"
  ON portal_service_request_messages FOR SELECT
  USING (
    is_internal = FALSE
    AND request_id IN (
      SELECT id FROM portal_service_requests
      WHERE account_id IN (SELECT account_id FROM portal_accessible_account_ids())
    )
  );

CREATE POLICY "Users can insert messages on their requests"
  ON portal_service_request_messages FOR INSERT
  WITH CHECK (
    request_id IN (
      SELECT id FROM portal_service_requests
      WHERE account_id IN (SELECT account_id FROM portal_accessible_account_ids())
    )
    AND author_type IN ('client', 'household_member')
    AND is_internal = FALSE
  );

-- ----------------------------------------------------------------------------
-- 3.5 QUOTE REQUESTS (with request_quotes permission for household)
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view their quote requests"
  ON portal_quote_requests FOR SELECT
  USING (
    account_id IN (SELECT account_id FROM portal_accessible_account_ids())
    AND (
      -- Is primary user
      EXISTS (
        SELECT 1 FROM client_portal_users
        WHERE auth_user_id = auth.uid() AND portal_status = 'active'
      )
      OR
      -- Household member with request_quotes permission
      portal_has_permission('request_quotes')
    )
  );

-- ----------------------------------------------------------------------------
-- 3.6 REFERRALS (primary users only, household can view with request_quotes)
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view their referrals"
  ON portal_referrals FOR SELECT
  USING (
    referring_account_id IN (SELECT account_id FROM portal_accessible_account_ids())
    AND (
      -- Is primary user (referrals are theirs)
      referring_user_id IN (
        SELECT id FROM client_portal_users
        WHERE auth_user_id = auth.uid() AND portal_status = 'active'
      )
      OR
      -- Household member with request_quotes permission can view referrals
      portal_has_permission('request_quotes')
    )
  );

-- ----------------------------------------------------------------------------
-- 3.7 COVERAGE OPPORTUNITIES (with view_policies permission)
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view their opportunities"
  ON portal_coverage_opportunities FOR SELECT
  USING (
    account_id IN (SELECT account_id FROM portal_accessible_account_ids())
    AND portal_has_permission('view_policies')  -- Basic view permission
    AND status = 'active'
  );

CREATE POLICY "Users can update opportunity status"
  ON portal_coverage_opportunities FOR UPDATE
  USING (
    account_id IN (SELECT account_id FROM portal_accessible_account_ids())
  )
  WITH CHECK (
    account_id IN (SELECT account_id FROM portal_accessible_account_ids())
  );

-- ----------------------------------------------------------------------------
-- 3.8 DOCUMENT UPLOADS (FIXED: strict ownership for updates)
-- ----------------------------------------------------------------------------

-- View: can see uploads for accessible accounts
CREATE POLICY "Users can view their uploads"
  ON portal_document_uploads FOR SELECT
  USING (
    account_id IN (SELECT account_id FROM portal_accessible_account_ids())
  );

-- Insert: can upload to accessible accounts with document permission
CREATE POLICY "Users can create uploads"
  ON portal_document_uploads FOR INSERT
  WITH CHECK (
    account_id IN (SELECT account_id FROM portal_accessible_account_ids())
    AND portal_has_permission('view_documents')
    -- Ensure portal_user_id matches current user
    AND portal_user_id = get_my_portal_user_id()
  );

-- Update: ONLY own pending uploads (strict ownership)
CREATE POLICY "Users can update own pending uploads"
  ON portal_document_uploads FOR UPDATE
  USING (
    -- Must be your upload
    portal_user_id = get_my_portal_user_id()
    -- Must be pending client verification
    AND client_verification_status = 'pending'
  )
  WITH CHECK (
    -- Same conditions on new row
    portal_user_id = get_my_portal_user_id()
    AND client_verification_status IN ('pending', 'confirmed', 'rejected')
  );

-- Primary users with manage_household can update household member uploads
CREATE POLICY "Primary users can manage household uploads"
  ON portal_document_uploads FOR UPDATE
  USING (
    -- Must be a primary user
    EXISTS (
      SELECT 1 FROM client_portal_users
      WHERE auth_user_id = auth.uid()
      AND portal_status = 'active'
      AND account_id = portal_document_uploads.account_id
    )
    -- Upload must be from a household member (not primary)
    AND portal_user_id != get_my_portal_user_id()
    -- Must be pending
    AND client_verification_status = 'pending'
  );


-- ============================================================================
-- SECTION 4: ATOMIC INCREMENT RPC FOR DOWNLOADS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 4.1 Increment document download count (atomic, access-checked)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION increment_document_download(
  p_document_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_portal_user_id UUID;
  v_household_member_id UUID;
  v_doc RECORD;
  v_can_download BOOLEAN;
BEGIN
  -- Get current user
  v_portal_user_id := get_my_portal_user_id();
  v_household_member_id := get_my_household_member_id();

  IF v_portal_user_id IS NULL AND v_household_member_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated as portal user';
  END IF;

  -- Check download permission
  v_can_download := portal_has_permission('download_documents');
  IF NOT v_can_download THEN
    RAISE EXCEPTION 'Permission denied: cannot download documents';
  END IF;

  -- Get document (must be in accessible account and visible)
  SELECT id, file_path, document_name, account_id
  INTO v_doc
  FROM portal_documents
  WHERE id = p_document_id
    AND is_client_visible = TRUE
    AND verified_for_client_view = TRUE
    AND account_id IN (SELECT account_id FROM portal_accessible_account_ids());

  IF v_doc.id IS NULL THEN
    RAISE EXCEPTION 'Document not found or access denied';
  END IF;

  -- Atomic increment + update downloaded by
  UPDATE portal_documents
  SET
    download_count = download_count + 1,
    last_downloaded_at = NOW(),
    last_downloaded_by_portal_user_id = CASE
      WHEN v_household_member_id IS NULL THEN v_portal_user_id
      ELSE NULL
    END,
    last_downloaded_by_household_member_id = v_household_member_id
  WHERE id = p_document_id;

  -- Log activity
  PERFORM log_my_portal_activity(
    'download_document',
    jsonb_build_object('document_id', p_document_id)
  );

  -- Return document info for Edge Function to generate signed URL
  RETURN jsonb_build_object(
    'document_id', v_doc.id,
    'file_path', v_doc.file_path,
    'document_name', v_doc.document_name
  );
END;
$$;

REVOKE ALL ON FUNCTION increment_document_download(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_document_download(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4.2 Increment ID card view/download/wallet counts
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION increment_id_card_action(
  p_card_id UUID,
  p_action TEXT  -- 'view', 'download', 'wallet_add'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card RECORD;
  v_can_view BOOLEAN;
  v_can_wallet BOOLEAN;
BEGIN
  -- Check view permission
  v_can_view := portal_has_permission('view_id_cards');
  IF NOT v_can_view THEN
    RAISE EXCEPTION 'Permission denied: cannot view ID cards';
  END IF;

  -- For wallet actions, check add_to_wallet permission
  IF p_action = 'wallet_add' THEN
    v_can_wallet := portal_has_permission('add_to_wallet');
    IF NOT v_can_wallet THEN
      RAISE EXCEPTION 'Permission denied: cannot add to wallet';
    END IF;
  END IF;

  -- Get card (must be in accessible account)
  SELECT id, card_image_path, card_pdf_path, card_data, policy_id
  INTO v_card
  FROM portal_id_cards
  WHERE id = p_card_id
    AND is_active = TRUE
    AND account_id IN (SELECT account_id FROM portal_accessible_account_ids());

  IF v_card.id IS NULL THEN
    RAISE EXCEPTION 'ID card not found or access denied';
  END IF;

  -- Atomic increment based on action
  UPDATE portal_id_cards
  SET
    view_count = CASE WHEN p_action = 'view' THEN view_count + 1 ELSE view_count END,
    download_count = CASE WHEN p_action = 'download' THEN download_count + 1 ELSE download_count END,
    wallet_add_count = CASE WHEN p_action = 'wallet_add' THEN wallet_add_count + 1 ELSE wallet_add_count END,
    last_accessed_at = NOW()
  WHERE id = p_card_id;

  -- Log activity
  PERFORM log_my_portal_activity(
    CASE p_action
      WHEN 'view' THEN 'view_id_card'
      WHEN 'download' THEN 'download_id_card'
      WHEN 'wallet_add' THEN 'add_to_wallet'
    END,
    jsonb_build_object('card_id', p_card_id)
  );

  RETURN jsonb_build_object(
    'card_id', v_card.id,
    'card_image_path', v_card.card_image_path,
    'card_pdf_path', v_card.card_pdf_path,
    'card_data', v_card.card_data,
    'policy_id', v_card.policy_id
  );
END;
$$;

REVOKE ALL ON FUNCTION increment_id_card_action(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_id_card_action(UUID, TEXT) TO authenticated;


-- ============================================================================
-- SECTION 5: HOUSEHOLD INVITE WITH PERMISSION CHECK
-- ============================================================================

CREATE OR REPLACE FUNCTION invite_household_member(
  p_member_email TEXT,
  p_member_name TEXT DEFAULT NULL,
  p_relationship TEXT DEFAULT NULL,
  p_permissions JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_portal_user_id UUID;
  v_can_manage BOOLEAN;
  v_member_id UUID;
  v_default_permissions JSONB;
BEGIN
  -- Must be a primary portal user (not household member)
  v_portal_user_id := get_my_portal_user_id();

  IF v_portal_user_id IS NULL THEN
    -- Check if they're a household member trying to invite
    IF get_my_household_member_id() IS NOT NULL THEN
      -- Check manage_household permission
      v_can_manage := portal_has_permission('manage_household');
      IF NOT v_can_manage THEN
        RAISE EXCEPTION 'Permission denied: cannot manage household';
      END IF;

      -- Get the primary user ID for this household member
      SELECT cpu.id INTO v_portal_user_id
      FROM portal_household_members phm
      JOIN client_portal_users cpu ON cpu.id = phm.primary_user_id
      WHERE phm.auth_user_id = auth.uid()
        AND phm.status = 'active';
    ELSE
      RAISE EXCEPTION 'Not authenticated as portal user';
    END IF;
  END IF;

  -- Default permissions
  v_default_permissions := '{
    "view_policies": true,
    "view_documents": true,
    "download_documents": true,
    "view_id_cards": true,
    "add_to_wallet": true,
    "view_billing_links": false,
    "request_service_changes": false,
    "request_quotes": false,
    "manage_household": false,
    "view_premium_amounts": false
  }'::JSONB;

  -- Merge provided permissions with defaults
  IF p_permissions IS NOT NULL THEN
    v_default_permissions := v_default_permissions || p_permissions;
  END IF;

  -- Create household member
  INSERT INTO portal_household_members (
    primary_user_id,
    member_email,
    member_name,
    relationship,
    permissions,
    status,
    invited_at
  ) VALUES (
    v_portal_user_id,
    LOWER(TRIM(p_member_email)),  -- Normalize email
    p_member_name,
    p_relationship,
    v_default_permissions,
    'invited',
    NOW()
  )
  RETURNING id INTO v_member_id;

  -- Log activity
  PERFORM log_my_portal_activity(
    'add_household_member',
    jsonb_build_object('member_id', v_member_id, 'member_email', p_member_email)
  );

  RETURN v_member_id;
END;
$$;

REVOKE ALL ON FUNCTION invite_household_member FROM PUBLIC;
GRANT EXECUTE ON FUNCTION invite_household_member TO authenticated;


-- ============================================================================
-- SECTION 6: CHECK PORTAL INVITATION EXISTS (for login flow)
-- ============================================================================

-- This function checks if an email has a valid portal invitation
-- Used to enforce "invite-required" login flow
CREATE OR REPLACE FUNCTION check_portal_invitation(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation RECORD;
  v_portal_user RECORD;
BEGIN
  -- First check if already a portal user
  SELECT id, account_id, portal_status
  INTO v_portal_user
  FROM client_portal_users
  WHERE LOWER(email) = LOWER(TRIM(p_email))
  LIMIT 1;

  IF v_portal_user.id IS NOT NULL THEN
    IF v_portal_user.portal_status = 'active' THEN
      RETURN jsonb_build_object(
        'allowed', TRUE,
        'reason', 'existing_user',
        'account_id', v_portal_user.account_id
      );
    ELSIF v_portal_user.portal_status = 'disabled' THEN
      RETURN jsonb_build_object(
        'allowed', FALSE,
        'reason', 'account_disabled'
      );
    END IF;
  END IF;

  -- Check for valid invitation
  SELECT id, account_id, status, expires_at
  INTO v_invitation
  FROM portal_invitations
  WHERE LOWER(email) = LOWER(TRIM(p_email))
    AND status IN ('pending', 'sent')
    AND (expires_at IS NULL OR expires_at > NOW())
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_invitation.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', TRUE,
      'reason', 'valid_invitation',
      'invitation_id', v_invitation.id,
      'account_id', v_invitation.account_id
    );
  END IF;

  -- Check if invited as household member
  SELECT phm.id, cpu.account_id
  INTO v_invitation
  FROM portal_household_members phm
  JOIN client_portal_users cpu ON cpu.id = phm.primary_user_id
  WHERE LOWER(phm.member_email) = LOWER(TRIM(p_email))
    AND phm.status = 'invited'
  LIMIT 1;

  IF v_invitation.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', TRUE,
      'reason', 'household_invitation',
      'household_member_id', v_invitation.id
    );
  END IF;

  -- No invitation found
  RETURN jsonb_build_object(
    'allowed', FALSE,
    'reason', 'no_invitation'
  );
END;
$$;

-- This function can be called by anon (for login page)
REVOKE ALL ON FUNCTION check_portal_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_portal_invitation(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION check_portal_invitation(TEXT) TO authenticated;


-- ============================================================================
-- SECTION 7: ENSURE ALL SECURITY DEFINER FUNCTIONS HAVE PROPER GRANTS
-- ============================================================================

-- Main client functions
REVOKE ALL ON FUNCTION log_my_portal_activity FROM PUBLIC;
GRANT EXECUTE ON FUNCTION log_my_portal_activity TO authenticated;

REVOKE ALL ON FUNCTION create_my_service_request FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_my_service_request TO authenticated;

REVOKE ALL ON FUNCTION create_my_quote_request FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_my_quote_request TO authenticated;

REVOKE ALL ON FUNCTION create_my_referral FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_my_referral TO authenticated;
