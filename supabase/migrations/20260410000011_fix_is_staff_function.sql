-- Fix is_staff() function to use profiles table instead of user_profiles
-- The user_profiles table doesn't exist in production - profiles is the correct table

-- Drop and recreate is_staff function to use profiles table
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND (is_staff = true OR role IN ('admin', 'agent', 'producer', 'csr'))
  );
END;
$$;

-- Also fix get_user_org_id if it exists and references user_profiles
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  org_id UUID;
BEGIN
  -- Try to get from agency_workspace_memberships first (new model)
  SELECT awm.agency_workspace_id INTO org_id
  FROM public.agency_workspace_memberships awm
  WHERE awm.user_id = auth.uid()
  AND awm.status = 'active'
  LIMIT 1;

  IF org_id IS NOT NULL THEN
    RETURN org_id;
  END IF;

  -- Fallback to profiles.default_agency_workspace_id
  SELECT p.default_agency_workspace_id INTO org_id
  FROM public.profiles p
  WHERE p.id = auth.uid();

  RETURN org_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_org_id() TO authenticated;
