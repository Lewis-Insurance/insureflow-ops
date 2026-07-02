-- =============================================================================
-- Master COI Phase 3 (data layer) — Migration 2 of 3
-- account_coi_profiles + policies.coi_field_provenance + coi_field_registry (seed).
--
-- Spec: docs/COI Module/coi-module/02-master-coi-data-layer.md
--   Section 7    account_coi_profiles (PK account_id; description_of_operations,
--                ops_source, default_remarks, last_reviewed_at/by; agency_workspace_id
--                NOT NULL server-derived; updated_at trigger; staff+workspace RLS)
--   Section 3.3  policies.coi_field_provenance jsonb NOT NULL DEFAULT '{}' + comment
--   Section 3.2  coi_field_registry (rules-as-data field catalog) + read-only-to-
--                authenticated RLS + the complete seed
-- Workspace posture: docs/COI Module/coi-module/01-disposition-and-roadmap.md §4.5.
--
-- SEED ROW COUNT NOTE: the §3.2 seed table enumerates 28 rows (3 policy-level +
-- 8 gl + 5 auto + 6 umbrella + 3 wc + 3 property). Per a direct user directive
-- (2026-07-02), a 29th row 'named_insured_dba' (line_kind policy, storage column,
-- text, not required) is also seeded, and its backing column
-- policies.named_insured_dba is created in section 2b below. Total seeded = 29.
-- save_master_coi_fields (migration 3 of this set: the RPC migration) includes
-- named_insured_dba in its column write-whitelist so the field is editable.
-- required_for_ready = true on exactly: gl each_occurrence, gl general_aggregate,
-- auto csl_limit, umbrella per_occurrence, and all three wc EL limits (7 rows).
--
-- Ground truth verified against live prod (lrqajzwcmdwahnjyidgv) 2026-07-02:
--   account_coi_profiles / coi_field_registry / policies.coi_field_provenance all
--   absent; is_staff() / is_agency_member(uuid) exist; the generic updated_at setter
--   public.update_wc_subro_waivers_updated_at() is created by migration 1 (applied
--   before this one) and is reused here.
--
-- Idempotent: CREATE TABLE / COLUMN / INDEX / POLICY IF NOT EXISTS or DROP-then-
-- CREATE; ADD COLUMN IF NOT EXISTS; seed via ON CONFLICT DO NOTHING.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) account_coi_profiles (Section 7)
--    Per-account default COI state: description of operations, default remarks,
--    review stamp. One row per account (PK = account_id), no id column.
-- ---------------------------------------------------------------------------
create table if not exists public.account_coi_profiles (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  agency_workspace_id uuid not null references public.agency_workspaces(id),  -- derived server-side

  description_of_operations text,
  ops_source text check (ops_source in ('manual','canopy','bap_risk_context')),
  default_remarks text,             -- optional standing remarks block prefill

  last_reviewed_at timestamptz,     -- Section 8.3
  last_reviewed_by uuid references auth.users(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_account_coi_profiles_workspace
  on public.account_coi_profiles(agency_workspace_id);

-- Server-side workspace derivation, sec005 orphan fallback, client value ignored.
create or replace function public.set_account_coi_profile_workspace()
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
  from public.accounts a
  where a.id = new.account_id;
  if new.agency_workspace_id is null then
    raise exception 'cannot derive agency_workspace_id for account %', new.account_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_account_coi_profile_workspace on public.account_coi_profiles;
create trigger trg_account_coi_profile_workspace
  before insert on public.account_coi_profiles
  for each row execute function public.set_account_coi_profile_workspace();

alter table public.account_coi_profiles enable row level security;

-- Module posture (Section 4.4): workspace-scoped staff access, no exceptions.
drop policy if exists "coi_profiles_select" on public.account_coi_profiles;
create policy "coi_profiles_select" on public.account_coi_profiles
  for select using (
    public.is_staff() and public.is_agency_member(agency_workspace_id)
  );

drop policy if exists "coi_profiles_write" on public.account_coi_profiles;
create policy "coi_profiles_write" on public.account_coi_profiles
  for all using (
    public.is_staff() and public.is_agency_member(agency_workspace_id)
  ) with check (
    public.is_staff() and public.is_agency_member(agency_workspace_id)
  );

-- Reuse the generic updated_at setter created in migration 1.
drop trigger if exists trigger_account_coi_profiles_updated on public.account_coi_profiles;
create trigger trigger_account_coi_profiles_updated
  before update on public.account_coi_profiles
  for each row execute function public.update_wc_subro_waivers_updated_at();

-- ---------------------------------------------------------------------------
-- 2) policies.coi_field_provenance ledger (Section 3.3)
--    One JSONB column recording Master COI manual writes, keyed by registry path.
-- ---------------------------------------------------------------------------
alter table public.policies
  add column if not exists coi_field_provenance jsonb not null default '{}'::jsonb;

comment on column public.policies.coi_field_provenance is
  'Master COI manual-write ledger. Keys are coi_field_registry.path. Values: '
  '{"val": <written value>, "updated_by": uuid, "updated_at": iso, "prev": <prior value>}. '
  'Written ONLY by save_master_coi_fields. Extractors must never touch this column.';

-- ---------------------------------------------------------------------------
-- 2b) policies.named_insured_dba (added per direct user directive 2026-07-02).
--     Backs the coi_field_registry 'named_insured_dba' row (storage=column);
--     editable via save_master_coi_fields. NOT part of the get_master_coi read
--     contract (§2.6), so get_master_coi is unchanged.
-- ---------------------------------------------------------------------------
alter table public.policies
  add column if not exists named_insured_dba text;

-- ---------------------------------------------------------------------------
-- 3) coi_field_registry (Section 3.2, rules as data)
--    Simultaneously the write whitelist, validation table, missing-field checklist,
--    and the panel field catalog. Seed-only (no insert/update/delete policy).
-- ---------------------------------------------------------------------------
create table if not exists public.coi_field_registry (
  path            text primary key,       -- exact write path relative to the policies row
  line_kind       text not null check (line_kind in ('gl','auto','umbrella','wc','property','policy')),
  storage         text not null check (storage in ('jsonb','column')),
  value_type      text not null check (value_type in ('money','text','date','enum','boolean')),
  enum_values     text[],                  -- non-null when value_type = 'enum'
  label           text not null,           -- panel display label
  acord25_box     text,                    -- documentation: which ACORD 25 box this feeds
  required_for_ready boolean not null default false,
  sort_order      int not null default 0
);

alter table public.coi_field_registry enable row level security;
drop policy if exists "coi_field_registry_read" on public.coi_field_registry;
create policy "coi_field_registry_read" on public.coi_field_registry
  for select to authenticated using (true);
-- no insert/update/delete policies: seed via migrations only

-- Seed (exact, complete — 28 rows per the §3.2 table). Idempotent.
insert into public.coi_field_registry
  (path, line_kind, storage, value_type, enum_values, label, required_for_ready, sort_order)
values
  -- policy-level typed columns (valid on any line)
  ('carrier_naic',                                                   'policy',   'column', 'text',  null,                                    'Insurer NAIC',                    false, 10),
  ('named_insured',                                                  'policy',   'column', 'text',  null,                                    'Named Insured',                   false, 20),
  ('dba',                                                            'policy',   'column', 'text',  null,                                    'DBA',                             false, 30),
  ('named_insured_dba',                                              'policy',   'column', 'text',  null,                                    'Named Insured DBA',               false, 40),
  -- gl
  ('cgl_details.limits.each_occurrence',                             'gl',       'jsonb',  'money', null,                                    'GL Each Occurrence',              true,  110),
  ('cgl_details.limits.damage_to_rented_premises',                   'gl',       'jsonb',  'money', null,                                    'GL Damage to Rented Premises',    false, 120),
  ('cgl_details.limits.medical_expense',                             'gl',       'jsonb',  'money', null,                                    'GL Medical Expense',              false, 130),
  ('cgl_details.limits.personal_advertising_injury',                 'gl',       'jsonb',  'money', null,                                    'GL Personal & Advertising Injury',false, 140),
  ('cgl_details.limits.general_aggregate',                           'gl',       'jsonb',  'money', null,                                    'GL General Aggregate',            true,  150),
  ('cgl_details.limits.products_completed_ops_aggregate',            'gl',       'jsonb',  'money', null,                                    'GL Products/Completed Ops Agg',   false, 160),
  ('cgl_details.limits.aggregate_applies_per',                       'gl',       'jsonb',  'enum',  array['policy','project','location'],    'GL Aggregate Applies Per',        false, 170),
  ('cgl_details.coverage_options.policy_form',                       'gl',       'jsonb',  'enum',  array['occurrence','claims_made'],       'GL Occurrence/Claims Made',       false, 180),
  -- auto
  ('bap_details.coverage.liability.limit_type',                      'auto',     'jsonb',  'enum',  array['csl','split'],                    'Auto Limit Type',                 false, 210),
  ('bap_details.coverage.liability.csl_limit',                       'auto',     'jsonb',  'money', null,                                    'Auto Combined Single Limit',      true,  220),
  ('bap_details.coverage.liability.bodily_injury_per_person',        'auto',     'jsonb',  'money', null,                                    'Auto BI Per Person',              false, 230),
  ('bap_details.coverage.liability.bodily_injury_per_accident',      'auto',     'jsonb',  'money', null,                                    'Auto BI Per Accident',            false, 240),
  ('bap_details.coverage.liability.property_damage',                 'auto',     'jsonb',  'money', null,                                    'Auto Property Damage',            false, 250),
  -- umbrella
  ('umbrella_details.policy_type',                                   'umbrella', 'jsonb',  'enum',  array['umbrella','excess'],              'Umbrella/Excess',                 false, 310),
  ('umbrella_details.limits.per_occurrence',                         'umbrella', 'jsonb',  'money', null,                                    'Umbrella Each Occurrence',        true,  320),
  ('umbrella_details.limits.aggregate',                              'umbrella', 'jsonb',  'money', null,                                    'Umbrella Aggregate',              false, 330),
  ('umbrella_details.retention.amount',                              'umbrella', 'jsonb',  'money', null,                                    'Umbrella Retention Amount',       false, 340),
  ('umbrella_details.coi_summary.ded_or_retention_kind',            'umbrella', 'jsonb',  'enum',  array['deductible','retention'],         'Umbrella Deductible/Retention',   false, 350),
  ('umbrella_details.coi_summary.occurrence_or_claims_made',        'umbrella', 'jsonb',  'enum',  array['occurrence','claims_made'],       'Umbrella Occurrence/Claims Made', false, 360),
  -- wc
  ('wc_details.coverage.part_two_employers_liability.each_accident',        'wc', 'jsonb', 'money', null,                                    'WC EL Each Accident',             true,  410),
  ('wc_details.coverage.part_two_employers_liability.disease_each_employee','wc', 'jsonb', 'money', null,                                    'WC EL Disease Each Employee',     true,  420),
  ('wc_details.coverage.part_two_employers_liability.disease_policy_limit', 'wc', 'jsonb', 'money', null,                                    'WC EL Disease Policy Limit',      true,  430),
  -- property (module-owned coi_summary namespace)
  ('property_details.coi_summary.label',                             'property', 'jsonb',  'text',  null,                                    'Property Label',                  false, 510),
  ('property_details.coi_summary.limit_amount',                      'property', 'jsonb',  'money', null,                                    'Property Limit Amount',           false, 520),
  ('property_details.coi_summary.limit_description',                 'property', 'jsonb',  'text',  null,                                    'Property Limit Description',      false, 530)
on conflict (path) do nothing;
