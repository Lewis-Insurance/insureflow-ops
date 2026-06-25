-- Admin user provisioning guardrails
-- Ensures app-level staff/admin profiles stay synchronized with agency workspace access.

-- -----------------------------------------------------------------------------
-- Explicit app-role -> tenant-role mapping used by admin provisioning.
-- profiles.role values: customer/staff/admin
-- agency_workspace_memberships.role values: owner/admin/producer/csr/accounting/viewer
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_membership_role_for_profile(p_profile_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE p_profile_role
    WHEN 'admin' THEN 'admin'
    WHEN 'staff' THEN 'producer'
    ELSE NULL
  END;
$$;

-- Security-definer RPC for edge functions. Service-role only.
-- For active staff/admin profiles, this ensures:
--   - an active membership exists in a valid active agency workspace
--   - profiles.default_agency_workspace_id points at that workspace
--   - profiles.is_staff = true
-- For non-staff/inactive profiles, this revokes active agency memberships
-- and clears staff/default flags on the profile row when it exists.
DROP FUNCTION IF EXISTS public.admin_sync_user_provisioning(uuid, text, uuid, uuid, boolean);
DROP FUNCTION IF EXISTS public.admin_sync_user_provisioning(uuid, text, uuid, uuid, boolean, boolean);

CREATE OR REPLACE FUNCTION public.admin_sync_user_provisioning(
  p_user_id uuid,
  p_profile_role text,
  p_actor_id uuid DEFAULT NULL,
  p_agency_workspace_id uuid DEFAULT NULL,
  p_profile_active boolean DEFAULT true,
  p_require_explicit_agency boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_membership_role text;
  v_agency_id uuid;
  v_existing_role text;
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required';
  END IF;

  IF p_profile_role NOT IN ('customer', 'staff', 'admin') THEN
    RAISE EXCEPTION 'Invalid profile role: %', p_profile_role;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = p_user_id) THEN
    RAISE EXCEPTION 'Auth user % does not exist', p_user_id;
  END IF;

  v_membership_role := public.admin_membership_role_for_profile(p_profile_role);

  IF p_profile_active IS TRUE AND v_membership_role IS NOT NULL THEN
    IF p_agency_workspace_id IS NOT NULL THEN
      SELECT aw.id INTO v_agency_id
      FROM public.agency_workspaces aw
      WHERE aw.id = p_agency_workspace_id
        AND aw.status = 'active';

      IF v_agency_id IS NULL THEN
        RAISE EXCEPTION 'invalid_agency_workspace: agencyWorkspaceId % is not an active agency workspace', p_agency_workspace_id;
      END IF;

      IF p_actor_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM public.agency_workspace_memberships awm
        WHERE awm.user_id = p_actor_id
          AND awm.agency_workspace_id = v_agency_id
          AND awm.status = 'active'
          AND awm.role IN ('owner', 'admin')
      ) THEN
        RAISE EXCEPTION 'agency_workspace_forbidden: acting admin cannot provision users in agencyWorkspaceId %', p_agency_workspace_id;
      END IF;
    END IF;

    IF p_require_explicit_agency IS TRUE AND v_agency_id IS NULL THEN
      RAISE EXCEPTION 'workspace_assignment_required: agencyWorkspaceId is required to provision % users', p_profile_role;
    END IF;

    IF v_agency_id IS NULL AND p_actor_id IS NOT NULL THEN
      SELECT p.default_agency_workspace_id INTO v_agency_id
      FROM public.profiles p
      JOIN public.agency_workspace_memberships awm
        ON awm.user_id = p_actor_id
       AND awm.agency_workspace_id = p.default_agency_workspace_id
       AND awm.status = 'active'
       AND awm.role IN ('owner', 'admin')
      JOIN public.agency_workspaces aw
        ON aw.id = awm.agency_workspace_id
       AND aw.status = 'active'
      WHERE p.id = p_actor_id
      LIMIT 1;
    END IF;

    IF v_agency_id IS NULL AND p_actor_id IS NOT NULL THEN
      SELECT awm.agency_workspace_id INTO v_agency_id
      FROM public.agency_workspace_memberships awm
      JOIN public.agency_workspaces aw
        ON aw.id = awm.agency_workspace_id
       AND aw.status = 'active'
      WHERE awm.user_id = p_actor_id
        AND awm.status = 'active'
        AND awm.role IN ('owner', 'admin')
      ORDER BY awm.created_at ASC
      LIMIT 1;
    END IF;

    -- No global first-workspace fallback: callers must provide an explicit
    -- workspace or an actor with an owner/admin workspace membership.

    IF v_agency_id IS NULL THEN
      RAISE EXCEPTION 'Cannot provision % user %: no active agency workspace is available', p_profile_role, p_user_id;
    END IF;

    SELECT awm.role INTO v_existing_role
    FROM public.agency_workspace_memberships awm
    WHERE awm.agency_workspace_id = v_agency_id
      AND awm.user_id = p_user_id;

    INSERT INTO public.agency_workspace_memberships (
      agency_workspace_id,
      user_id,
      role,
      status,
      invited_by,
      invited_at,
      accepted_at,
      created_at,
      updated_at
    ) VALUES (
      v_agency_id,
      p_user_id,
      v_membership_role,
      'active',
      p_actor_id,
      now(),
      now(),
      now(),
      now()
    )
    ON CONFLICT (agency_workspace_id, user_id) DO UPDATE SET
      role = CASE
        WHEN public.agency_workspace_memberships.role = 'owner' THEN 'owner'
        ELSE EXCLUDED.role
      END,
      status = 'active',
      invited_by = COALESCE(public.agency_workspace_memberships.invited_by, EXCLUDED.invited_by),
      invited_at = COALESCE(public.agency_workspace_memberships.invited_at, EXCLUDED.invited_at),
      accepted_at = COALESCE(public.agency_workspace_memberships.accepted_at, EXCLUDED.accepted_at, now()),
      updated_at = now();

    UPDATE public.profiles p
    SET is_staff = true,
        default_agency_workspace_id = v_agency_id,
        updated_at = now()
    WHERE p.id = p_user_id;

    SELECT awm.role INTO v_existing_role
    FROM public.agency_workspace_memberships awm
    WHERE awm.agency_workspace_id = v_agency_id
      AND awm.user_id = p_user_id;

    v_result := jsonb_build_object(
      'action', 'provisioned',
      'user_id', p_user_id,
      'profile_role', p_profile_role,
      'agency_workspace_id', v_agency_id,
      'membership_role', v_existing_role,
      'is_staff', true,
      'profile_active', true
    );
  ELSE
    UPDATE public.profiles p
    SET is_staff = false,
        default_agency_workspace_id = NULL,
        updated_at = now()
    WHERE p.id = p_user_id;

    UPDATE public.agency_workspace_memberships awm
    SET status = 'removed',
        updated_at = now()
    WHERE awm.user_id = p_user_id
      AND awm.status IN ('pending', 'active', 'suspended');

    v_result := jsonb_build_object(
      'action', 'deprovisioned',
      'user_id', p_user_id,
      'profile_role', p_profile_role,
      'agency_workspace_id', NULL,
      'membership_role', NULL,
      'is_staff', false,
      'profile_active', COALESCE(p_profile_active, false)
    );
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_sync_user_provisioning(uuid, text, uuid, uuid, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_sync_user_provisioning(uuid, text, uuid, uuid, boolean, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.admin_sync_user_provisioning(uuid, text, uuid, uuid, boolean, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_sync_user_provisioning(uuid, text, uuid, uuid, boolean, boolean) TO service_role;

-- Keep is_staff aligned with the current app roles and provisioning state.
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('staff', 'admin')
      AND COALESCE(p.is_staff, false) = true
      AND COALESCE(p.status, 'active') = 'active'
      AND p.deleted_at IS NULL
      AND p.default_agency_workspace_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.agency_workspace_memberships awm
        JOIN public.agency_workspaces aw
          ON aw.id = awm.agency_workspace_id
         AND aw.status = 'active'
        WHERE awm.user_id = p.id
          AND awm.agency_workspace_id = p.default_agency_workspace_id
          AND awm.status = 'active'
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;

-- -----------------------------------------------------------------------------
-- Constraint trigger: active staff/admin profiles must be fully provisioned.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_active_staff_profile_provisioned_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role text;
  v_status text;
  v_deleted_at timestamptz;
  v_default_agency_workspace_id uuid;
  v_is_staff boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT p.role,
         COALESCE(p.status, 'active'),
         p.deleted_at,
         p.default_agency_workspace_id,
         COALESCE(p.is_staff, false)
  INTO v_role,
       v_status,
       v_deleted_at,
       v_default_agency_workspace_id,
       v_is_staff
  FROM public.profiles p
  WHERE p.id = p_user_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_role IN ('staff', 'admin')
     AND v_status = 'active'
     AND v_deleted_at IS NULL THEN
    IF v_is_staff IS NOT TRUE THEN
      RAISE EXCEPTION 'Active % profile % must have is_staff=true', v_role, p_user_id;
    END IF;

    IF v_default_agency_workspace_id IS NULL THEN
      RAISE EXCEPTION 'Active % profile % must have a default agency workspace', v_role, p_user_id;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.agency_workspace_memberships awm
      JOIN public.agency_workspaces aw
        ON aw.id = awm.agency_workspace_id
       AND aw.status = 'active'
      WHERE awm.user_id = p_user_id
        AND awm.agency_workspace_id = v_default_agency_workspace_id
        AND awm.status = 'active'
    ) THEN
      RAISE EXCEPTION 'Active % profile % must have an active membership in default agency workspace %',
        v_role, p_user_id, v_default_agency_workspace_id;
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_active_staff_profile_provisioned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_TABLE_NAME = 'profiles' THEN
    PERFORM public.assert_active_staff_profile_provisioned_for_user(NEW.id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.assert_active_staff_profile_provisioned_for_user(OLD.user_id);
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      PERFORM public.assert_active_staff_profile_provisioned_for_user(NEW.user_id);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.assert_active_staff_profile_provisioned_for_user(OLD.user_id);
    RETURN OLD;
  ELSE
    PERFORM public.assert_active_staff_profile_provisioned_for_user(NEW.user_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS enforce_active_staff_profile_provisioning ON public.profiles;
CREATE CONSTRAINT TRIGGER enforce_active_staff_profile_provisioning
  AFTER INSERT OR UPDATE OF role, status, deleted_at, default_agency_workspace_id, is_staff
  ON public.profiles
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.assert_active_staff_profile_provisioned();

DROP TRIGGER IF EXISTS enforce_active_staff_profile_membership_change ON public.agency_workspace_memberships;
CREATE CONSTRAINT TRIGGER enforce_active_staff_profile_membership_change
  AFTER INSERT OR UPDATE OF user_id, agency_workspace_id, status, role
  ON public.agency_workspace_memberships
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.assert_active_staff_profile_provisioned();

DROP TRIGGER IF EXISTS enforce_active_staff_profile_membership_delete ON public.agency_workspace_memberships;
CREATE CONSTRAINT TRIGGER enforce_active_staff_profile_membership_delete
  AFTER DELETE
  ON public.agency_workspace_memberships
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.assert_active_staff_profile_provisioned();

CREATE OR REPLACE FUNCTION public.assert_agency_workspace_staff_defaults_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' THEN
    IF EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.default_agency_workspace_id = NEW.id
        AND p.role IN ('staff', 'admin')
        AND COALESCE(p.status, 'active') = 'active'
        AND p.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Cannot mark agency workspace % inactive while active staff/admin profiles use it as their default', NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_staff_default_agency_active ON public.agency_workspaces;
CREATE CONSTRAINT TRIGGER enforce_staff_default_agency_active
  AFTER UPDATE OF status
  ON public.agency_workspaces
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.assert_agency_workspace_staff_defaults_active();

-- Validate existing data without mutating it. If this raises, repair the listed
-- active staff/admin provisioning data intentionally before deploying guardrails.
DO $$
DECLARE
  v_invalid_count integer;
BEGIN
  SELECT COUNT(*) INTO v_invalid_count
  FROM public.profiles p
  WHERE p.role IN ('staff', 'admin')
    AND COALESCE(p.status, 'active') = 'active'
    AND p.deleted_at IS NULL
    AND (
      COALESCE(p.is_staff, false) IS NOT TRUE
      OR p.default_agency_workspace_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.agency_workspace_memberships awm
        JOIN public.agency_workspaces aw
          ON aw.id = awm.agency_workspace_id
         AND aw.status = 'active'
        WHERE awm.user_id = p.id
          AND awm.agency_workspace_id = p.default_agency_workspace_id
          AND awm.status = 'active'
      )
    );

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Cannot install admin provisioning guardrails: % active staff/admin profiles are not fully provisioned', v_invalid_count;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- AO Renewals RLS cleanup: remove legacy permissive policies that predated the
-- membership-based policies in 20260421100000_ao_renewals_followup_and_rls.sql.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view ao_renewals" ON public.ao_renewals;
DROP POLICY IF EXISTS "Users can insert ao_renewals" ON public.ao_renewals;
DROP POLICY IF EXISTS "Users can update ao_renewals" ON public.ao_renewals;
DROP POLICY IF EXISTS "Users can delete ao_renewals" ON public.ao_renewals;
DROP POLICY IF EXISTS "Allow all select on ao_renewals" ON public.ao_renewals;
DROP POLICY IF EXISTS "Allow all insert on ao_renewals" ON public.ao_renewals;
DROP POLICY IF EXISTS "Allow all update on ao_renewals" ON public.ao_renewals;
DROP POLICY IF EXISTS "Allow all delete on ao_renewals" ON public.ao_renewals;
DROP POLICY IF EXISTS "Authenticated users can view ao_renewals" ON public.ao_renewals;
DROP POLICY IF EXISTS "Authenticated users can insert ao_renewals" ON public.ao_renewals;
DROP POLICY IF EXISTS "Authenticated users can update ao_renewals" ON public.ao_renewals;
DROP POLICY IF EXISTS "Authenticated users can delete ao_renewals" ON public.ao_renewals;

COMMENT ON FUNCTION public.admin_sync_user_provisioning(uuid, text, uuid, uuid, boolean, boolean)
  IS 'Admin-only provisioning helper that synchronizes profile staff/admin roles with agency workspace membership/defaults.';
COMMENT ON FUNCTION public.assert_active_staff_profile_provisioned()
  IS 'Constraint trigger helper enforcing active staff/admin profile provisioning invariants.';
