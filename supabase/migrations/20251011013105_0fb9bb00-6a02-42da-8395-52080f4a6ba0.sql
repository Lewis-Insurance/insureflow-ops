-- Add versioning support to certificates_of_insurance table
ALTER TABLE public.certificates_of_insurance
ADD COLUMN IF NOT EXISTS current_version integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS versions jsonb DEFAULT '[]'::jsonb;

-- Create function to append version to versions array
CREATE OR REPLACE FUNCTION public.append_coi_version(
  p_coi_id uuid,
  p_version_data jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.certificates_of_insurance
  SET versions = COALESCE(versions, '[]'::jsonb) || jsonb_build_array(p_version_data),
      updated_at = now()
  WHERE id = p_coi_id;
END;
$$;

-- Add comment
COMMENT ON FUNCTION public.append_coi_version IS 'Appends a new version entry to the COI versions array';