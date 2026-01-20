-- Migration: Add Trust/Estate Support for Named Insureds
-- Description: Adds columns to accounts table to support trusts and estates as named insureds
-- Date: 2026-01-20

-- ============================================================================
-- PRIMARY INSURED ENTITY FIELDS
-- ============================================================================

-- Entity type for primary insured (NULL = individual only)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS primary_entity_type TEXT;

-- Add check constraint for valid entity types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'accounts_primary_entity_type_check'
  ) THEN
    ALTER TABLE accounts ADD CONSTRAINT accounts_primary_entity_type_check
      CHECK (primary_entity_type IS NULL OR primary_entity_type IN ('trust', 'estate'));
  END IF;
END $$;

-- Entity name (e.g., "The Smith Family Trust" or "Estate of John Smith")
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS primary_entity_name TEXT;

-- Trustee name (e.g., "Brian Lewis, Trustee") - only applicable for trusts
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS trustee_name TEXT;

-- Trust formation date (optional)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS trust_date DATE;

-- ============================================================================
-- SECONDARY INSURED ENTITY FIELDS
-- ============================================================================

-- Entity type for secondary insured
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS secondary_entity_type TEXT;

-- Add check constraint for valid entity types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'accounts_secondary_entity_type_check'
  ) THEN
    ALTER TABLE accounts ADD CONSTRAINT accounts_secondary_entity_type_check
      CHECK (secondary_entity_type IS NULL OR secondary_entity_type IN ('trust', 'estate'));
  END IF;
END $$;

-- Secondary entity name
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS secondary_entity_name TEXT;

-- ============================================================================
-- DOCUMENTATION
-- ============================================================================

COMMENT ON COLUMN accounts.primary_entity_type IS 'Type of entity for primary insured: trust, estate, or NULL (individual only)';
COMMENT ON COLUMN accounts.primary_entity_name IS 'Name of trust/estate for primary insured (e.g., "The Smith Family Trust")';
COMMENT ON COLUMN accounts.trustee_name IS 'Trustee name for primary insured trust (e.g., "Brian Lewis, Trustee")';
COMMENT ON COLUMN accounts.trust_date IS 'Formation date of the trust (optional)';
COMMENT ON COLUMN accounts.secondary_entity_type IS 'Type of entity for secondary insured: trust, estate, or NULL (individual only)';
COMMENT ON COLUMN accounts.secondary_entity_name IS 'Name of trust/estate for secondary insured';

-- ============================================================================
-- ROLLBACK SCRIPT (for reference)
-- ============================================================================
-- To rollback this migration, run:
--
-- ALTER TABLE accounts DROP COLUMN IF EXISTS primary_entity_type;
-- ALTER TABLE accounts DROP COLUMN IF EXISTS primary_entity_name;
-- ALTER TABLE accounts DROP COLUMN IF EXISTS trustee_name;
-- ALTER TABLE accounts DROP COLUMN IF EXISTS trust_date;
-- ALTER TABLE accounts DROP COLUMN IF EXISTS secondary_entity_type;
-- ALTER TABLE accounts DROP COLUMN IF EXISTS secondary_entity_name;
