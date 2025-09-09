-- =============================================================
-- Lewis Insurance App – Customers Action Menu
-- SCHEMA ASSERT & REPAIR (Idempotent, safe to rerun)
-- Goal: ensure DB matches the agreed schema & RLS model
-- =============================================================

-- ---------- Extensions ----------
create extension if not exists pg_trgm;
create extension if not exists pgcrypto; -- gen_random_uuid()

-- ---------- Utility triggers ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

-- =============================================================
-- 1) CORE: accounts & memberships
-- =============================================================
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text default 'household',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_accounts_updated_at on public.accounts;
create trigger trg_accounts_updated_at
before update on public.accounts
for each row execute function public.set_updated_at();

create table if not exists public.account_memberships (
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('owner','staff','viewer')),
  created_at timestamptz not null default now(),
  primary key (account_id, user_id)
);
create index if not exists idx_account_memberships_user on public.account_memberships(user_id);

-- =============================================================
-- 2) CUSTOMERS
-- =============================================================
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  external_ref text,
  type text default 'individual',   -- 'individual' | 'company'
  status text default 'active',     -- 'active' | 'lead' | 'inactive'
  name text not null,
  phone text,
  email text,
  website text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country text default 'US',
  notes_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector
);

-- Remove legacy single-tag column if it exists
alter table public.customers drop column if exists tag_id;

-- Search vector maintenance
create or replace function public.customers_tsvector_update()
returns trigger language plpgsql as $$
begin
  new.search_vector :=
    setweight(to_tsvector('simple', coalesce(new.name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.email, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(new.phone, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(new.city, '')), 'D');
  return new;
end; $$;

drop trigger if exists trg_customers_updated_at on public.customers;
create trigger trg_customers_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

drop trigger if exists trg_customers_tsv on public.customers;
create trigger trg_customers_tsv
before insert or update on public.customers
for each row execute function public.customers_tsvector_update();

create index if not exists idx_customers_account on public.customers(account_id);
create index if not exists idx_customers_search on public.customers using gin (search_vector);