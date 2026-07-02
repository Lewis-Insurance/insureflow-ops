-- =============================================================================
-- Master COI Phase 3 (data layer) — Migration 1 of 3
-- Endorsement three-state status on the four AI/interest tables +
-- the new policy_wc_subrogation_waivers table.
--
-- Spec: docs/COI Module/coi-module/02-master-coi-data-layer.md
--   Section 4.2  extend the four existing tables (endorsement_status three-state,
--                confirmed_at/by, additional_insured_id column-only, umbrella
--                endorsement_form + dates, bap/property waiver/PNC/blanket/form/date,
--                backfills, DO-block-guarded scope CHECKs, status indexes)
--   Section 4.3  CREATE policy_wc_subrogation_waivers (+ updated_at trigger)
--   Section 4.4  workspace scoping + RLS for the new table
-- Workspace posture: docs/COI Module/coi-module/01-disposition-and-roadmap.md §4.5
--   every new table carries agency_workspace_id NOT NULL (server-derived) with
--   is_staff() AND is_agency_member(agency_workspace_id) RLS.
--
-- Ground truth verified against live prod (lrqajzwcmdwahnjyidgv) 2026-07-02:
--   * The four tables exist; endorsement_status / additional_insured_id absent on all.
--   * policy_cgl_additional_insureds already carries endorsement_form + effective_date
--     + expiration_date; umbrella has neither; bap/property have neither ai_type/waiver/
--     PNC/blanket/endorsement.
--   * extraction_status is enum type "extraction_confidence" whose labels include
--     AUTO_APPLIED on all four tables, so the AUTO_APPLIED backfill is safe.
--   * policy_wc_subrogation_waivers does NOT exist; is_staff() / is_agency_member(uuid)
--     / normalize_entity_name(text) all exist.
--   * additional_insureds does NOT exist yet (Phase 4) -> additional_insured_id ships
--     as a plain nullable column with NO FK (per 02 §4.6 / 01 R12); the directory
--     wire-up migration adds the FK later.
--
-- Idempotent: every column is ADD COLUMN IF NOT EXISTS; every ADD CONSTRAINT is
-- DO-block IF NOT EXISTS guarded; indexes/functions are IF NOT EXISTS / OR REPLACE.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) GL: policy_cgl_additional_insureds
--    already has ai_type, waiver_of_subrogation, endorsement_form, per-AI dates
-- ---------------------------------------------------------------------------
alter table public.policy_cgl_additional_insureds
  add column if not exists endorsement_status text not null default 'requested'
    check (endorsement_status in ('none','requested','endorsed')),
  add column if not exists endorsement_confirmed_at timestamptz,
  add column if not exists endorsement_confirmed_by uuid references auth.users(id),
  add column if not exists additional_insured_id uuid;   -- column only; FK shipped by the directory wire-up, Section 4.6

-- Backfill: rows extracted from the policy document itself, or carrying a form
-- reference, are evidence the endorsement exists.
update public.policy_cgl_additional_insureds
   set endorsement_status = 'endorsed'
 where endorsement_form is not null
    or extraction_status = 'AUTO_APPLIED';

-- ---------------------------------------------------------------------------
-- 2) Umbrella: policy_umbrella_additional_insureds
--    has ai_type + waiver but NO endorsement_form and NO dates today
-- ---------------------------------------------------------------------------
alter table public.policy_umbrella_additional_insureds
  add column if not exists endorsement_form text,
  add column if not exists effective_date date,
  add column if not exists expiration_date date,
  add column if not exists endorsement_status text not null default 'requested'
    check (endorsement_status in ('none','requested','endorsed')),
  add column if not exists endorsement_confirmed_at timestamptz,
  add column if not exists endorsement_confirmed_by uuid references auth.users(id),
  add column if not exists additional_insured_id uuid;

-- Backfill grants 'endorsed' ONLY to document-evidenced rows. follow_underlying
-- rows deliberately STAY 'requested': an extractor classification is not an
-- endorsement artifact. They get one-click human confirm via set_line_ai_endorsement
-- (a follow-form provision in the actual policy text satisfies rule 4's evidence
-- test when a human confirms it). AUTO_APPLIED-only by design.
update public.policy_umbrella_additional_insureds
   set endorsement_status = 'endorsed'
 where extraction_status = 'AUTO_APPLIED';

-- ---------------------------------------------------------------------------
-- 3) Auto: policy_bap_interests
--    lacks ai_type, waiver, P&NC, endorsement reference entirely
-- ---------------------------------------------------------------------------
alter table public.policy_bap_interests
  add column if not exists waiver_of_subrogation boolean not null default false,
  add column if not exists primary_noncontributory boolean not null default false,
  add column if not exists blanket boolean not null default false,   -- Section 4.7.2 scope mapping
  add column if not exists endorsement_status text not null default 'none'
    check (endorsement_status in ('none','requested','endorsed')),
  add column if not exists endorsement_form text,
  add column if not exists endorsement_effective_date date,
  add column if not exists endorsement_confirmed_at timestamptz,
  add column if not exists endorsement_confirmed_by uuid references auth.users(id),
  add column if not exists additional_insured_id uuid;

update public.policy_bap_interests
   set endorsement_status = case when extraction_status = 'AUTO_APPLIED' then 'endorsed' else 'requested' end
 where interest_type = 'additional_insured';

-- Non-AI interest rows must stay 'none' (DO-block guard: ADD CONSTRAINT has no IF NOT EXISTS)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'bap_interests_ai_status_scope'
      and conrelid = 'public.policy_bap_interests'::regclass
  ) then
    alter table public.policy_bap_interests
      add constraint bap_interests_ai_status_scope
      check (interest_type = 'additional_insured' or endorsement_status = 'none');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4) Property: policy_property_interests, same gap as Auto
-- ---------------------------------------------------------------------------
alter table public.policy_property_interests
  add column if not exists waiver_of_subrogation boolean not null default false,
  add column if not exists primary_noncontributory boolean not null default false,
  add column if not exists blanket boolean not null default false,   -- Section 4.7.2 scope mapping
  add column if not exists endorsement_status text not null default 'none'
    check (endorsement_status in ('none','requested','endorsed')),
  add column if not exists endorsement_form text,
  add column if not exists endorsement_effective_date date,
  add column if not exists endorsement_confirmed_at timestamptz,
  add column if not exists endorsement_confirmed_by uuid references auth.users(id),
  add column if not exists additional_insured_id uuid;

update public.policy_property_interests
   set endorsement_status = case when extraction_status = 'AUTO_APPLIED' then 'endorsed' else 'requested' end
 where interest_type = 'additional_insured';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'property_interests_ai_status_scope'
      and conrelid = 'public.policy_property_interests'::regclass
  ) then
    alter table public.policy_property_interests
      add constraint property_interests_ai_status_scope
      check (interest_type = 'additional_insured' or endorsement_status = 'none');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5) Status indexes on the four tables
-- ---------------------------------------------------------------------------
create index if not exists idx_cgl_ai_endorsement_status  on public.policy_cgl_additional_insureds(endorsement_status);
create index if not exists idx_umb_ai_endorsement_status  on public.policy_umbrella_additional_insureds(endorsement_status);
create index if not exists idx_bap_int_endorsement_status on public.policy_bap_interests(endorsement_status) where interest_type = 'additional_insured';
create index if not exists idx_prop_int_endorsement_status on public.policy_property_interests(endorsement_status) where interest_type = 'additional_insured';

-- ---------------------------------------------------------------------------
-- 6) New table: policy_wc_subrogation_waivers (Section 4.3)
--    WC SUBR WVD is a real ACORD 25 field with no home today; endorsable blanket
--    (WC 00 03 13) or person-specific, so it needs rows, not a boolean.
--    Carries agency_workspace_id NOT NULL (server-derived, Section 4.4) and
--    additional_insured_id (column only; FK shipped by the directory wire-up, 4.6).
-- ---------------------------------------------------------------------------
create table if not exists public.policy_wc_subrogation_waivers (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.policies(id) on delete cascade,
  agency_workspace_id uuid not null references public.agency_workspaces(id),  -- derived server-side, Section 4.4

  waiver_scope text not null default 'specific'
    check (waiver_scope in ('blanket','specific')),
  name text,                -- required when specific; the org/person waived in favor of
  street text, city text, state text, zip text,
  additional_insured_id uuid,   -- directory link; column only, FK shipped by the directory wire-up (Section 4.6)

  endorsement_status text not null default 'requested'
    check (endorsement_status in ('none','requested','endorsed')),
  endorsement_form text,        -- e.g. 'WC 00 03 13'
  endorsement_effective_date date,
  endorsement_confirmed_at timestamptz,
  endorsement_confirmed_by uuid references auth.users(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint wc_waiver_name_when_specific
    check (waiver_scope = 'blanket' or name is not null)
);

create index if not exists idx_wc_subro_waivers_policy on public.policy_wc_subrogation_waivers(policy_id);
create index if not exists idx_wc_subro_waivers_status on public.policy_wc_subrogation_waivers(endorsement_status);
create index if not exists idx_wc_subro_waivers_workspace on public.policy_wc_subrogation_waivers(agency_workspace_id);

-- Generic updated_at setter (reused by account_coi_profiles in migration 2).
create or replace function public.update_wc_subro_waivers_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trigger_wc_subro_waivers_updated on public.policy_wc_subrogation_waivers;
create trigger trigger_wc_subro_waivers_updated
  before update on public.policy_wc_subrogation_waivers
  for each row execute function public.update_wc_subro_waivers_updated_at();

-- ---------------------------------------------------------------------------
-- 7) Workspace derivation + RLS for the new table (Section 4.4 / 01 §4.5)
--    agency_workspace_id is derived server-side, never trusted from the client,
--    with the sec005 oldest-workspace fallback for accounts whose workspace is null.
-- ---------------------------------------------------------------------------
create or replace function public.set_wc_subro_waiver_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select coalesce(
           a.agency_workspace_id,
           (select id from public.agency_workspaces order by created_at limit 1)
         )
    into new.agency_workspace_id
  from public.policies p
  join public.accounts a on a.id = p.account_id
  where p.id = new.policy_id;
  if new.agency_workspace_id is null then
    raise exception 'cannot derive agency_workspace_id for policy %', new.policy_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_wc_subro_waiver_workspace on public.policy_wc_subrogation_waivers;
create trigger trg_wc_subro_waiver_workspace
  before insert on public.policy_wc_subrogation_waivers
  for each row execute function public.set_wc_subro_waiver_workspace();

alter table public.policy_wc_subrogation_waivers enable row level security;

drop policy if exists "wc_subro_waivers_select" on public.policy_wc_subrogation_waivers;
create policy "wc_subro_waivers_select" on public.policy_wc_subrogation_waivers
  for select using (
    public.is_staff() and public.is_agency_member(agency_workspace_id)
  );

drop policy if exists "wc_subro_waivers_write" on public.policy_wc_subrogation_waivers;
create policy "wc_subro_waivers_write" on public.policy_wc_subrogation_waivers
  for all using (
    public.is_staff() and public.is_agency_member(agency_workspace_id)
  ) with check (
    public.is_staff() and public.is_agency_member(agency_workspace_id)
  );
