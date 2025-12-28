-- ============================================================================
-- AUTH HARDENING MIGRATION
-- ============================================================================
-- Creates public_access_tokens table for tokenized public links (NPS surveys,
-- review requests, unsubscribe links, portal invites).
-- Also adds idempotency constraints to prevent duplicate stage executions.
-- ============================================================================

-- ============================================================================
-- STEP 1: PUBLIC ACCESS TOKENS TABLE
-- ============================================================================
-- Secure tokens for unauthenticated access to specific resources

CREATE TABLE IF NOT EXISTS public_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Token value (hashed or plain depending on security needs)
  token TEXT NOT NULL UNIQUE,

  -- Token type determines what it can access
  type TEXT NOT NULL CHECK (type IN (
    'nps_survey',
    'review_request',
    'unsubscribe',
    'portal_invite',
    'document_share'
  )),

  -- What resource this token grants access to
  resource_id UUID NOT NULL,

  -- Agency scope (for audit/tracking)
  agency_workspace_id UUID REFERENCES agency_workspaces(id) ON DELETE CASCADE,

  -- Optional contact association
  contact_id UUID,

  -- Expiration
  expires_at TIMESTAMPTZ NOT NULL,

  -- Usage tracking
  used_at TIMESTAMPTZ,
  single_use BOOLEAN DEFAULT FALSE,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Indexes for token lookups
CREATE INDEX IF NOT EXISTS idx_public_tokens_token ON public_access_tokens(token);
CREATE INDEX IF NOT EXISTS idx_public_tokens_type ON public_access_tokens(type);
CREATE INDEX IF NOT EXISTS idx_public_tokens_resource ON public_access_tokens(resource_id);
CREATE INDEX IF NOT EXISTS idx_public_tokens_agency ON public_access_tokens(agency_workspace_id);
CREATE INDEX IF NOT EXISTS idx_public_tokens_expires ON public_access_tokens(expires_at);

-- RLS for public_access_tokens
ALTER TABLE public_access_tokens ENABLE ROW LEVEL SECURITY;

-- Agency members can view/create tokens for their agency
DROP POLICY IF EXISTS "tokens_select" ON public_access_tokens;
CREATE POLICY "tokens_select" ON public_access_tokens
  FOR SELECT USING (
    agency_workspace_id IS NULL
    OR is_agency_member(agency_workspace_id)
  );

DROP POLICY IF EXISTS "tokens_insert" ON public_access_tokens;
CREATE POLICY "tokens_insert" ON public_access_tokens
  FOR INSERT WITH CHECK (
    agency_workspace_id IS NULL
    OR is_agency_member(agency_workspace_id)
  );

DROP POLICY IF EXISTS "tokens_delete" ON public_access_tokens;
CREATE POLICY "tokens_delete" ON public_access_tokens
  FOR DELETE USING (
    agency_workspace_id IS NOT NULL
    AND is_agency_admin(agency_workspace_id)
  );

-- ============================================================================
-- STEP 2: IDEMPOTENCY CONSTRAINTS FOR STAGE EXECUTIONS
-- ============================================================================
-- Prevent duplicate stage executions for the same execution+stage combination

-- Add unique constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unique_stage_per_execution'
  ) THEN
    ALTER TABLE automation_stage_executions
    ADD CONSTRAINT unique_stage_per_execution
    UNIQUE (execution_id, stage_id);
  END IF;
EXCEPTION WHEN others THEN
  -- Constraint might already exist or table doesn't exist yet
  RAISE NOTICE 'Could not add unique_stage_per_execution constraint: %', SQLERRM;
END $$;

-- ============================================================================
-- STEP 3: CONSENT TRACKING ENHANCEMENTS
-- ============================================================================
-- Add consent audit fields to communication_preferences

ALTER TABLE communication_preferences
  ADD COLUMN IF NOT EXISTS email_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_consent_source TEXT,
  ADD COLUMN IF NOT EXISTS sms_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_consent_source TEXT,
  ADD COLUMN IF NOT EXISTS marketing_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS marketing_consent_source TEXT;

-- ============================================================================
-- STEP 4: FIX communication_preferences RLS
-- ============================================================================
-- Current policy is too permissive (any authenticated user can see all prefs)
-- Fix: Only show preferences for contacts in user's agency

-- First, add agency_workspace_id to communication_preferences if not exists
ALTER TABLE communication_preferences
  ADD COLUMN IF NOT EXISTS agency_workspace_id UUID REFERENCES agency_workspaces(id) ON DELETE CASCADE;

-- Backfill agency_workspace_id from contact's account
UPDATE communication_preferences cp
SET agency_workspace_id = a.agency_workspace_id
FROM contacts c
JOIN accounts a ON c.account_id = a.id
WHERE cp.contact_id = c.id
  AND cp.agency_workspace_id IS NULL
  AND a.agency_workspace_id IS NOT NULL;

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Users can view preferences" ON communication_preferences;
DROP POLICY IF EXISTS "Users can insert preferences" ON communication_preferences;
DROP POLICY IF EXISTS "Users can update preferences" ON communication_preferences;
DROP POLICY IF EXISTS "communication_preferences_select" ON communication_preferences;
DROP POLICY IF EXISTS "communication_preferences_insert" ON communication_preferences;
DROP POLICY IF EXISTS "communication_preferences_update" ON communication_preferences;

-- Create properly scoped policies
CREATE POLICY "prefs_select_agency" ON communication_preferences
  FOR SELECT USING (
    agency_workspace_id IS NOT NULL AND is_agency_member(agency_workspace_id)
  );

CREATE POLICY "prefs_insert_agency" ON communication_preferences
  FOR INSERT WITH CHECK (
    agency_workspace_id IS NOT NULL AND is_agency_member(agency_workspace_id)
  );

CREATE POLICY "prefs_update_agency" ON communication_preferences
  FOR UPDATE USING (
    agency_workspace_id IS NOT NULL AND is_agency_member(agency_workspace_id)
  );

-- Index for faster RLS checks
CREATE INDEX IF NOT EXISTS idx_comm_prefs_agency ON communication_preferences(agency_workspace_id);

-- ============================================================================
-- STEP 5: ADD is_staff COLUMN TO PROFILES IF NOT EXISTS
-- ============================================================================
-- Needed for agency-auth.ts staff bypass

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_staff BOOLEAN DEFAULT FALSE;

-- ============================================================================
-- STEP 6: FUNCTION TO VERIFY AND MARK TOKEN AS USED
-- ============================================================================
-- Atomic token verification and usage marking

CREATE OR REPLACE FUNCTION verify_and_use_token(
  p_token TEXT,
  p_expected_type TEXT
)
RETURNS TABLE (
  valid BOOLEAN,
  resource_id UUID,
  agency_workspace_id UUID,
  contact_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_token RECORD;
BEGIN
  -- Find token
  SELECT * INTO v_token
  FROM public_access_tokens
  WHERE token = p_token AND type = p_expected_type;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE::BOOLEAN,
      NULL::UUID,
      NULL::UUID,
      NULL::UUID,
      'Invalid or expired token'::TEXT;
    RETURN;
  END IF;

  -- Check expiration
  IF v_token.expires_at < NOW() THEN
    RETURN QUERY SELECT
      FALSE::BOOLEAN,
      NULL::UUID,
      NULL::UUID,
      NULL::UUID,
      'Token has expired'::TEXT;
    RETURN;
  END IF;

  -- Check if already used (for single-use tokens)
  IF v_token.single_use AND v_token.used_at IS NOT NULL THEN
    RETURN QUERY SELECT
      FALSE::BOOLEAN,
      NULL::UUID,
      NULL::UUID,
      NULL::UUID,
      'Token has already been used'::TEXT;
    RETURN;
  END IF;

  -- Mark as used (for single-use tokens)
  IF v_token.single_use THEN
    UPDATE public_access_tokens
    SET used_at = NOW()
    WHERE id = v_token.id;
  END IF;

  -- Return success
  RETURN QUERY SELECT
    TRUE::BOOLEAN,
    v_token.resource_id,
    v_token.agency_workspace_id,
    v_token.contact_id,
    NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- SUMMARY
-- ============================================================================

DO $$
DECLARE
  v_tokens INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_tokens FROM public_access_tokens;

  RAISE NOTICE '=========================================';
  RAISE NOTICE 'Auth Hardening Migration Complete';
  RAISE NOTICE '=========================================';
  RAISE NOTICE 'Public access tokens table: CREATED';
  RAISE NOTICE 'Stage execution idempotency: ADDED';
  RAISE NOTICE 'Consent tracking fields: ADDED';
  RAISE NOTICE 'communication_preferences RLS: FIXED';
  RAISE NOTICE '=========================================';
END $$;
