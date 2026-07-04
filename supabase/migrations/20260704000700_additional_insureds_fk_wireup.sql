-- Phase 4 migration 6 of 6 (the LAST Phase 4 migration): the FK wire-up.
--
-- Wires the five per-policy additional_insured / interest tables' existing
-- additional_insured_id columns to the agency-wide directory table
-- public.additional_insureds. This is CONSTRAINT-ONLY work: every one of the five
-- additional_insured_id columns already exists on prod (shipped column-only by the
-- master COI endorsement-status migration, 20260702170000, because
-- additional_insureds did not yet exist at that point), so there is NO ADD COLUMN
-- anywhere in this file.
--
-- Why this migration is load-bearing and MUST run last:
--   The additional_insureds merge engine (_do_additional_insured_merge) discovers
--   which child tables reference a holder by introspecting pg_constraint for
--   foreign keys whose confrelid is public.additional_insureds. Without these five
--   FK constraints, the per-policy link columns are invisible to that reparent
--   loop, and after a holder merge the per-policy rows would keep pointing at a
--   tombstoned loser id, silently breaking the additional_insured_id match path in
--   resolve_holder_endorsements. These constraints make the links discoverable, so
--   a merge auto-reparents them to the survivor.
--
-- Sequencing: after 20260704000000 (the additional_insureds table exists) AND after
-- the Phase-2/3 column-add (already on prod). Placed last in Phase 4 so
-- _do_additional_insured_merge never runs before the FKs exist.
--
-- ON DELETE SET NULL: a per-policy row is an annotation on a policy, not owned by
-- the directory row. A service-role hard delete of a directory holder clears the
-- link rather than blocking (RESTRICT) or removing the policy annotation (CASCADE).
--
-- Idempotent: each ADD CONSTRAINT is wrapped in a DO-block that guards on
-- pg_constraint (conname + conrelid), so re-running this migration is a no-op and
-- the FK count stays at exactly five.
--
-- Baseline verified live against prod lrqajzwcmdwahnjyidgv (2026-07-03): all five
-- additional_insured_id columns present, ZERO foreign keys referencing
-- additional_insureds. Post-migration the count must go 0 -> 5.

-- ---------------------------------------------------------------------------
-- 1) policy_cgl_additional_insureds.additional_insured_id -> additional_insureds
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_policy_cgl_additional_insureds_additional_insured'
      and conrelid = 'public.policy_cgl_additional_insureds'::regclass
  ) then
    alter table public.policy_cgl_additional_insureds
      add constraint fk_policy_cgl_additional_insureds_additional_insured
      foreign key (additional_insured_id)
      references public.additional_insureds(id)
      on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) policy_umbrella_additional_insureds.additional_insured_id -> additional_insureds
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_policy_umbrella_additional_insureds_additional_insured'
      and conrelid = 'public.policy_umbrella_additional_insureds'::regclass
  ) then
    alter table public.policy_umbrella_additional_insureds
      add constraint fk_policy_umbrella_additional_insureds_additional_insured
      foreign key (additional_insured_id)
      references public.additional_insureds(id)
      on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3) policy_bap_interests.additional_insured_id -> additional_insureds
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_policy_bap_interests_additional_insured'
      and conrelid = 'public.policy_bap_interests'::regclass
  ) then
    alter table public.policy_bap_interests
      add constraint fk_policy_bap_interests_additional_insured
      foreign key (additional_insured_id)
      references public.additional_insureds(id)
      on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4) policy_property_interests.additional_insured_id -> additional_insureds
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_policy_property_interests_additional_insured'
      and conrelid = 'public.policy_property_interests'::regclass
  ) then
    alter table public.policy_property_interests
      add constraint fk_policy_property_interests_additional_insured
      foreign key (additional_insured_id)
      references public.additional_insureds(id)
      on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5) policy_wc_subrogation_waivers.additional_insured_id -> additional_insureds
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_policy_wc_subrogation_waivers_additional_insured'
      and conrelid = 'public.policy_wc_subrogation_waivers'::regclass
  ) then
    alter table public.policy_wc_subrogation_waivers
      add constraint fk_policy_wc_subrogation_waivers_additional_insured
      foreign key (additional_insured_id)
      references public.additional_insureds(id)
      on delete set null;
  end if;
end $$;
