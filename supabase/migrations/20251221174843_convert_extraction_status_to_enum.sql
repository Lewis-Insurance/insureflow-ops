-- ============================================================================
-- Convert extraction_status from TEXT CHECK to extraction_confidence ENUM
-- ============================================================================
-- This migration converts all existing TEXT columns with CHECK constraints
-- to use the new extraction_confidence ENUM type for better type safety.

-- ============================================================================
-- WORKERS' COMPENSATION TABLES
-- ============================================================================

-- policy_wc_classifications
ALTER TABLE policy_wc_classifications
  DROP CONSTRAINT IF EXISTS policy_wc_classifications_extraction_status_check;
ALTER TABLE policy_wc_classifications
  ALTER COLUMN extraction_status TYPE extraction_confidence
  USING extraction_status::extraction_confidence;

-- policy_wc_officers
ALTER TABLE policy_wc_officers
  DROP CONSTRAINT IF EXISTS policy_wc_officers_extraction_status_check;
ALTER TABLE policy_wc_officers
  ALTER COLUMN extraction_status TYPE extraction_confidence
  USING extraction_status::extraction_confidence;

-- policy_wc_states
ALTER TABLE policy_wc_states
  DROP CONSTRAINT IF EXISTS policy_wc_states_extraction_status_check;
ALTER TABLE policy_wc_states
  ALTER COLUMN extraction_status TYPE extraction_confidence
  USING extraction_status::extraction_confidence;

-- policy_wc_experience_mods
ALTER TABLE policy_wc_experience_mods
  DROP CONSTRAINT IF EXISTS policy_wc_experience_mods_extraction_status_check;
ALTER TABLE policy_wc_experience_mods
  ALTER COLUMN extraction_status TYPE extraction_confidence
  USING extraction_status::extraction_confidence;

-- ============================================================================
-- COMMERCIAL AUTO (BAP) TABLES
-- ============================================================================

-- policy_bap_vehicles
ALTER TABLE policy_bap_vehicles
  DROP CONSTRAINT IF EXISTS policy_bap_vehicles_extraction_status_check;
ALTER TABLE policy_bap_vehicles
  ALTER COLUMN extraction_status TYPE extraction_confidence
  USING extraction_status::extraction_confidence;

-- policy_bap_drivers
ALTER TABLE policy_bap_drivers
  DROP CONSTRAINT IF EXISTS policy_bap_drivers_extraction_status_check;
ALTER TABLE policy_bap_drivers
  ALTER COLUMN extraction_status TYPE extraction_confidence
  USING extraction_status::extraction_confidence;

-- policy_bap_interests
ALTER TABLE policy_bap_interests
  DROP CONSTRAINT IF EXISTS policy_bap_interests_extraction_status_check;
ALTER TABLE policy_bap_interests
  ALTER COLUMN extraction_status TYPE extraction_confidence
  USING extraction_status::extraction_confidence;

-- policy_bap_coverages
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'policy_bap_coverages' 
    AND column_name = 'extraction_status'
    AND data_type = 'text'
  ) THEN
    ALTER TABLE policy_bap_coverages
      DROP CONSTRAINT IF EXISTS policy_bap_coverages_extraction_status_check;
    ALTER TABLE policy_bap_coverages
      ALTER COLUMN extraction_status TYPE extraction_confidence
      USING extraction_status::extraction_confidence;
  END IF;
END $$;

-- ============================================================================
-- COMMERCIAL GENERAL LIABILITY (CGL) TABLES
-- ============================================================================

-- policy_cgl_locations
ALTER TABLE policy_cgl_locations
  DROP CONSTRAINT IF EXISTS policy_cgl_locations_extraction_status_check;
ALTER TABLE policy_cgl_locations
  ALTER COLUMN extraction_status TYPE extraction_confidence
  USING extraction_status::extraction_confidence;

-- policy_cgl_classifications
ALTER TABLE policy_cgl_classifications
  DROP CONSTRAINT IF EXISTS policy_cgl_classifications_extraction_status_check;
ALTER TABLE policy_cgl_classifications
  ALTER COLUMN extraction_status TYPE extraction_confidence
  USING extraction_status::extraction_confidence;

-- policy_cgl_additional_insureds
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'policy_cgl_additional_insureds' 
    AND column_name = 'extraction_status'
    AND data_type = 'text'
  ) THEN
    ALTER TABLE policy_cgl_additional_insureds
      DROP CONSTRAINT IF EXISTS policy_cgl_additional_insureds_extraction_status_check;
    ALTER TABLE policy_cgl_additional_insureds
      ALTER COLUMN extraction_status TYPE extraction_confidence
      USING extraction_status::extraction_confidence;
  END IF;
END $$;

-- policy_cgl_additional_interests
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'policy_cgl_additional_interests' 
    AND column_name = 'extraction_status'
    AND data_type = 'text'
  ) THEN
    ALTER TABLE policy_cgl_additional_interests
      DROP CONSTRAINT IF EXISTS policy_cgl_additional_interests_extraction_status_check;
    ALTER TABLE policy_cgl_additional_interests
      ALTER COLUMN extraction_status TYPE extraction_confidence
      USING extraction_status::extraction_confidence;
  END IF;
END $$;

-- policy_cgl_endorsements
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'policy_cgl_endorsements' 
    AND column_name = 'extraction_status'
    AND data_type = 'text'
  ) THEN
    ALTER TABLE policy_cgl_endorsements
      DROP CONSTRAINT IF EXISTS policy_cgl_endorsements_extraction_status_check;
    ALTER TABLE policy_cgl_endorsements
      ALTER COLUMN extraction_status TYPE extraction_confidence
      USING extraction_status::extraction_confidence;
  END IF;
END $$;

-- ============================================================================
-- COMMERCIAL PROPERTY TABLES
-- ============================================================================

-- policy_property_locations
ALTER TABLE policy_property_locations
  DROP CONSTRAINT IF EXISTS policy_property_locations_extraction_status_check;
ALTER TABLE policy_property_locations
  ALTER COLUMN extraction_status TYPE extraction_confidence
  USING extraction_status::extraction_confidence;

-- policy_property_buildings
ALTER TABLE policy_property_buildings
  DROP CONSTRAINT IF EXISTS policy_property_buildings_extraction_status_check;
ALTER TABLE policy_property_buildings
  ALTER COLUMN extraction_status TYPE extraction_confidence
  USING extraction_status::extraction_confidence;

-- policy_property_building_coverages
ALTER TABLE policy_property_building_coverages
  DROP CONSTRAINT IF EXISTS policy_property_building_coverages_extraction_status_check;
ALTER TABLE policy_property_building_coverages
  ALTER COLUMN extraction_status TYPE extraction_confidence
  USING extraction_status::extraction_confidence;

-- policy_property_deductibles
ALTER TABLE policy_property_deductibles
  DROP CONSTRAINT IF EXISTS policy_property_deductibles_extraction_status_check;
ALTER TABLE policy_property_deductibles
  ALTER COLUMN extraction_status TYPE extraction_confidence
  USING extraction_status::extraction_confidence;

-- policy_property_interests
ALTER TABLE policy_property_interests
  DROP CONSTRAINT IF EXISTS policy_property_interests_extraction_status_check;
ALTER TABLE policy_property_interests
  ALTER COLUMN extraction_status TYPE extraction_confidence
  USING extraction_status::extraction_confidence;

-- policy_property_endorsements
ALTER TABLE policy_property_endorsements
  DROP CONSTRAINT IF EXISTS policy_property_endorsements_extraction_status_check;
ALTER TABLE policy_property_endorsements
  ALTER COLUMN extraction_status TYPE extraction_confidence
  USING extraction_status::extraction_confidence;

-- ============================================================================
-- COMMERCIAL UMBRELLA TABLES
-- ============================================================================

-- policy_umbrella_underlying
ALTER TABLE policy_umbrella_underlying
  DROP CONSTRAINT IF EXISTS policy_umbrella_underlying_extraction_status_check;
ALTER TABLE policy_umbrella_underlying
  ALTER COLUMN extraction_status TYPE extraction_confidence
  USING extraction_status::extraction_confidence;

-- policy_umbrella_requirements
ALTER TABLE policy_umbrella_requirements
  DROP CONSTRAINT IF EXISTS policy_umbrella_requirements_extraction_status_check;
ALTER TABLE policy_umbrella_requirements
  ALTER COLUMN extraction_status TYPE extraction_confidence
  USING extraction_status::extraction_confidence;

-- policy_umbrella_additional_insureds
ALTER TABLE policy_umbrella_additional_insureds
  DROP CONSTRAINT IF EXISTS policy_umbrella_additional_insureds_extraction_status_check;
ALTER TABLE policy_umbrella_additional_insureds
  ALTER COLUMN extraction_status TYPE extraction_confidence
  USING extraction_status::extraction_confidence;

-- policy_umbrella_endorsements
ALTER TABLE policy_umbrella_endorsements
  DROP CONSTRAINT IF EXISTS policy_umbrella_endorsements_extraction_status_check;
ALTER TABLE policy_umbrella_endorsements
  ALTER COLUMN extraction_status TYPE extraction_confidence
  USING extraction_status::extraction_confidence;

-- ============================================================================
-- Add comments for documentation
-- ============================================================================

COMMENT ON COLUMN policy_wc_classifications.extraction_status IS 'Confidence level for extracted field value. Uses extraction_confidence ENUM type.';
COMMENT ON COLUMN policy_wc_officers.extraction_status IS 'Confidence level for extracted field value. Uses extraction_confidence ENUM type.';
COMMENT ON COLUMN policy_wc_states.extraction_status IS 'Confidence level for extracted field value. Uses extraction_confidence ENUM type.';
COMMENT ON COLUMN policy_wc_experience_mods.extraction_status IS 'Confidence level for extracted field value. Uses extraction_confidence ENUM type.';

