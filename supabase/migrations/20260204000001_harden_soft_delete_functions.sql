-- ============================================================================
-- HARDEN SOFT DELETE FUNCTIONS
-- ============================================================================
-- Purpose: Constrain SECURITY DEFINER functions to allowed tables and roles
--          and set a safe search_path. Revoke public grants explicitly.
-- ============================================================================

-- Allowed tables for soft delete operations
-- Keep in sync with application soft-delete usage

CREATE OR REPLACE FUNCTION public.perform_soft_delete(
  p_table_name TEXT,
  p_record_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted BOOLEAN := FALSE;
  v_allowed_tables TEXT[] := ARRAY[
    'accounts', 'policies', 'quotes', 'tasks',
    'documents', 'communications', 'contacts'
  ];
BEGIN
  -- Enforce allowlist to prevent arbitrary table updates
  IF p_table_name IS NULL OR NOT (p_table_name = ANY(v_allowed_tables)) THEN
    RAISE EXCEPTION 'Soft delete not allowed for table %', p_table_name;
  END IF;

  -- Require staff or admin role
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND (
        profiles.role IN ('admin', 'staff', 'owner', 'producer', 'csr', 'accounting')
        OR profiles.is_staff = TRUE
      )
  ) THEN
    RAISE EXCEPTION 'Insufficient privileges to delete records';
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
$$;

CREATE OR REPLACE FUNCTION public.restore_soft_deleted(
  p_table_name TEXT,
  p_record_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restored BOOLEAN := FALSE;
  v_allowed_tables TEXT[] := ARRAY[
    'accounts', 'policies', 'quotes', 'tasks',
    'documents', 'communications', 'contacts'
  ];
BEGIN
  -- Enforce allowlist to prevent arbitrary table updates
  IF p_table_name IS NULL OR NOT (p_table_name = ANY(v_allowed_tables)) THEN
    RAISE EXCEPTION 'Restore not allowed for table %', p_table_name;
  END IF;

  -- Only admins can restore
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
  ) THEN
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
$$;

-- Restrict public execution explicitly
REVOKE ALL ON FUNCTION public.perform_soft_delete(TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_soft_deleted(TEXT, UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.perform_soft_delete(TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_soft_deleted(TEXT, UUID) TO authenticated;
