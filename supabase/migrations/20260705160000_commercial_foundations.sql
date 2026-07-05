-- ============================================================================
-- Commercial Lines Phase 0: canonical risk store + submission spine
-- (docs/Commercial-Lines-Quote-to-Bind-Plan.md v3 LOCKED, Phase 0)
-- ============================================================================
-- The account-scoped commercial risk store that feeds BOTH golden paths:
--   Path A: line detail editors -> policies.*_details -> get_master_coi -> COI
--   Path B: submission -> frozen snapshot -> ACORD packet -> quote -> bind
-- Design rules carried from the COI module: workspace RLS on every table
-- (is_staff() AND is_agency_member), soft delete only (no DELETE policies),
-- per-field provenance jsonb (src = manual|extracted|canopy|client|book;
-- manual never machine-overwritten - enforced by the app/staging layer, the
-- column just records it), tenancy autofill guard trigger so a row can never
-- land in a different workspace than its account.
-- Column vocabulary mirrors the canopy_* commercial tables (already
-- ACORD-shaped) so the Canopy feeder in Phase 2 is a near-straight mapping.
-- NO market registry / appetite / per-market routing (SOW v3, Landen Q1).
-- Idempotent: create if not exists / or replace / drop-then-create triggers.

-- ---------------------------------------------------------------------------
-- 0) Shared trigger helpers
-- ---------------------------------------------------------------------------

create or replace function public.commercial_set_updated_at()
returns trigger language plpgsql set search_path to 'public'
as $$ begin new.updated_at := now(); return new; end; $$;

-- Tenancy guard: fill agency_workspace_id from the row's account; refuse a
-- mismatched explicit value. BEFORE INSERT/UPDATE, runs ahead of RLS checks.
create or replace function public.commercial_fill_workspace()
returns trigger language plpgsql set search_path to 'public'
as $$
declare v_ws uuid;
begin
  select agency_workspace_id into v_ws from public.accounts where id = new.account_id;
  if v_ws is null then
    raise exception 'account % not found or has no agency_workspace_id', new.account_id;
  end if;
  if new.agency_workspace_id is null then
    new.agency_workspace_id := v_ws;
  elsif new.agency_workspace_id <> v_ws then
    raise exception 'agency_workspace_id does not match the account''s workspace';
  end if;
  return new;
end; $$;

-- ---------------------------------------------------------------------------
-- 1) Risk store tables
-- ---------------------------------------------------------------------------

-- One commercial profile per account (partial-unique on live rows).
create table if not exists public.commercial_profiles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  agency_workspace_id uuid not null,
  legal_name text,
  dba text,
  fein text,                                  -- masked in UI, never sent to AI unredacted
  entity_type text,                           -- individual/partnership/corporation/llc/joint_venture/trust/other
  sic_code text,
  naics_code text,
  description_of_operations text,
  years_in_business integer,
  employee_count integer,
  part_time_employee_count integer,
  annual_revenue numeric,
  annual_payroll numeric,
  uses_subcontractors boolean,
  subcontractor_cost numeric,
  website text,
  wc_experience_mod numeric,
  wc_experience_mod_effective date,
  field_provenance jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists uq_commercial_profiles_account
  on public.commercial_profiles(account_id) where deleted_at is null;

create table if not exists public.commercial_locations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  agency_workspace_id uuid not null,
  location_number integer,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  zip text,
  county text,
  interest text,                              -- owner / tenant
  occupancy text,
  construction_type text,
  iso_construction_code text,
  year_built integer,
  square_footage integer,
  stories integer,
  sprinklered boolean,
  sprinkler_coverage_pct numeric,
  alarm_type text,
  roof_type text,
  roof_update_year integer,
  wiring_update_year integer,
  plumbing_update_year integer,
  heating_update_year integer,
  building_value numeric,
  bpp_value numeric,                          -- business personal property / contents
  business_income_value numeric,
  property_deductible text,                   -- prints as-is on ACORD (flat or text)
  wind_hail_deductible text,                  -- FL: % or flat, prints as-is
  flood_zone text,
  field_provenance jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_commercial_locations_account on public.commercial_locations(account_id);

create table if not exists public.commercial_vehicles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  agency_workspace_id uuid not null,
  unit_number integer,
  vin text,
  year integer,
  make text,
  model text,
  vehicle_type text,
  body_type text,
  gvwr integer,
  radius_of_operation text,
  vehicle_use text,                           -- commute/service/retail/commercial...
  cost_new numeric,
  stated_value numeric,
  comprehensive_deductible text,
  collision_deductible text,
  ownership text,                             -- owned / leased
  lienholder_name text,
  lienholder_address text,
  garaging_location_id uuid references public.commercial_locations(id),
  field_provenance jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_commercial_vehicles_account on public.commercial_vehicles(account_id);

create table if not exists public.commercial_drivers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  agency_workspace_id uuid not null,
  first_name text,
  last_name text,
  date_of_birth date,                         -- masked in UI
  license_number text,                        -- masked in UI
  license_state text,
  years_licensed integer,
  hire_date date,
  violations_3yr integer,
  accidents_3yr integer,
  excluded boolean not null default false,
  field_provenance jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_commercial_drivers_account on public.commercial_drivers(account_id);

create table if not exists public.commercial_wc_classes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  agency_workspace_id uuid not null,
  state text not null default 'FL',
  location_id uuid references public.commercial_locations(id),
  class_code text,
  class_description text,
  employee_count integer,
  annual_payroll numeric,
  field_provenance jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_commercial_wc_classes_account on public.commercial_wc_classes(account_id);

-- FL WC exemptions (DWC): who holds one, number, window (07 SOW 3.1).
create table if not exists public.commercial_wc_exemptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  agency_workspace_id uuid not null,
  person_name text not null,
  title text,
  exemption_number text,
  scope text check (scope is null or scope in ('construction','non_construction')),
  effective_date date,
  expiration_date date,
  field_provenance jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_commercial_wc_exemptions_account on public.commercial_wc_exemptions(account_id);

-- Per-claim loss history rows (line_key vocabulary = the COI module's).
create table if not exists public.commercial_loss_history (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  agency_workspace_id uuid not null,
  line_key text not null check (line_key in ('gl','auto','umbrella','wc','property','other')),
  policy_period_start date,
  policy_period_end date,
  carrier text,
  date_of_loss date,
  description text,
  amount_paid numeric,
  amount_reserved numeric,
  status text check (status is null or status in ('open','closed')),
  valuation_date date,
  source_document_id uuid references public.documents(id),
  field_provenance jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_commercial_loss_history_account on public.commercial_loss_history(account_id);

-- ---------------------------------------------------------------------------
-- 2) Submission spine (Path B)
-- ---------------------------------------------------------------------------

create table if not exists public.commercial_submissions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  agency_workspace_id uuid not null,
  target_lines text[] not null default '{}'::text[]
    check (target_lines <@ array['gl','auto','umbrella','wc','property','other']::text[]),
  effective_date date,
  status text not null default 'draft'
    check (status in ('draft','intake','packet_ready','signing','submitted','quoted','proposed','bound','lost','abandoned')),
  producer_id uuid,
  csr_id uuid,
  -- Universal send target (SOW v3: free text, NO market registry).
  wholesaler_name text,
  wholesaler_email text,
  -- Frozen at packet generation; the packet is built from THIS, not live data.
  risk_snapshot jsonb,
  snapshot_frozen_at timestamptz,
  remarket_of_policy_id uuid references public.policies(id),
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_commercial_submissions_account on public.commercial_submissions(account_id);
create index if not exists idx_commercial_submissions_ws_status
  on public.commercial_submissions(agency_workspace_id, status) where deleted_at is null;

-- Append-only audit trail (packet_built, sent, signed, declination_recorded,
-- proposal_sent, bound, ...). Mirrors certificate_events.
create table if not exists public.submission_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.commercial_submissions(id),
  action text not null,
  actor_id uuid default auth.uid(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_submission_events_submission
  on public.submission_events(submission_id, created_at);

-- Diligent-effort feature (SOW v3, Landen Q2b): free-text admitted-market
-- declinations per submission; assembled into the diligent-effort artifact
-- for any E&S placement. Append-only.
create table if not exists public.submission_declinations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.commercial_submissions(id),
  carrier_name text not null,
  declined_at date not null default current_date,
  reason text,
  notes text,
  recorded_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists idx_submission_declinations_submission
  on public.submission_declinations(submission_id);

-- Offer-and-rejection log (E&O record): umbrella offered/declined, limits
-- offered vs chosen, FL UM/UIM written rejection, WC exemption elections.
-- Account-scoped directly (works for submissions AND post-bind/policy cases).
create table if not exists public.submission_offer_rejections (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  agency_workspace_id uuid not null,
  submission_id uuid references public.commercial_submissions(id),
  policy_id uuid references public.policies(id),
  coverage text not null check (coverage in ('umbrella','um_uim','higher_limits','wc_exemption','other')),
  details jsonb not null default '{}'::jsonb,   -- what was offered (limits, premium...)
  decision text not null default 'pending' check (decision in ('pending','accepted','rejected')),
  decided_at timestamptz,
  signed_document_id uuid references public.documents(id),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_offer_rejections_account on public.submission_offer_rejections(account_id);
create index if not exists idx_offer_rejections_submission
  on public.submission_offer_rejections(submission_id) where submission_id is not null;

-- Quotes link to submissions (nullable; personal-lines quotes unaffected).
alter table public.quotes add column if not exists submission_id uuid references public.commercial_submissions(id);
create index if not exists idx_quotes_submission on public.quotes(submission_id) where submission_id is not null;

-- ---------------------------------------------------------------------------
-- 3) Class-code reference tables (seeded in later phases; readable reference)
-- ---------------------------------------------------------------------------

create table if not exists public.gl_class_codes (
  code text primary key,
  description text not null
);
create table if not exists public.wc_class_codes (
  code text not null,
  state text not null default 'FL',
  description text not null,
  primary key (code, state)
);

-- ---------------------------------------------------------------------------
-- 4) Triggers
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'commercial_profiles','commercial_locations','commercial_vehicles',
    'commercial_drivers','commercial_wc_classes','commercial_wc_exemptions',
    'commercial_loss_history','commercial_submissions','submission_offer_rejections'
  ] loop
    execute format('drop trigger if exists trg_%s_workspace on public.%I', t, t);
    execute format('create trigger trg_%s_workspace before insert or update of account_id, agency_workspace_id on public.%I for each row execute function public.commercial_fill_workspace()', t, t);
    execute format('drop trigger if exists trg_%s_updated_at on public.%I', t, t);
    execute format('create trigger trg_%s_updated_at before update on public.%I for each row execute function public.commercial_set_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5) RLS: staff + workspace on every table; soft delete only (no DELETE
--    policies anywhere). Child tables scope via their parent submission.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'commercial_profiles','commercial_locations','commercial_vehicles',
    'commercial_drivers','commercial_wc_classes','commercial_wc_exemptions',
    'commercial_loss_history','commercial_submissions','submission_offer_rejections'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %s_select on public.%I', t, t);
    execute format('create policy %s_select on public.%I for select to authenticated using (public.is_staff() and public.is_agency_member(agency_workspace_id))', t, t);
    execute format('drop policy if exists %s_insert on public.%I', t, t);
    execute format('create policy %s_insert on public.%I for insert to authenticated with check (public.is_staff() and public.is_agency_member(agency_workspace_id))', t, t);
    execute format('drop policy if exists %s_update on public.%I', t, t);
    execute format('create policy %s_update on public.%I for update to authenticated using (public.is_staff() and public.is_agency_member(agency_workspace_id)) with check (public.is_staff() and public.is_agency_member(agency_workspace_id))', t, t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

alter table public.submission_events enable row level security;
drop policy if exists submission_events_select on public.submission_events;
create policy submission_events_select on public.submission_events for select to authenticated
  using (exists (select 1 from public.commercial_submissions s
                 where s.id = submission_id
                   and public.is_staff() and public.is_agency_member(s.agency_workspace_id)));
drop policy if exists submission_events_insert on public.submission_events;
create policy submission_events_insert on public.submission_events for insert to authenticated
  with check (exists (select 1 from public.commercial_submissions s
                      where s.id = submission_id
                        and public.is_staff() and public.is_agency_member(s.agency_workspace_id)));
revoke all on public.submission_events from anon;
-- append-only: no update/delete policies.

alter table public.submission_declinations enable row level security;
drop policy if exists submission_declinations_select on public.submission_declinations;
create policy submission_declinations_select on public.submission_declinations for select to authenticated
  using (exists (select 1 from public.commercial_submissions s
                 where s.id = submission_id
                   and public.is_staff() and public.is_agency_member(s.agency_workspace_id)));
drop policy if exists submission_declinations_insert on public.submission_declinations;
create policy submission_declinations_insert on public.submission_declinations for insert to authenticated
  with check (exists (select 1 from public.commercial_submissions s
                      where s.id = submission_id
                        and public.is_staff() and public.is_agency_member(s.agency_workspace_id)));
revoke all on public.submission_declinations from anon;
-- append-only: no update/delete policies (the diligent-effort record is evidence).

-- Reference tables: readable by any signed-in user, seeded via service role.
alter table public.gl_class_codes enable row level security;
drop policy if exists gl_class_codes_select on public.gl_class_codes;
create policy gl_class_codes_select on public.gl_class_codes for select to authenticated using (true);
revoke all on public.gl_class_codes from anon;

alter table public.wc_class_codes enable row level security;
drop policy if exists wc_class_codes_select on public.wc_class_codes;
create policy wc_class_codes_select on public.wc_class_codes for select to authenticated using (true);
revoke all on public.wc_class_codes from anon;

-- ---------------------------------------------------------------------------
-- 6) Comments
-- ---------------------------------------------------------------------------

comment on table public.commercial_profiles is 'Commercial risk store: one business profile per account (SOW v3 3.1). Feeds ACORD 125 + direct-carrier COI path. field_provenance: {field: {src, at, by}} with src in manual|extracted|canopy|client|book; manual never machine-overwritten.';
comment on table public.commercial_submissions is 'E&S submission spine (SOW v3 3.3). risk_snapshot frozen at packet generation. wholesaler_name/email is the universal-send target; NO market registry by design (Landen Q1).';
comment on table public.submission_declinations is 'Diligent-effort record (SOW v3, Landen Q2b): admitted-market declinations per submission, free-text carrier, append-only evidence.';
comment on table public.submission_offer_rejections is 'Offer-and-rejection E&O log: umbrella/UM-UIM/limits/WC-exemption offers and the client''s recorded decision, with the signed form document when applicable.';
