-- Unify notes into a single, account-scoped, no-limit store.
--
-- customer_notes becomes the canonical notes table (keyed customer_id = accounts.id).
-- Legacy `notes` (account/policy notes) and STANDARD `renewal_notes` are folded in so a
-- note shows seamlessly on the customer, their policies, and their standard renewals.
--
-- AO Renewals are deliberately EXCLUDED: `ao_renewal_notes` stays its own separate module
-- and is not touched here.

-- 1. Extend customer_notes into the canonical shared store -----------------------------
alter table public.customer_notes
  add column if not exists policy_id   uuid references public.policies(id) on delete set null,
  add column if not exists renewal_id  uuid references public.renewals(id) on delete set null,
  add column if not exists updated_at  timestamptz not null default now(),
  add column if not exists updated_by  uuid references auth.users(id),
  add column if not exists source      text not null default 'manual',
  add column if not exists deleted_at  timestamptz;

create index if not exists idx_customer_notes_customer on public.customer_notes (customer_id, created_at desc);
create index if not exists idx_customer_notes_policy   on public.customer_notes (policy_id)  where policy_id  is not null;
create index if not exists idx_customer_notes_renewal  on public.customer_notes (renewal_id) where renewal_id is not null;

-- 2. Fold legacy `notes` (account / policy notes) into customer_notes -------------------
--    Idempotent: original note id is preserved as the customer_notes id.
insert into public.customer_notes (id, customer_id, note_text, created_by, policy_id, source, created_at, updated_at)
select n.id, n.account_id, n.body, n.author_id, n.policy_id, 'legacy_notes', n.created_at, coalesce(n.created_at, now())
from public.notes n
where n.deleted_at is null
  and n.account_id is not null
  and coalesce(btrim(n.body), '') <> ''
on conflict (id) do nothing;

-- 3. Fold STANDARD renewal notes into customer_notes (account-scoped, tagged renewal_id)
insert into public.customer_notes (id, customer_id, note_text, created_by, renewal_id, source, created_at, updated_at)
select rn.id, r.account_id, rn.content, rn.created_by, rn.renewal_id, 'legacy_renewal_notes',
       rn.created_at, coalesce(rn.updated_at, rn.created_at, now())
from public.renewal_notes rn
join public.renewals r on r.id = rn.renewal_id
where r.account_id is not null
  and coalesce(btrim(rn.content), '') <> ''
on conflict (id) do nothing;

-- 4. Read RPC: every non-deleted note for an account, newest first, with author + context.
create or replace function public.get_account_notes(p_account_id uuid)
returns table (
  id            uuid,
  note_text     text,
  created_at    timestamptz,
  updated_at    timestamptz,
  created_by    uuid,
  author_name   text,
  is_important  boolean,
  policy_id     uuid,
  renewal_id    uuid,
  context_label text,
  source        text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Mirror the customer_notes RLS: staff only.
  if not public.is_staff() then
    return;
  end if;

  return query
  select
    n.id,
    n.note_text,
    n.created_at,
    n.updated_at,
    n.created_by,
    coalesce(nullif(btrim(p.full_name), ''), p.email, 'Team member') as author_name,
    coalesce(n.is_important, false) as is_important,
    n.policy_id,
    n.renewal_id,
    case
      when n.policy_id is not null then
        nullif(btrim(concat_ws(' ', 'Policy', pol.policy_number)), 'Policy')
      when n.renewal_id is not null then
        nullif(btrim(concat_ws(' ', 'Renewal', rnw.carrier)), 'Renewal')
      else null
    end as context_label,
    n.source
  from public.customer_notes n
  left join public.profiles p   on p.id   = n.created_by
  left join public.policies pol on pol.id = n.policy_id
  left join public.renewals rnw on rnw.id = n.renewal_id
  where n.customer_id = p_account_id
    and n.deleted_at is null
  order by n.created_at desc;
end;
$$;

revoke all on function public.get_account_notes(uuid) from anon, public;
grant execute on function public.get_account_notes(uuid) to authenticated;
