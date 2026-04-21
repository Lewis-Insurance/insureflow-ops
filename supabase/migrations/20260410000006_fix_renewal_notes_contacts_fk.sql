-- Fix foreign key relationships for renewal_notes and renewal_contact_log
-- These tables reference auth.users(id) but queries expect profiles(id) joins
-- Since profiles.id = auth.users.id (via FK), this is safe to add

-- =============================================================================
-- PART 1: Add FK from renewal_notes.created_by to profiles.id
-- =============================================================================

ALTER TABLE public.renewal_notes
  DROP CONSTRAINT IF EXISTS renewal_notes_created_by_profiles_fkey;

ALTER TABLE public.renewal_notes
  ADD CONSTRAINT renewal_notes_created_by_profiles_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id)
  ON DELETE CASCADE;

-- =============================================================================
-- PART 2: Add FK from renewal_contact_log.contacted_by to profiles.id
-- =============================================================================

ALTER TABLE public.renewal_contact_log
  DROP CONSTRAINT IF EXISTS renewal_contact_log_contacted_by_profiles_fkey;

ALTER TABLE public.renewal_contact_log
  ADD CONSTRAINT renewal_contact_log_contacted_by_profiles_fkey
  FOREIGN KEY (contacted_by) REFERENCES public.profiles(id)
  ON DELETE CASCADE;

-- =============================================================================
-- Summary
-- =============================================================================
-- These FK constraints enable PostgREST to join with profiles table using:
--   profiles!created_by (for renewal_notes)
--   profiles!contacted_by (for renewal_contact_log)
-- This fixes the "Failed to load notes" and "Failed to load contact log" errors
