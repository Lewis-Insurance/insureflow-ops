-- is_staff_member_of(p_user_id, p_agency_id): service-role staff+workspace check
-- for the Floor COI/ID-card release path (audit finding, MAJOR).
--
-- send-coi-email's Floor service-release path invokes with an anon-key
-- Authorization (no user JWT), so auth.uid() is null and the standard is_staff() /
-- is_agency_member() checks (both auth.uid()-based) always return false -> the Floor
-- path could never actually send. This helper takes the approving human's id
-- EXPLICITLY (from the floor approval marker) and verifies, with the service role,
-- that they are an active staff member OF THE CERTIFICATE'S WORKSPACE. The staff
-- predicate mirrors is_staff()'s core (role in staff/admin, is_staff flag, active,
-- not deleted); the workspace predicate is scoped to the passed agency (stronger and
-- more relevant here than is_staff()'s default-workspace membership check).
-- Idempotent (CREATE OR REPLACE); revoked from anon/public.

create or replace function public.is_staff_member_of(p_user_id uuid, p_agency_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    p_user_id is not null
    and p_agency_id is not null
    and exists (
      select 1 from public.profiles p
      where p.id = p_user_id
        and p.role in ('staff', 'admin')
        and coalesce(p.is_staff, false) = true
        and coalesce(p.status, 'active') = 'active'
        and p.deleted_at is null
    )
    and exists (
      select 1 from public.agency_workspace_memberships awm
      where awm.user_id = p_user_id
        and awm.agency_workspace_id = p_agency_id
        and awm.status = 'active'
    );
$function$;

comment on function public.is_staff_member_of(uuid, uuid) is
  'Service-role staff+workspace check taking the user id explicitly (auth.uid()-free), for the Floor service-release send path where the caller has no user JWT. True when p_user_id is an active staff profile AND an active member of p_agency_id.';

revoke execute on function public.is_staff_member_of(uuid, uuid) from anon, public;
grant  execute on function public.is_staff_member_of(uuid, uuid) to authenticated, service_role;
