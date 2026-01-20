-- Migration: Fix document_type check constraint
-- Description: Add missing document types that the UI uses (other, claims, billing, etc.)
-- Date: 2026-01-20
-- Issue: Uploading documents with type "Other" fails with constraint violation

-- ============================================================================
-- FIX DOCUMENT TYPE CONSTRAINT
-- ============================================================================

-- Drop existing constraint
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_document_type_check;

-- Add updated constraint with all valid values from UI
ALTER TABLE documents ADD CONSTRAINT documents_document_type_check
  CHECK (document_type IS NULL OR document_type IN (
    -- Original values from migration 20251204000003
    'policy', 'quote', 'dec_page', 'endorsement', 'claim_form', 'coi', 'bill',
    'loss_run', 'application', 'renewal', 'cancellation', 'binder', 'certificate',
    'inspection', 'unknown',
    -- Additional values used by UI (AddDocumentModal.tsx, EditDocumentModal.tsx)
    'other',           -- "Other" option in dropdown
    'claims',          -- "Claims Document" in AddDocumentModal
    'claim',           -- "Claim Document" in EditDocumentModal
    'billing',         -- "Billing Statement" in AddDocumentModal
    'invoice',         -- "Invoice" in EditDocumentModal
    'correspondence',  -- "Correspondence" option
    'id_card',         -- "ID Card" in AddDocumentModal
    'id'               -- "ID / License" in EditDocumentModal
  ));

COMMENT ON COLUMN documents.document_type IS 'Type of document - includes policy, quote, dec_page, endorsement, coi, claims, billing, correspondence, id_card, other, etc.';

-- ============================================================================
-- ROLLBACK SCRIPT (for reference)
-- ============================================================================
-- To rollback this migration, restore the original constraint:
--
-- ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_document_type_check;
-- ALTER TABLE documents ADD CONSTRAINT documents_document_type_check
--   CHECK (document_type IS NULL OR document_type IN (
--     'policy', 'quote', 'dec_page', 'endorsement', 'claim_form', 'coi', 'bill',
--     'loss_run', 'application', 'renewal', 'cancellation', 'binder', 'certificate',
--     'inspection', 'unknown'
--   ));
