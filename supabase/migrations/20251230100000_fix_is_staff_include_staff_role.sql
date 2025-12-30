-- Fix is_staff() function to include 'staff' role
-- The 'staff' role was accidentally removed in previous migration

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
    AND (
      is_staff = true
      OR role IN ('staff', 'admin', 'owner', 'agent', 'producer', 'csr', 'accounting')
    )
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;

-- Verify fix worked
DO $$
DECLARE
  staff_count INT;
BEGIN
  SELECT COUNT(*) INTO staff_count
  FROM public.profiles
  WHERE role IN ('staff', 'admin', 'owner', 'agent', 'producer', 'csr', 'accounting');

  RAISE NOTICE 'Users with staff-like roles: %', staff_count;
END $$;
