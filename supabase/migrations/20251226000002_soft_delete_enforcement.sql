-- ============================================================================
-- SOFT DELETE ENFORCEMENT MIGRATION
-- ============================================================================
-- Purpose: Ensure soft deletes are used consistently across the application
-- This migration:
-- 1. Adds deleted_at columns where missing
-- 2. Creates RLS policies to hide soft-deleted records
-- 3. Adds triggers to prevent hard deletes on protected tables
-- ============================================================================

-- ============================================================================
-- HELPER FUNCTION: Prevent Hard Deletes
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow if deleted_at is already set (cleaning up already-deleted records)
  IF OLD.deleted_at IS NOT NULL THEN
    RETURN OLD;
  END IF;

  -- Prevent hard delete of active records
  RAISE EXCEPTION 'Hard deletes not allowed on table %. Use soft delete by setting deleted_at instead.', TG_TABLE_NAME
    USING HINT = 'UPDATE table SET deleted_at = NOW() WHERE id = ''...'';';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- HELPER FUNCTION: Soft Delete
-- ============================================================================

CREATE OR REPLACE FUNCTION public.soft_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Instead of deleting, set deleted_at
  UPDATE public.accounts SET deleted_at = NOW() WHERE id = OLD.id;
  RETURN NULL; -- Prevent the actual delete
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ADD DELETED_AT COLUMNS WHERE MISSING
-- ============================================================================

-- Ensure deleted_at column exists on key tables
-- NOTE: Only includes verified tables (leads table does not exist in this schema)
DO $$
DECLARE
  tables_to_check TEXT[] := ARRAY[
    'accounts', 'policies', 'quotes', 'tasks',
    'documents', 'communications', 'contacts'
  ];
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY tables_to_check
  LOOP
    -- Check if table exists first
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = tbl
    ) THEN
      -- Check if column exists
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = tbl
        AND column_name = 'deleted_at'
      ) THEN
        -- Add column if missing
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN deleted_at TIMESTAMPTZ', tbl);
        RAISE NOTICE 'Added deleted_at column to %', tbl;
      END IF;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- RLS POLICIES: Hide Soft-Deleted Records
-- Only creates policies for tables that exist and have RLS enabled
-- ============================================================================

DO $$
DECLARE
  policy_tables TEXT[] := ARRAY['accounts', 'documents', 'tasks', 'contacts'];
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY policy_tables
  LOOP
    -- Only create policy if table exists and has deleted_at column
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = tbl
      AND column_name = 'deleted_at'
    ) THEN
      -- Check if policy already exists
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = tbl
        AND policyname = 'hide_soft_deleted_' || tbl
      ) THEN
        -- Create the policy
        EXECUTE format(
          'CREATE POLICY hide_soft_deleted_%I ON %I FOR SELECT USING (deleted_at IS NULL)',
          tbl, tbl
        );
        RAISE NOTICE 'Created soft delete policy for %', tbl;
      END IF;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- TRIGGERS: Prevent Hard Deletes on Critical Tables
-- Only for tables that exist and have deleted_at column
-- ============================================================================

DO $$
DECLARE
  trigger_tables TEXT[] := ARRAY['accounts', 'policies', 'documents'];
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY trigger_tables
  LOOP
    -- Only create trigger if table exists and has deleted_at column
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = tbl
      AND column_name = 'deleted_at'
    ) THEN
      -- Drop existing trigger if any
      EXECUTE format('DROP TRIGGER IF EXISTS prevent_hard_delete_%I ON %I', tbl, tbl);
      -- Create the trigger
      EXECUTE format(
        'CREATE TRIGGER prevent_hard_delete_%I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete()',
        tbl, tbl
      );
      RAISE NOTICE 'Created hard delete prevention trigger for %', tbl;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- UPDATED_AT TRIGGER FUNCTION (if not exists)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- AUDIT LOG FOR DELETIONS (Optional but recommended)
-- ============================================================================

-- Create audit table for tracking soft deletes
CREATE TABLE IF NOT EXISTS public.deletion_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  deleted_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ DEFAULT NOW(),
  reason TEXT,
  metadata JSONB
);

-- Index for querying audit log
CREATE INDEX IF NOT EXISTS idx_deletion_audit_table_record
  ON deletion_audit_log(table_name, record_id);

CREATE INDEX IF NOT EXISTS idx_deletion_audit_deleted_by
  ON deletion_audit_log(deleted_by);

-- Enable RLS on audit log
ALTER TABLE deletion_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view deletion audit log
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'deletion_audit_log'
    AND policyname = 'admin_view_deletion_audit'
  ) THEN
    CREATE POLICY admin_view_deletion_audit ON deletion_audit_log
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role = 'admin'
        )
      );
  END IF;
END $$;

-- ============================================================================
-- HELPER FUNCTION: Perform Soft Delete with Audit
-- ============================================================================

CREATE OR REPLACE FUNCTION public.perform_soft_delete(
  p_table_name TEXT,
  p_record_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_deleted BOOLEAN := FALSE;
BEGIN
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- HELPER FUNCTION: Restore Soft-Deleted Record
-- ============================================================================

CREATE OR REPLACE FUNCTION public.restore_soft_deleted(
  p_table_name TEXT,
  p_record_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_restored BOOLEAN := FALSE;
BEGIN
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANT EXECUTE ON FUNCTIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.perform_soft_delete TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_soft_deleted TO authenticated;
