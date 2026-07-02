-- ============================================================================
-- THE FLOOR — ensure pg_trgm in extensions schema
-- Idempotent: pg_trgm may already exist from earlier migrations.
-- Staged only. Do not apply to prod until Brian clears Phase 0 blockers.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS extensions;

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    ALTER EXTENSION pg_trgm SET SCHEMA extensions;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_trgm schema move skipped: %', SQLERRM;
END;
$$;
