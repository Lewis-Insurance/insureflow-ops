-- ============================================================================
-- Fix Soft Delete Function Security
-- ============================================================================
-- This migration addresses security issues in the soft delete functions:
-- 1. Adds table allowlist to prevent arbitrary table deletion
-- 2. Adds role checking to ensure only authorized users can delete
-- 3. Sets search_path to prevent schema hijacking
-- ============================================================================

-- Drop the insecure functions first
DROP FUNCTION IF EXISTS public.perform_soft_delete(TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS public.restore_soft_deleted(TEXT, UUID);

-- ============================================================================
-- SECURE: Perform Soft Delete with Allowlist and Role Check
-- ============================================================================

CREATE OR REPLACE FUNCTION public.perform_soft_delete(
  p_table_name TEXT,
  p_record_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_deleted BOOLEAN := FALSE;
  v_allowed_tables TEXT[] := ARRAY[
    'accounts',
    'leads',
    'policies',
    'quotes',
    'tasks',
    'documents',
    'communications',
    'tickets',
    'contacts'
  ];
  v_user_role TEXT;
BEGIN
  -- Set search_path for security
  SET search_path = public;

  -- Check if table is in allowlist
  IF NOT (p_table_name = ANY(v_allowed_tables)) THEN
    RAISE EXCEPTION 'Table "%" is not allowed for soft delete', p_table_name;
  END IF;

  -- Check user role - only staff/admin can perform soft deletes
  SELECT role INTO v_user_role
  FROM profiles
  WHERE id = auth.uid();

  IF v_user_role IS NULL OR v_user_role NOT IN ('admin', 'staff', 'producer', 'csr', 'accounting', 'owner') THEN
    RAISE EXCEPTION 'Only staff members can perform soft deletes';
  END IF;

  -- Perform the soft delete
  EXECUTE format(
    'UPDATE public.%I SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING TRUE',
    p_table_name
  ) INTO v_deleted USING p_record_id;

  -- Log the deletion if successful
  IF v_deleted THEN
    INSERT INTO deletion_audit_log (table_name, record_id, deleted_by, reason)
    VALUES (p_table_name, p_record_id, auth.uid(), p_reason);
  END IF;

  RETURN COALESCE(v_deleted, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- SECURE: Restore Soft-Deleted Record (Admin Only)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.restore_soft_deleted(
  p_table_name TEXT,
  p_record_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_restored BOOLEAN := FALSE;
  v_allowed_tables TEXT[] := ARRAY[
    'accounts',
    'leads',
    'policies',
    'quotes',
    'tasks',
    'documents',
    'communications',
    'tickets',
    'contacts'
  ];
  v_user_role TEXT;
BEGIN
  -- Set search_path for security
  SET search_path = public;

  -- Check if table is in allowlist
  IF NOT (p_table_name = ANY(v_allowed_tables)) THEN
    RAISE EXCEPTION 'Table "%" is not allowed for restore', p_table_name;
  END IF;

  -- Only admins can restore
  SELECT role INTO v_user_role
  FROM profiles
  WHERE id = auth.uid();

  IF v_user_role IS NULL OR v_user_role != 'admin' THEN
    RAISE EXCEPTION 'Only admins can restore deleted records';
  END IF;

  -- Restore the record
  EXECUTE format(
    'UPDATE public.%I SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL RETURNING TRUE',
    p_table_name
  ) INTO v_restored USING p_record_id;

  -- Log the restoration
  IF v_restored THEN
    INSERT INTO deletion_audit_log (table_name, record_id, deleted_by, reason)
    VALUES (p_table_name, p_record_id, auth.uid(), 'RESTORED');
  END IF;

  RETURN COALESCE(v_restored, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- Revoke and Re-grant with Proper Permissions
-- ============================================================================

REVOKE ALL ON FUNCTION public.perform_soft_delete FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_soft_deleted FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.perform_soft_delete TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_soft_deleted TO authenticated;

-- ============================================================================
-- Comments for Documentation
-- ============================================================================

COMMENT ON FUNCTION public.perform_soft_delete IS
  'Securely soft-delete a record. Only staff roles can use this, and only on allowed tables.';

COMMENT ON FUNCTION public.restore_soft_deleted IS
  'Restore a soft-deleted record. Admin only.';
