-- ============================================================================
-- PORTAL USER POLICIES VIEW
-- ============================================================================
-- Convenience view for querying policies accessible to a portal user
-- Used by the customer portal API endpoints
-- ============================================================================

-- Drop if exists for idempotent re-runs
DROP VIEW IF EXISTS portal_user_policies;

-- Create the view
CREATE OR REPLACE VIEW portal_user_policies AS
SELECT
  cpu.user_id AS portal_user_id,
  cpu.auth_user_id,
  cpu.email AS portal_user_email,
  cpu.first_name,
  cpu.last_name,
  p.id AS policy_id,
  p.policy_number,
  p.policy_type,
  p.status AS policy_status,
  p.effective_date,
  p.expiration_date,
  p.premium,
  p.carrier_name,
  a.id AS account_id,
  a.name AS account_name
FROM client_portal_users cpu
JOIN accounts a ON a.id = cpu.account_id
JOIN policies p ON p.account_id = a.id
WHERE cpu.portal_status = 'active'
  AND p.status IN ('active', 'pending', 'renewal');

-- Add comment
COMMENT ON VIEW portal_user_policies IS 'Convenience view joining portal users to their accessible policies';

-- Grant access to authenticated users (RLS on underlying tables still applies)
GRANT SELECT ON portal_user_policies TO authenticated;

-- ============================================================================
-- Also create a function to check invitation status (for pre-auth flow)
-- This is called before authentication to check if an email has been invited
-- ============================================================================

CREATE OR REPLACE FUNCTION check_portal_invitation(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_invitation RECORD;
  v_existing_user RECORD;
BEGIN
  -- First check if user already has an account
  SELECT id, portal_status, first_name
  INTO v_existing_user
  FROM client_portal_users
  WHERE LOWER(email) = LOWER(p_email)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing_user.portal_status = 'active' THEN
      RETURN jsonb_build_object(
        'status', 'existing_user',
        'message', 'Welcome back! Please sign in.',
        'can_proceed', TRUE
      );
    ELSIF v_existing_user.portal_status = 'disabled' THEN
      RETURN jsonb_build_object(
        'status', 'disabled',
        'message', 'Your account has been disabled. Please contact us for assistance.',
        'can_proceed', FALSE
      );
    ELSE
      -- Invited but not yet active
      RETURN jsonb_build_object(
        'status', 'invited',
        'message', 'Complete your registration to access the portal.',
        'can_proceed', TRUE
      );
    END IF;
  END IF;

  -- Check for pending invitation
  SELECT id, status, expires_at
  INTO v_invitation
  FROM portal_invitations
  WHERE LOWER(email) = LOWER(p_email)
    AND status IN ('pending', 'sent', 'clicked')
    AND (expires_at IS NULL OR expires_at > NOW())
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', 'has_invitation',
      'message', 'You have been invited! Complete registration to access your portal.',
      'can_proceed', TRUE,
      'invitation_id', v_invitation.id
    );
  END IF;

  -- No invitation found
  RETURN jsonb_build_object(
    'status', 'no_invitation',
    'message', 'No invitation found for this email. Please contact your insurance agent to request portal access.',
    'can_proceed', FALSE
  );
END;
$$;

-- Revoke from public, grant to authenticated and anon (pre-auth check)
REVOKE ALL ON FUNCTION check_portal_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_portal_invitation(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION check_portal_invitation(TEXT) TO anon;

COMMENT ON FUNCTION check_portal_invitation IS 'Pre-authentication check for portal invitation status';
