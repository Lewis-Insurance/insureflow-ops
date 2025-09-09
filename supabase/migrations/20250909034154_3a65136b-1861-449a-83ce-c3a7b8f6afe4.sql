-- =============================================================
-- 3) TAGS + CUSTOMER_TAGS (M2M)
-- =============================================================
create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_tags_updated_at on public.tags;
create trigger trg_tags_updated_at
before update on public.tags
for each row execute function public.set_updated_at();

-- case-insensitive uniqueness per account (use UNIQUE INDEX on expression)
create unique index if not exists uq_tags_account_lower_name
  on public.tags (account_id, lower(name));

-- link table
create table if not exists public.customer_tags (
  customer_id uuid not null,
  tag_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (customer_id, tag_id)
);

-- Ensure FKs exist
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'customer_tags_customer_id_fkey'
      and conrelid = 'public.customer_tags'::regclass
  ) then
    alter table public.customer_tags
      add constraint customer_tags_customer_id_fkey
      foreign key (customer_id) references public.customers(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'customer_tags_tag_id_fkey'
      and conrelid = 'public.customer_tags'::regclass
  ) then
    alter table public.customer_tags
      add constraint customer_tags_tag_id_fkey
      foreign key (tag_id) references public.tags(id) on delete cascade;
  end if;
end$$;

create index if not exists idx_customer_tags_customer on public.customer_tags(customer_id);
create index if not exists idx_customer_tags_tag on public.customer_tags(tag_id);

-- =============================================================
-- 4) ENUMS
-- =============================================================
do $$ begin
  if not exists (select 1 from pg_type where typname = 'note_type') then
    create type public.note_type as enum ('general','call','email','meeting','system');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'task_status') then
    create type public.task_status as enum ('todo','in_progress','blocked','done','cancelled');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'opportunity_stage') then
    create type public.opportunity_stage as enum ('new','qualified','proposal','negotiation','won','lost');
  end if;
end $$;