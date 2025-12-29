-- Bulk Import Enhancements Migration
-- Adds columns needed for tracking source IDs and rollback support

-- 1. Add import tracking columns to core tables (for rollback support)
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES import_batches(id);
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES import_batches(id);
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES import_batches(id);

-- 2. Add source tracking to import_staging for master_id mapping
ALTER TABLE public.import_staging ADD COLUMN IF NOT EXISTS source_id TEXT;
ALTER TABLE public.import_staging ADD COLUMN IF NOT EXISTS record_type TEXT;
ALTER TABLE public.import_staging ADD COLUMN IF NOT EXISTS skip_reason TEXT;

-- 3. Add custom JSONB field to accounts for secondary phones/emails
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS custom JSONB DEFAULT '{}';

-- 4. Add source field to accounts for tracking import origin
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS source TEXT;

-- 5. Create indexes for import tracking
CREATE INDEX IF NOT EXISTS idx_accounts_import_batch ON accounts(import_batch_id) WHERE import_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_import_batch ON contacts(import_batch_id) WHERE import_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_policies_import_batch ON policies(import_batch_id) WHERE import_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_import_staging_source_id ON import_staging(source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_import_staging_record_type ON import_staging(batch_id, record_type);

-- 6. Create rollback function for bulk imports
CREATE OR REPLACE FUNCTION public.rollback_import_batch(p_batch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_accounts_deleted INTEGER := 0;
  v_contacts_deleted INTEGER := 0;
  v_policies_deleted INTEGER := 0;
BEGIN
  -- Soft delete accounts from this batch
  UPDATE accounts
  SET deleted_at = now()
  WHERE import_batch_id = p_batch_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_accounts_deleted = ROW_COUNT;

  -- Soft delete contacts from this batch
  UPDATE contacts
  SET deleted_at = now()
  WHERE import_batch_id = p_batch_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_contacts_deleted = ROW_COUNT;

  -- Soft delete policies from this batch
  UPDATE policies
  SET deleted_at = now()
  WHERE import_batch_id = p_batch_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_policies_deleted = ROW_COUNT;

  -- Update batch status
  UPDATE import_batches
  SET status = 'rolled_back'
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'batch_id', p_batch_id,
    'accounts_deleted', v_accounts_deleted,
    'contacts_deleted', v_contacts_deleted,
    'policies_deleted', v_policies_deleted,
    'rolled_back_at', now()
  );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.rollback_import_batch(UUID) TO authenticated;
