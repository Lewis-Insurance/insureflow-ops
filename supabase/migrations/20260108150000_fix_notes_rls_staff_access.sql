-- Fix notes RLS access for staff users
-- Issue: Staff users cannot add notes due to is_staff() function not working correctly
-- Note: Production uses user_profiles table, not profiles

-- Step 1: Fix the is_staff() function to use the correct table (user_profiles)
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
    AND is_active = true
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff() TO anon;

-- Step 2: Update the notes_write policy to use is_staff()
DROP POLICY IF EXISTS "notes_write" ON public.notes;

CREATE POLICY "notes_write" ON public.notes FOR INSERT WITH CHECK (
  -- Staff members can add notes to any account
  is_staff()
);

-- Step 3: Add UPDATE policy for notes (staff can update any note)
DROP POLICY IF EXISTS "notes_update" ON public.notes;

CREATE POLICY "notes_update" ON public.notes FOR UPDATE USING (
  is_staff()
);

-- Step 4: Add DELETE policy for notes (staff can delete)
DROP POLICY IF EXISTS "notes_delete" ON public.notes;

CREATE POLICY "notes_delete" ON public.notes FOR DELETE USING (
  is_staff()
);
