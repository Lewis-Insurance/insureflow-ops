-- Phase 4 migration 1 of 2: the Additional Insureds directory table.
--
-- One agency-wide directory of certificate holders / additional insureds,
-- shared across every customer (NOT scoped per account). This is the identity
-- store the COI generator resolves holders against; the five per-policy AI /
-- interest tables carry a nullable additional_insured_id that will FK here in a
-- later Phase 4 migration.
--
-- Posture (binding invariants):
--   * agency_workspace_id NOT NULL, derived by a BEFORE-INSERT trigger.
--   * RLS: is_staff() AND is_agency_member(agency_workspace_id) for every
--     command (select / insert / update / delete). No membership-only exception.
--   * normalized_name is a STORED generated column off the IMMUTABLE
--     normalize_entity_name(), so it can back a functional index and the
--     resolve-or-create dedup key.
--   * Tombstone triple (deleted_at / merged_into_id / merged_at) mirrors
--     accounts, so the merge engine can soft-delete losers and the resolver can
--     follow merged_into_id to a live survivor.
--   * requirements jsonb + requirements_notes text ride the CREATE TABLE (07 2.2)
--     so the drawer's later "Requirements" section has its columns from day one.
--
-- Depends only on live objects: normalize_entity_name, set_updated_at, is_staff,
-- is_agency_member, agency_workspaces, agency_workspace_memberships, and the
-- pg_trgm extension (installed in the extensions schema).

-- 1) The directory table. Idempotent create; requirements columns ride the
--    CREATE TABLE because the table does not exist anywhere yet.
create table if not exists public.additional_insureds (
  id                  uuid primary key default gen_random_uuid(),
  agency_workspace_id uuid not null references public.agency_workspaces(id),

  name                text not null,
  -- STORED generated dedup key. normalize_entity_name is IMMUTABLE, so a STORED
  -- generated column and the functional indexes below are legal.
  normalized_name     text generated always as (public.normalize_entity_name(name)) stored,
  kind                text not null default 'business'
                        check (kind in ('business','individual','government','lender','other')),

  -- Address block matches accounts naming (address_line1/2, city, state,
  -- zip_code) -- NOT the per-policy street/zip shape.
  address_line1       text,
  address_line2       text,
  city                text,
  state               text,
  zip_code            text,

  email               text,
  phone               text,
  notes               text,

  -- 07 2.2: holder-level insurance requirements. jsonb payload + free-text
  -- notes. Both nullable; populated by the drawer's Requirements section (P1).
  requirements        jsonb,
  requirements_notes  text,

  -- Tombstone triple (mirrors accounts). merged_into_id is a self-FK to the
  -- survivor; excluded from the merge engine's FK-introspection reparent loop.
  deleted_at          timestamptz,
  merged_into_id      uuid references public.additional_insureds(id),
  merged_at           timestamptz,

  created_by          uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- 07 2.2 fallback: if an earlier draft ever created the table without the
-- requirements columns, add them idempotently. (No-op on a fresh create above.)
alter table public.additional_insureds add column if not exists requirements       jsonb;
alter table public.additional_insureds add column if not exists requirements_notes text;

comment on table public.additional_insureds is
  'Agency-wide directory of certificate holders / additional insureds, shared across every customer. Resolve-or-create keyed on normalized_name; tombstone triple mirrors accounts for the merge engine.';
comment on column public.additional_insureds.normalized_name is
  'STORED generated dedup key via normalize_entity_name(name). Backs the norm-name index and resolve_additional_insured.';
comment on column public.additional_insureds.requirements is
  '07 2.2: holder-level insurance requirements payload (jsonb). Populated by the drawer Requirements section.';
comment on column public.additional_insureds.requirements_notes is
  '07 2.2: free-text notes accompanying the holder-level requirements.';

-- 2) updated_at maintenance (idempotent trigger create via drop-if-exists).
drop trigger if exists set_additional_insureds_updated_at on public.additional_insureds;
create trigger set_additional_insureds_updated_at
  before update on public.additional_insureds
  for each row execute function public.set_updated_at();

-- 3) Workspace-derive trigger. Every new table carries agency_workspace_id
--    NOT NULL with a BEFORE-INSERT derive. Postgres evaluates NOT NULL AFTER
--    BEFORE triggers, so a null-on-insert row is filled here before the check.
--    Service-role callers (auth.uid() null) MUST pass agency_workspace_id.
create or replace function public.additional_insureds_derive_workspace()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.agency_workspace_id is null then
    select m.agency_workspace_id
      into new.agency_workspace_id
      from public.agency_workspace_memberships m
     where m.user_id = auth.uid()
       and m.status = 'active'
     limit 1;
  end if;
  if new.agency_workspace_id is null then
    raise exception 'additional_insureds: agency_workspace_id could not be derived';
  end if;
  return new;
end;
$function$;

drop trigger if exists additional_insureds_workspace_default on public.additional_insureds;
create trigger additional_insureds_workspace_default
  before insert on public.additional_insureds
  for each row execute function public.additional_insureds_derive_workspace();

-- 4) Indexes. pg_trgm lives in the extensions schema, so the GIN trgm index
--    references extensions.gin_trgm_ops explicitly.
create index if not exists idx_additional_insureds_name_trgm
  on public.additional_insureds using gin (lower(name) extensions.gin_trgm_ops)
  where deleted_at is null;

create index if not exists idx_additional_insureds_norm_name_active
  on public.additional_insureds (kind, normalized_name)
  where deleted_at is null;

create index if not exists idx_additional_insureds_merged_into
  on public.additional_insureds (merged_into_id)
  where merged_into_id is not null;

create index if not exists idx_additional_insureds_workspace
  on public.additional_insureds (agency_workspace_id);

-- 5) Row Level Security. is_staff() AND is_agency_member(agency_workspace_id)
--    for every command. No membership-only exception (that was an invariant
--    violation in an earlier account_aliases draft).
alter table public.additional_insureds enable row level security;

drop policy if exists additional_insureds_select on public.additional_insureds;
create policy additional_insureds_select
  on public.additional_insureds for select to authenticated
  using (public.is_staff() and public.is_agency_member(agency_workspace_id));

drop policy if exists additional_insureds_insert on public.additional_insureds;
create policy additional_insureds_insert
  on public.additional_insureds for insert to authenticated
  with check (public.is_staff() and public.is_agency_member(agency_workspace_id));

drop policy if exists additional_insureds_update on public.additional_insureds;
create policy additional_insureds_update
  on public.additional_insureds for update to authenticated
  using (public.is_staff() and public.is_agency_member(agency_workspace_id))
  with check (public.is_staff() and public.is_agency_member(agency_workspace_id));

drop policy if exists additional_insureds_delete on public.additional_insureds;
create policy additional_insureds_delete
  on public.additional_insureds for delete to authenticated
  using (public.is_staff() and public.is_agency_member(agency_workspace_id));

grant select, insert, update, delete on public.additional_insureds to authenticated;
grant all on public.additional_insureds to service_role;

-- 6) Seed the nightly dedup rule. duplicate_detection_rules has
--    (entity_type, rule_name, match_fields, threshold) required; is_active and
--    timestamps default. Idempotent via a NOT EXISTS guard on (entity_type,
--    rule_name).
insert into public.duplicate_detection_rules (entity_type, rule_name, match_fields, threshold)
select 'additional_insureds',
       'additional_insureds_nightly',
       '{"signals":["same_normalized_name","name_trgm_city_state","address_key_name_trgm","shared_contact_name_trgm"]}'::jsonb,
       0.55
where not exists (
  select 1 from public.duplicate_detection_rules
  where entity_type = 'additional_insureds'
    and rule_name   = 'additional_insureds_nightly'
);
