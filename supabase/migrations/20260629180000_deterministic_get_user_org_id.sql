-- Make org resolution deterministic. The previous version picked an arbitrary
-- active membership (LIMIT 1, no ORDER BY), so multi-membership staff could
-- resolve to a personal/stray workspace, scattering writes (e.g. payments). Now
-- we prefer the user's explicit default workspace, then a deterministically
-- ordered membership, then the default as a last resort.
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_default UUID;
  v_org UUID;
BEGIN
  SELECT p.default_agency_workspace_id INTO v_default
  FROM public.profiles p
  WHERE p.id = auth.uid();

  -- Prefer the configured default when the user actively belongs to it.
  IF v_default IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.agency_workspace_memberships awm
    WHERE awm.user_id = auth.uid()
      AND awm.status = 'active'
      AND awm.agency_workspace_id = v_default
  ) THEN
    RETURN v_default;
  END IF;

  -- Otherwise pick a deterministic active membership (default first, then by id).
  SELECT awm.agency_workspace_id INTO v_org
  FROM public.agency_workspace_memberships awm
  WHERE awm.user_id = auth.uid()
    AND awm.status = 'active'
  ORDER BY (awm.agency_workspace_id = v_default) DESC, awm.agency_workspace_id ASC
  LIMIT 1;

  RETURN COALESCE(v_org, v_default);
END;
$function$;
