-- ============================================================================
-- Create extraction_confidence ENUM Type
-- ============================================================================
-- This migration creates the extraction_confidence ENUM type as specified
-- in the system architecture document. This provides better type safety than
-- TEXT with CHECK constraints.

-- Create the ENUM type
CREATE TYPE extraction_confidence AS ENUM (
  'AUTO_APPLIED',      -- 95%+ confidence, auto-populated, no review needed
  'NEEDS_REVIEW',      -- 70-95%, human verification required
  'NEEDS_VERIFICATION', -- 70-79%, needs verification
  'LOW_CONFIDENCE',    -- <70%, flagged for attention
  'NOT_FOUND',         -- Field missing in document
  'CONFLICT',          -- Multiple conflicting values detected
  'MANUAL'             -- Human override or direct entry
);

-- Add comment for documentation
COMMENT ON TYPE extraction_confidence IS 'Confidence level for extracted insurance policy fields. Used for review queue assignment and quality tracking.';

