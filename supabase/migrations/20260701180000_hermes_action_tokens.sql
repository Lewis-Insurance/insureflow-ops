-- Dev/prod: durable Slack action tokens (from lewis-the-floor 20260630010500_action_tokens.sql).
-- Required for Approve/Edit/Kill buttons on delivered decision cards.

create schema if not exists hermes;

create table if not exists hermes.action_tokens (
  token text primary key,
  payload jsonb not null,
  expires_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table hermes.action_tokens is
  'Durable, single-use, TTL-bounded Slack action tokens. payload is server-side only; redeem flips consumed_at atomically.';

create index if not exists action_tokens_expires_at_idx
  on hermes.action_tokens (expires_at);

alter table hermes.action_tokens enable row level security;

revoke all privileges on table hermes.action_tokens from anon, authenticated;

grant insert, select, update on table hermes.action_tokens to hermes_app;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'hermes' and tablename = 'action_tokens' and policyname = 'action_tokens_hermes_app_select') then
    execute 'create policy action_tokens_hermes_app_select on hermes.action_tokens for select to hermes_app using (true)';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'hermes' and tablename = 'action_tokens' and policyname = 'action_tokens_hermes_app_insert') then
    execute 'create policy action_tokens_hermes_app_insert on hermes.action_tokens for insert to hermes_app with check (true)';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'hermes' and tablename = 'action_tokens' and policyname = 'action_tokens_hermes_app_update') then
    execute 'create policy action_tokens_hermes_app_update on hermes.action_tokens for update to hermes_app using (true) with check (true)';
  end if;
end $$;
