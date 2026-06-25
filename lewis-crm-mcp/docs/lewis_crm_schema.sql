-- =============================================================================
-- LEWIS INSURANCE AGENT PLATFORM — RING 0: SYSTEM OF RECORD
-- Supabase project: lrqajzwcmdwahnjyidgv.supabase.co
-- =============================================================================
-- This is the authoritative, transactional data layer for the Hermes office
-- platform. The book of business lives HERE, never in an agent's memory file.
-- Every Hermes profile reaches it through ONE MCP server (lewis-crm).
--
-- HOW TO RUN
--   Greenfield (recommended): paste this whole file into the Supabase SQL Editor
--   (Dashboard > SQL Editor > New query) and Run. It is idempotent and safe to
--   re-run.
--
--   IF YOUR CRM APP ALREADY OWNS THESE TABLES IN THIS PROJECT: do NOT run the
--   CREATE TABLE blocks. Send me your existing schema (or authorize the Supabase
--   connection) and I will point the MCP server at your real columns instead of
--   creating new ones. Mixing two data models is the one thing that breaks this.
--
-- ENVIRONMENT NOTE (your supabase-operations rule): this targets PRODUCTION data.
-- Take a backup first if the project already has data:
--   Dashboard > Database > Backups, or `supabase db dump -f backup-$(date +%F).sql`
--
-- AUTHORIZATION MATRIX (enforced by RLS below)
--   Roles -> people:  owner=Brian(CEO)   manager=Letitia(Accountant)+Landen(VP)
--                     producer=Jacob+Kelli   csr=Tori
--   Full access = owner + manager.  Own book = producer + csr.
--   Entity      | owner | manager | producer | csr
--   clients     |  all  |   all   | own assigned     | own assigned
--   policies    |  all  |   all   | own assigned     | own assigned
--   quotes      |  all  |   all   | own assigned     | own assigned
--   contacts    |  all  |   all   | own logged       | own logged
--   payments    |  all  |   all   | own client       | own client
--   documents   |  all  |   all   | own client       | own client
--   tasks       |  all  |   all   | own assigned     | own assigned
--   audit_log   |  all  |   all   | none             | none
--   employees   |  all  |   all   | self             | self
--
-- PII FIELDS (handled IDs-first by the MCP server; redact_pii on at the model)
--   clients.first_name/last_name/business_name/email/phone/address_*
--   policies.policy_number  •  payments.reference
--   The MCP server returns record IDs + structured fields to the model and only
--   surfaces raw PII when a human action explicitly requires it.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. EXTENSIONS + HELPER SCHEMA
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";   -- gen_random_uuid()

create schema if not exists app;             -- RLS helpers live here, not public

-- ---------------------------------------------------------------------------
-- 1. ENUMERATED TYPES (idempotent)
-- ---------------------------------------------------------------------------
do $$ begin
  create type app.employee_role as enum ('owner','manager','producer','csr');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.client_type as enum ('personal','commercial');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.policy_line as enum
    ('auto','home','flood','condo','renters','umbrella','specialty','commercial','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.policy_status as enum
    ('active','pending','lapsed','cancelled','nonrenewed','quoted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.quote_status as enum ('new','quoted','presented','bound','lost');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.contact_channel as enum ('call','text','email','imessage','in_person','mail');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.contact_direction as enum ('inbound','outbound');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.document_kind as enum
    ('dec_page','receipt','acord','loss_run','id_card','policy_doc','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.document_status as enum
    ('received','processing','extracted','reconciled','filed','error');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.task_status as enum ('open','doing','done','cancelled');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. updated_at TRIGGER FUNCTION
-- ---------------------------------------------------------------------------
create or replace function app.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 3. TABLES
-- ---------------------------------------------------------------------------

-- 3.1 employees — maps a Hermes profile + a Supabase auth user to a person.
--     employees.id == auth.users.id for the signed-in employee.
create table if not exists public.employees (
  id              uuid primary key,                         -- = auth.uid()
  full_name       text not null,
  title           text,                                     -- CEO, Vice President, Accountant, Producer, CSR
  role            app.employee_role not null default 'csr', -- RLS access level (owner/manager=all)
  email           text unique,
  hermes_profile  text unique,                              -- 'brian','letitia','jacob',...
  telegram_user_id text,
  imessage_handle text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- defensive: add title if an earlier version of this table already exists
alter table public.employees add column if not exists title text;

-- 3.2 clients — the household / business.
create table if not exists public.clients (
  id            uuid primary key default gen_random_uuid(),
  type          app.client_type not null default 'personal',
  display_name  text not null,                              -- search/display handle
  first_name    text,
  last_name     text,
  business_name text,
  email         text,
  phone         text,
  address_line1 text,
  address_line2 text,
  city          text,
  state         text default 'FL',
  zip           text,
  assigned_to   uuid references public.employees(id),
  status        text not null default 'active',             -- active|prospect|lost
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 3.3 policies — written business. Dec-page intake writes here.
create table if not exists public.policies (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients(id) on delete cascade,
  carrier        text not null,                             -- Nationwide, Progressive...
  source_carrier text,                                      -- migration tracking, e.g. Auto-Owners
  line           app.policy_line not null,
  policy_number  text,
  status         app.policy_status not null default 'active',
  effective_date date,
  expiration_date date,
  premium        numeric(12,2),
  paid_in_full   boolean default false,                     -- TRUE only when confirmed paid,
                                                            -- never from a dec-page marketing line
  payment_plan   text,
  assigned_to    uuid references public.employees(id),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 3.4 quotes — pipeline. Drives the weekly quote->renewal cadence.
create table if not exists public.quotes (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  carrier       text,
  line          app.policy_line,
  premium       numeric(12,2),
  status        app.quote_status not null default 'new',
  effective_date date,
  follow_up_date date,
  assigned_to   uuid references public.employees(id),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 3.5 contacts — THE contact log. "Every contact logged" lives here.
create table if not exists public.contacts (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id) on delete cascade,
  policy_id    uuid references public.policies(id) on delete set null,
  employee_id  uuid not null references public.employees(id),
  channel      app.contact_channel not null,
  direction    app.contact_direction not null default 'outbound',
  summary      text,
  outcome      text,
  occurred_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

-- 3.6 payments — receipt generation reads from here.
create table if not exists public.payments (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references public.clients(id) on delete cascade,
  policy_id           uuid references public.policies(id) on delete set null,
  amount              numeric(12,2) not null,
  method              text,                                 -- card|check|ach|cash
  reference           text,
  paid_at             timestamptz not null default now(),
  receipt_document_id uuid,                                 -- fk added after documents exists
  recorded_by         uuid references public.employees(id),
  created_at          timestamptz not null default now()
);

-- 3.7 documents — Ring 0 pointer to the object store (dec pages, receipts, etc.)
create table if not exists public.documents (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid references public.clients(id) on delete set null,
  policy_id         uuid references public.policies(id) on delete set null,
  kind              app.document_kind not null default 'other',
  status            app.document_status not null default 'received',
  storage_bucket    text not null,                          -- 'dec-pages','receipts',...
  storage_path      text not null,                          -- object key inside the bucket
  original_filename text,
  mime_type         text,
  extracted_json    jsonb,                                  -- dec-page extraction output
  uploaded_by       uuid references public.employees(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- now wire payments.receipt_document_id -> documents.id
do $$ begin
  alter table public.payments
    add constraint payments_receipt_document_fk
    foreign key (receipt_document_id) references public.documents(id) on delete set null;
exception when duplicate_object then null; end $$;

-- 3.8 tasks — cadence + watchdog write here; Kanban can mirror.
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  detail      text,
  client_id   uuid references public.clients(id) on delete cascade,
  policy_id   uuid references public.policies(id) on delete set null,
  assigned_to uuid references public.employees(id),
  due_date    date,
  priority    int not null default 3,                       -- 0 (P0) .. 3 (P3)
  status      app.task_status not null default 'open',
  source      text,                                         -- cron|webhook|intake|manual
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 3.9 audit_log — Ring 0 audit trail (Ring 1 = the git-versioned Vault).
create table if not exists public.audit_log (
  id            uuid primary key default gen_random_uuid(),
  actor_employee_id uuid references public.employees(id),
  action        text not null,                              -- e.g. 'policy.update'
  entity_type   text not null,
  entity_id     uuid,
  before        jsonb,
  after         jsonb,
  occurred_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. INDEXES (each with the query pattern it serves)
-- ---------------------------------------------------------------------------
-- Renewal sweeps (cadence engine, watchdog): "policies expiring in N days"
create index if not exists idx_policies_expiration on public.policies(expiration_date);
-- Client drill-down on every screen and intake reconcile
create index if not exists idx_policies_client on public.policies(client_id);
create index if not exists idx_policies_assigned on public.policies(assigned_to);
-- "Last contact for this client" lookups during cadence checks
create index if not exists idx_contacts_client_time on public.contacts(client_id, occurred_at desc);
-- Pipeline follow-up sweeps
create index if not exists idx_quotes_followup on public.quotes(follow_up_date);
create index if not exists idx_quotes_client on public.quotes(client_id);
-- Book-of-business filtering by rep
create index if not exists idx_clients_assigned on public.clients(assigned_to);
-- Intake worker picks up unprocessed docs
create index if not exists idx_documents_status on public.documents(status);
create index if not exists idx_documents_client on public.documents(client_id);
-- Rep task list (assigned + open + due soon)
create index if not exists idx_tasks_assignee on public.tasks(assigned_to, status, due_date);
-- Payment lookups for receipts
create index if not exists idx_payments_client on public.payments(client_id);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['employees','clients','policies','quotes','documents','tasks']
  loop
    execute format(
      'drop trigger if exists trg_touch_%1$s on public.%1$s;
       create trigger trg_touch_%1$s before update on public.%1$s
       for each row execute function app.touch_updated_at();', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. RLS HELPER FUNCTIONS (SECURITY DEFINER, pinned search_path)
-- ---------------------------------------------------------------------------
create or replace function app.current_role()
returns app.employee_role
language sql stable security definer set search_path = public, app as $$
  select role from public.employees where id = auth.uid();
$$;

create or replace function app.is_privileged()
returns boolean
language sql stable security definer set search_path = public, app as $$
  select coalesce(app.current_role() in ('owner','manager'), false);
$$;

-- ---------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
-- NOTE: The lewis-crm MCP server runs server-side with the SERVICE ROLE key,
-- which bypasses RLS by design, and enforces the same book-of-business scope in
-- application logic using the calling profile's employee_id. These RLS policies
-- are the hard second line of defense for the CRM web app and any anon-key path.

alter table public.employees enable row level security;
alter table public.clients   enable row level security;
alter table public.policies  enable row level security;
alter table public.quotes    enable row level security;
alter table public.contacts  enable row level security;
alter table public.payments  enable row level security;
alter table public.documents enable row level security;
alter table public.tasks     enable row level security;
alter table public.audit_log enable row level security;

-- employees: self or privileged
drop policy if exists employees_access on public.employees;
create policy employees_access on public.employees for all
  using (id = auth.uid() or app.is_privileged())
  with check (id = auth.uid() or app.is_privileged());

-- clients: assigned rep or privileged
drop policy if exists clients_access on public.clients;
create policy clients_access on public.clients for all
  using (app.is_privileged() or assigned_to = auth.uid())
  with check (app.is_privileged() or assigned_to = auth.uid());

-- policies: assigned rep or privileged
drop policy if exists policies_access on public.policies;
create policy policies_access on public.policies for all
  using (app.is_privileged() or assigned_to = auth.uid()
         or exists (select 1 from public.clients c where c.id = client_id and c.assigned_to = auth.uid()))
  with check (app.is_privileged() or assigned_to = auth.uid()
         or exists (select 1 from public.clients c where c.id = client_id and c.assigned_to = auth.uid()));

-- quotes: assigned rep or privileged
drop policy if exists quotes_access on public.quotes;
create policy quotes_access on public.quotes for all
  using (app.is_privileged() or assigned_to = auth.uid()
         or exists (select 1 from public.clients c where c.id = client_id and c.assigned_to = auth.uid()))
  with check (app.is_privileged() or assigned_to = auth.uid()
         or exists (select 1 from public.clients c where c.id = client_id and c.assigned_to = auth.uid()));

-- contacts: the logger or privileged or the assigned rep of the client
drop policy if exists contacts_access on public.contacts;
create policy contacts_access on public.contacts for all
  using (app.is_privileged() or employee_id = auth.uid()
         or exists (select 1 from public.clients c where c.id = client_id and c.assigned_to = auth.uid()))
  with check (app.is_privileged() or employee_id = auth.uid()
         or exists (select 1 from public.clients c where c.id = client_id and c.assigned_to = auth.uid()));

-- payments / documents / tasks: privileged or the assigned rep of the client
drop policy if exists payments_access on public.payments;
create policy payments_access on public.payments for all
  using (app.is_privileged()
         or exists (select 1 from public.clients c where c.id = client_id and c.assigned_to = auth.uid()))
  with check (app.is_privileged()
         or exists (select 1 from public.clients c where c.id = client_id and c.assigned_to = auth.uid()));

drop policy if exists documents_access on public.documents;
create policy documents_access on public.documents for all
  using (app.is_privileged() or uploaded_by = auth.uid()
         or exists (select 1 from public.clients c where c.id = client_id and c.assigned_to = auth.uid()))
  with check (app.is_privileged() or uploaded_by = auth.uid()
         or exists (select 1 from public.clients c where c.id = client_id and c.assigned_to = auth.uid()));

drop policy if exists tasks_access on public.tasks;
create policy tasks_access on public.tasks for all
  using (app.is_privileged() or assigned_to = auth.uid())
  with check (app.is_privileged() or assigned_to = auth.uid());

-- audit_log: privileged read; inserts via service role only
drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select
  using (app.is_privileged());

-- ---------------------------------------------------------------------------
-- 7. STORAGE BUCKETS (the "file server for data") + policies
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('dec-pages','dec-pages', false),
  ('receipts','receipts', false),
  ('documents','documents', false),
  ('policy-docs','policy-docs', false)
on conflict (id) do nothing;

-- Authenticated employees only; the MCP server (service role) bypasses these and
-- is the primary writer/reader. Path convention: <client_id>/<filename>.
drop policy if exists storage_employee_read on storage.objects;
create policy storage_employee_read on storage.objects for select
  using (
    bucket_id in ('dec-pages','receipts','documents','policy-docs')
    and exists (select 1 from public.employees e where e.id = auth.uid() and e.active)
  );

drop policy if exists storage_employee_write on storage.objects;
create policy storage_employee_write on storage.objects for insert
  with check (
    bucket_id in ('dec-pages','receipts','documents','policy-docs')
    and exists (select 1 from public.employees e where e.id = auth.uid() and e.active)
  );

-- =============================================================================
-- 8. EMPLOYEE ROSTER — required config. Run in production (real staff, not PII).
-- =============================================================================
-- Each id MUST equal the person's Supabase Auth user id. Create the 6 auth users
-- first (Dashboard > Authentication > Users > Add user, or the Admin API), then
-- replace the <...-auth-uid> placeholders with the real auth IDs and run this.
-- role  = RLS access level: owner/manager = everything; producer/csr = own book.
-- title = human job title, independent of access level.
--
-- insert into public.employees (id, full_name, title, role, email, hermes_profile) values
--   ('<brian-auth-uid>',   'Brian Lewis',    'CEO',            'owner',    'brian@lewisinsurance.com',   'brian'),
--   ('<letitia-auth-uid>', 'Letitia Lewis',  'Accountant',     'manager',  'letitia@lewisinsurance.com', 'letitia'),
--   ('<landen-auth-uid>',  'Landen Lewis',   'Vice President', 'manager',  'landen@lewisinsurance.com',  'landen'),
--   ('<jacob-auth-uid>',   'Jacob Soucinek', 'Producer',       'producer', 'jacob@lewisinsurance.com',   'jacob'),
--   ('<kelli-auth-uid>',   'Kelli Lee',      'Producer',       'producer', 'kelli@lewisinsurance.com',   'kelli'),
--   ('<tori-auth-uid>',    'Tori Hill',      'CSR',            'csr',      'tori@lewisinsurance.com',    'tori')   -- hired 2026-06-24
-- on conflict (id) do nothing;

-- =============================================================================
-- 9. ROLLBACK DDL  (reverse order — run only to tear the platform layer down)
-- =============================================================================
-- drop policy if exists storage_employee_write on storage.objects;
-- drop policy if exists storage_employee_read  on storage.objects;
-- delete from storage.buckets where id in ('dec-pages','receipts','documents','policy-docs');
-- drop table if exists public.audit_log cascade;
-- drop table if exists public.tasks     cascade;
-- alter table if exists public.payments drop constraint if exists payments_receipt_document_fk;
-- drop table if exists public.documents cascade;
-- drop table if exists public.payments  cascade;
-- drop table if exists public.contacts  cascade;
-- drop table if exists public.quotes    cascade;
-- drop table if exists public.policies  cascade;
-- drop table if exists public.clients   cascade;
-- drop table if exists public.employees cascade;
-- drop function if exists app.is_privileged();
-- drop function if exists app.current_role();
-- drop function if exists app.touch_updated_at();
-- drop type if exists app.task_status, app.document_status, app.document_kind,
--   app.contact_direction, app.contact_channel, app.quote_status,
--   app.policy_status, app.policy_line, app.client_type, app.employee_role;
-- drop schema if exists app cascade;
-- =============================================================================
