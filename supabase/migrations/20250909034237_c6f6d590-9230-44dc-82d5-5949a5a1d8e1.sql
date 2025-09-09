-- =============================================================
-- 5) NOTES / TASKS / OPPORTUNITIES (+ ensure customer_id FKs)
-- =============================================================

-- NOTES
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  author_id uuid,
  type public.note_type not null default 'general',
  title text,
  body text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_notes_updated_at on public.notes;
create trigger trg_notes_updated_at
before update on public.notes
for each row execute function public.set_updated_at();

alter table public.notes add column if not exists customer_id uuid;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'notes_customer_id_fkey'
      and conrelid = 'public.notes'::regclass
  ) then
    alter table public.notes
      add constraint notes_customer_id_fkey
      foreign key (customer_id) references public.customers(id) on delete cascade;
  end if;
end$$;

create index if not exists idx_notes_customer on public.notes(customer_id);
create index if not exists idx_notes_account on public.notes(account_id);

-- TASKS
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  assignee_id uuid,
  title text not null,
  details text,
  due_at timestamptz,
  status public.task_status not null default 'todo',
  priority int default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

alter table public.tasks add column if not exists customer_id uuid;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tasks_customer_id_fkey'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_customer_id_fkey
      foreign key (customer_id) references public.customers(id) on delete cascade;
  end if;
end$$;

create index if not exists idx_tasks_customer on public.tasks(customer_id);
create index if not exists idx_tasks_account on public.tasks(account_id);
create index if not exists idx_tasks_assignee on public.tasks(assignee_id);

-- OPPORTUNITIES
create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null,
  stage public.opportunity_stage not null default 'new',
  expected_value numeric(12,2),
  close_date date,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_opportunities_updated_at on public.opportunities;
create trigger trg_opportunities_updated_at
before update on public.opportunities
for each row execute function public.set_updated_at();

alter table public.opportunities add column if not exists customer_id uuid;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'opportunities_customer_id_fkey'
      and conrelid = 'public.opportunities'::regclass
  ) then
    alter table public.opportunities
      add constraint opportunities_customer_id_fkey
      foreign key (customer_id) references public.customers(id) on delete cascade;
  end if;
end$$;

create index if not exists idx_opps_customer on public.opportunities(customer_id);
create index if not exists idx_opps_account on public.opportunities(account_id);