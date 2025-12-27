-- ============================================================================
-- ADD UNIQUE CONSTRAINT TO CANOPY DOCUMENTS
-- ============================================================================
-- Required for upsert operations on document import
-- ============================================================================

-- Add unique constraint on (policy_id, file_url) for document deduplication
ALTER TABLE canopy_documents
  ADD CONSTRAINT canopy_documents_policy_url_unique
  UNIQUE (policy_id, file_url);

-- Also add a unique constraint for canopy_policy_id in case of re-imports
CREATE UNIQUE INDEX IF NOT EXISTS idx_canopy_policies_canopy_id
  ON canopy_policies(canopy_policy_id)
  WHERE canopy_policy_id IS NOT NULL;
