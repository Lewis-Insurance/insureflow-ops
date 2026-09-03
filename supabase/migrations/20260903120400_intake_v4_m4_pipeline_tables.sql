-- intake-v4 migration M4: the pipeline item and its three children.
--
-- ledger version: pending
--
-- NEEDS LANDEN APPROVAL BEFORE PROD APPLY. Apply through the Supabase management API
-- (MCP apply_migration) only. Never run a CLI push against production.
--
-- What this is
--   One new hub table and three children. A pipeline item is a row that says "we are
--   working this sale". It points at exactly one party (a prospect or an existing
--   customer) and optionally at the renewal or policy it came from. It carries the
--   stage, the lines wanted, the quotes, the notes, who is lightly on it, the next
--   follow up and the outcome.
--
--   Leads, customers and renewals do not carry sale stages any more. They are pulled
--   into the pipeline as items and pulled out when the item is bound or lost. That is
--   what makes "the same stages for everything" true in the data and not only on the
--   screen.
--
-- Membership is always deliberate
--   Nothing creates an item automatically except the New Lead page, where typing the
--   prospect in IS the decision to work it. Every other door (Work this on a renewal,
--   Remarket on a policy, Start a sale on a customer) is a button somebody presses.
--
-- Stages, one set for all four kinds
--   new, working, quoted, proposed, bound, lost
--   quoted means carrier quotes are in hand. proposed means they were presented to
--   the client and the office is waiting on an answer.
--
-- One open item per party and source
--   Four partial unique indexes, one per shape of "source", each covering only open
--   items that are not soft deleted. A second attempt to start the same work finds
--   the existing item instead of creating a duplicate; pipeline_start (M5) returns it.
--
-- Tenant isolation
--   agency_workspace_id is NOT NULL on the item and the policies are the same
--   workspace membership shape used for leads in M3b. The children reach their
--   workspace through the parent item. Staff read, insert and update. No delete for
--   anyone; soft delete by setting deleted_at, guarded by prevent_hard_delete on the
--   item exactly as accounts, policies, leads and documents already do.
--
-- Audit
--   The existing log_audit trigger pattern is attached to pipeline_items, so every
--   insert, update and delete writes an audit_logs row the same way accounts,
--   policies, tasks, documents, carriers and payments already do.
--
-- Last touch
--   pipeline_items.last_touch_at is maintained by trigger: a stage change on the item
--   sets it, and adding a note or a quote reaches up and sets it on the parent. The
--   card on the board reads it as a recency band ("3d"), never as a bare date.
--
-- Also here
--   roof_year on lead_home_insurance. The table already has roof_age (an integer
--   number of years). Producers read the year off the dec page, and a year does not
--   go stale, so the New Lead page asks for the year. roof_age is left alone.
--
-- Smoke test after apply
--   1. staff create an item, a quote, a note and a line detail row: all succeed
--   2. non staff, portal member and anonymous attempts on all four tables: all refused
--   3. a second open item for the same party and source: refused by the index
--   4. insert then update an item: audit_logs gains two rows
--   5. add a note: the parent item's last_touch_at moves

-- ---------------------------------------------------------------------------
-- 1. The hub
-- ---------------------------------------------------------------------------
create table public.pipeline_items (
  id uuid primary key default gen_random_uuid(),
  agency_workspace_id uuid not null references public.agency_workspaces(id) on delete cascade,

  -- the party: exactly one of these two
  lead_id uuid references public.leads(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete cascade,

  kind text not null,
  stage text not null default 'new',

  -- where the work came from, when it came from somewhere
  source_renewal_id uuid references public.renewals(id) on delete set null,
  source_policy_id uuid references public.policies(id) on delete set null,

  lines_wanted text[] not null default '{}'::text[],

  -- light assignment: zero or more names, no permission meaning, anyone can change it
  assignees uuid[] not null default '{}'::uuid[],

  next_follow_up_date date,
  last_touch_at timestamp with time zone not null default now(),

  lost_reason text,
  lost_note text,
  bound_at timestamp with time zone,

  -- What the bind actually produced, written once by pipeline_bind. Binding an
  -- already bound item returns this instead of doing the work twice.
  bind_result jsonb,

  created_by uuid references auth.users(id),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  deleted_at timestamp with time zone,

  constraint pipeline_items_kind_check
    check (kind in ('new_business', 'cross_sell', 'renewal', 'rewrite')),
  constraint pipeline_items_stage_check
    check (stage in ('new', 'working', 'quoted', 'proposed', 'bound', 'lost')),
  constraint pipeline_items_lost_reason_check
    check (lost_reason is null or lost_reason in ('price', 'no_answer', 'went_elsewhere', 'not_eligible', 'other')),
  -- There is always a party.
  constraint pipeline_items_has_party_check
    check (lead_id is not null or account_id is not null),
  -- While the item is open the party is exactly one thing: a prospect or a customer.
  -- Binding is the moment a prospect becomes a customer, so a bound item may carry
  -- both: the lead it came from and the customer file it produced.
  constraint pipeline_items_one_party_until_bound_check
    check (stage = 'bound' or lead_id is null or account_id is null),
  -- at most one source
  constraint pipeline_items_one_source_check
    check ((source_renewal_id is not null)::int + (source_policy_id is not null)::int <= 1),
  -- bound_at is set when and only when the item is bound
  constraint pipeline_items_bound_at_check
    check ((stage = 'bound') = (bound_at is not null)),
  -- a lost item carries a reason
  constraint pipeline_items_lost_needs_reason_check
    check (stage <> 'lost' or lost_reason is not null)
);

comment on table public.pipeline_items is
  'One row per sale being worked. Party is a lead or an account, never both. Stages are the same for new business, cross sells, renewals and rewrites.';

-- One open item per party and source. "Open" is any stage that is not bound or lost.
create unique index pipeline_items_one_open_per_lead
  on public.pipeline_items (lead_id)
  where lead_id is not null
    and source_renewal_id is null and source_policy_id is null
    and stage not in ('bound', 'lost') and deleted_at is null;

create unique index pipeline_items_one_open_per_account
  on public.pipeline_items (account_id)
  where account_id is not null
    and source_renewal_id is null and source_policy_id is null
    and stage not in ('bound', 'lost') and deleted_at is null;

create unique index pipeline_items_one_open_per_renewal
  on public.pipeline_items (source_renewal_id)
  where source_renewal_id is not null
    and stage not in ('bound', 'lost') and deleted_at is null;

create unique index pipeline_items_one_open_per_policy
  on public.pipeline_items (source_policy_id)
  where source_policy_id is not null
    and stage not in ('bound', 'lost') and deleted_at is null;

create index pipeline_items_workspace_idx on public.pipeline_items (agency_workspace_id) where deleted_at is null;
create index pipeline_items_stage_idx on public.pipeline_items (stage) where deleted_at is null;
create index pipeline_items_follow_up_idx on public.pipeline_items (next_follow_up_date) where next_follow_up_date is not null and deleted_at is null;
create index pipeline_items_assignees_idx on public.pipeline_items using gin (assignees);
create index pipeline_items_lead_idx on public.pipeline_items (lead_id) where lead_id is not null;
create index pipeline_items_account_idx on public.pipeline_items (account_id) where account_id is not null;
create index pipeline_items_bound_at_idx on public.pipeline_items (bound_at) where bound_at is not null;

-- ---------------------------------------------------------------------------
-- 2. Quotes on an item
-- ---------------------------------------------------------------------------
create table public.pipeline_quotes (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.pipeline_items(id) on delete cascade,
  line text not null,

  -- Carrier is a directory id when it is known, free text until then. Bind refuses to
  -- create a policy from a free text carrier: the user picks or adds the real row
  -- first. Carrier data is never invented.
  carrier_id uuid references public.carriers(id),
  carrier_text text,

  premium numeric(12,2),
  term text,
  quoted_date date,
  status text not null default 'quoted',
  note text,

  -- Set by pipeline_bind: the policy this quote turned into. Gives the panel a direct
  -- link from the quote to the bound policy, and lets a repeated bind recognise work
  -- already done.
  bound_policy_id uuid references public.policies(id) on delete set null,

  created_by uuid references auth.users(id),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  deleted_at timestamp with time zone,

  constraint pipeline_quotes_status_check
    check (status in ('quoted', 'proposed', 'accepted', 'declined')),
  constraint pipeline_quotes_term_check
    check (term is null or term in ('semiannual', 'annual')),
  constraint pipeline_quotes_premium_check
    check (premium is null or premium >= 0),
  constraint pipeline_quotes_carrier_present_check
    check (carrier_id is not null or nullif(btrim(coalesce(carrier_text, '')), '') is not null)
);

comment on table public.pipeline_quotes is
  'One row per carrier quote on a pipeline item. Several lines and several carriers can sit on one item at once.';

create index pipeline_quotes_item_idx on public.pipeline_quotes (item_id) where deleted_at is null;
create index pipeline_quotes_status_idx on public.pipeline_quotes (item_id, status) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 3. The note thread on an item
-- ---------------------------------------------------------------------------
create table public.pipeline_notes (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.pipeline_items(id) on delete cascade,
  body text not null,
  created_by uuid references auth.users(id),
  created_at timestamp with time zone not null default now(),
  deleted_at timestamp with time zone,
  constraint pipeline_notes_body_check check (btrim(body) <> '')
);

comment on table public.pipeline_notes is
  'The running thread on a pipeline item, newest first. Folded into the customer file when the item binds.';

create index pipeline_notes_item_idx on public.pipeline_notes (item_id, created_at desc) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 4. Per line intake answers for the lighter lines
-- ---------------------------------------------------------------------------
-- Home, Auto and Commercial keep the rich tables that already exist
-- (lead_home_insurance, lead_auto_vehicles, lead_auto_drivers,
-- lead_commercial_insurance). Recreation, Flood, Condo, Renters, Umbrella and Life
-- are five to eight fields each and do not earn a table apiece, so they land here as
-- one row per lead and line. The field list for each line lives in a configuration
-- file in the front end, so adding a Florida specific field is a one line change.
create table public.lead_line_details (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  line text not null,
  details jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint lead_line_details_unique unique (lead_id, line)
);

comment on table public.lead_line_details is
  'Per line intake answers for the lighter lines. One row per lead and line; the shape of details is owned by the front end line configuration.';

create index lead_line_details_lead_idx on public.lead_line_details (lead_id);

-- ---------------------------------------------------------------------------
-- 5. roof_year on the existing home table
-- ---------------------------------------------------------------------------
alter table public.lead_home_insurance add column if not exists roof_year integer;
comment on column public.lead_home_insurance.roof_year is
  'Year the roof was last replaced, read off the dec page. Does not go stale the way roof_age does.';

-- ---------------------------------------------------------------------------
-- 6. Triggers: updated_at, hard delete guard, audit, last touch
-- ---------------------------------------------------------------------------
create trigger set_updated_at_pipeline_items before update on public.pipeline_items
  for each row execute function set_updated_at();
create trigger set_updated_at_pipeline_quotes before update on public.pipeline_quotes
  for each row execute function set_updated_at();
create trigger set_updated_at_lead_line_details before update on public.lead_line_details
  for each row execute function set_updated_at();

create trigger prevent_hard_delete_pipeline_items before delete on public.pipeline_items
  for each row execute function prevent_hard_delete();

create trigger audit_pipeline_items after insert or delete or update on public.pipeline_items
  for each row execute function log_audit();

-- last_touch_at moves when the stage changes on the item itself.
create or replace function public.pipeline_items_touch_on_stage()
returns trigger
language plpgsql
as $function$
begin
  if new.stage is distinct from old.stage then
    new.last_touch_at := now();
  end if;
  return new;
end;
$function$;

create trigger pipeline_items_touch_on_stage before update on public.pipeline_items
  for each row execute function public.pipeline_items_touch_on_stage();

-- last_touch_at also moves when a note or a quote lands on the item.
create or replace function public.pipeline_child_touch_parent()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.pipeline_items
     set last_touch_at = now()
   where id = coalesce(new.item_id, old.item_id);
  return coalesce(new, old);
end;
$function$;

create trigger pipeline_notes_touch_parent after insert or update on public.pipeline_notes
  for each row execute function public.pipeline_child_touch_parent();
create trigger pipeline_quotes_touch_parent after insert or update on public.pipeline_quotes
  for each row execute function public.pipeline_child_touch_parent();

-- ---------------------------------------------------------------------------
-- 7. Row level security: staff only, through workspace membership
-- ---------------------------------------------------------------------------
alter table public.pipeline_items enable row level security;
alter table public.pipeline_quotes enable row level security;
alter table public.pipeline_notes enable row level security;
alter table public.lead_line_details enable row level security;

-- A helper so the three child tables state the same rule once. SECURITY DEFINER so
-- the inner read of pipeline_items is not itself filtered by RLS, which would make
-- the policies recursive (the same trap 20260831120000 fixed for policies and
-- policy_named_insureds).
create or replace function public.pipeline_item_is_visible(p_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.pipeline_items pi
    join public.agency_workspace_memberships awm
      on awm.agency_workspace_id = pi.agency_workspace_id
    where pi.id = p_item_id
      and awm.user_id = auth.uid()
      and awm.status = 'active'
  );
$function$;

revoke execute on function public.pipeline_item_is_visible(uuid) from public;
revoke execute on function public.pipeline_item_is_visible(uuid) from anon;
grant execute on function public.pipeline_item_is_visible(uuid) to authenticated;
grant execute on function public.pipeline_item_is_visible(uuid) to service_role;

-- Why none of these read policies say "deleted_at is null"
--   PostgreSQL applies SELECT policies to the NEW row of an UPDATE. A read policy that
--   hides soft deleted rows therefore makes soft deleting impossible: the update is
--   refused with "new row violates row level security policy" the moment deleted_at is
--   set. This was proved on the branch while testing M3b, not reasoned about. Hiding
--   tombstones is the application's job here, exactly as it is for every other soft
--   deleting table in this codebase.

-- pipeline_items
create policy pipeline_items_select_staff on public.pipeline_items
  as permissive for select to authenticated
  using (
    exists (select 1 from public.agency_workspace_memberships awm
                where awm.agency_workspace_id = pipeline_items.agency_workspace_id
                  and awm.user_id = auth.uid() and awm.status = 'active')
  );
create policy pipeline_items_insert_staff on public.pipeline_items
  as permissive for insert to authenticated
  with check (
    exists (select 1 from public.agency_workspace_memberships awm
            where awm.agency_workspace_id = pipeline_items.agency_workspace_id
              and awm.user_id = auth.uid() and awm.status = 'active')
  );
create policy pipeline_items_update_staff on public.pipeline_items
  as permissive for update to authenticated
  using (
    exists (select 1 from public.agency_workspace_memberships awm
            where awm.agency_workspace_id = pipeline_items.agency_workspace_id
              and awm.user_id = auth.uid() and awm.status = 'active')
  )
  with check (
    exists (select 1 from public.agency_workspace_memberships awm
            where awm.agency_workspace_id = pipeline_items.agency_workspace_id
              and awm.user_id = auth.uid() and awm.status = 'active')
  );
create policy pipeline_items_no_delete on public.pipeline_items
  as permissive for delete to authenticated using (false);
create policy pipeline_items_service_role_all on public.pipeline_items
  as permissive for all to service_role using (true) with check (true);

-- pipeline_quotes
create policy pipeline_quotes_select_staff on public.pipeline_quotes
  as permissive for select to authenticated
  using (public.pipeline_item_is_visible(item_id));
create policy pipeline_quotes_insert_staff on public.pipeline_quotes
  as permissive for insert to authenticated
  with check (public.pipeline_item_is_visible(item_id));
create policy pipeline_quotes_update_staff on public.pipeline_quotes
  as permissive for update to authenticated
  using (public.pipeline_item_is_visible(item_id))
  with check (public.pipeline_item_is_visible(item_id));
create policy pipeline_quotes_no_delete on public.pipeline_quotes
  as permissive for delete to authenticated using (false);
create policy pipeline_quotes_service_role_all on public.pipeline_quotes
  as permissive for all to service_role using (true) with check (true);

-- pipeline_notes
create policy pipeline_notes_select_staff on public.pipeline_notes
  as permissive for select to authenticated
  using (public.pipeline_item_is_visible(item_id));
create policy pipeline_notes_insert_staff on public.pipeline_notes
  as permissive for insert to authenticated
  with check (public.pipeline_item_is_visible(item_id));
create policy pipeline_notes_update_staff on public.pipeline_notes
  as permissive for update to authenticated
  using (public.pipeline_item_is_visible(item_id))
  with check (public.pipeline_item_is_visible(item_id));
create policy pipeline_notes_no_delete on public.pipeline_notes
  as permissive for delete to authenticated using (false);
create policy pipeline_notes_service_role_all on public.pipeline_notes
  as permissive for all to service_role using (true) with check (true);

-- lead_line_details: scoped through the lead's workspace, the same shape as M3b.
create policy lead_line_details_select_staff on public.lead_line_details
  as permissive for select to authenticated
  using (exists (select 1 from public.leads l
                 join public.agency_workspace_memberships awm
                   on awm.agency_workspace_id = l.agency_workspace_id
                 where l.id = lead_line_details.lead_id
                   and l.deleted_at is null
                   and awm.user_id = auth.uid() and awm.status = 'active'));
create policy lead_line_details_insert_staff on public.lead_line_details
  as permissive for insert to authenticated
  with check (exists (select 1 from public.leads l
                      join public.agency_workspace_memberships awm
                        on awm.agency_workspace_id = l.agency_workspace_id
                      where l.id = lead_line_details.lead_id
                        and awm.user_id = auth.uid() and awm.status = 'active'));
create policy lead_line_details_update_staff on public.lead_line_details
  as permissive for update to authenticated
  using (exists (select 1 from public.leads l
                 join public.agency_workspace_memberships awm
                   on awm.agency_workspace_id = l.agency_workspace_id
                 where l.id = lead_line_details.lead_id
                   and awm.user_id = auth.uid() and awm.status = 'active'))
  with check (exists (select 1 from public.leads l
                      join public.agency_workspace_memberships awm
                        on awm.agency_workspace_id = l.agency_workspace_id
                      where l.id = lead_line_details.lead_id
                        and awm.user_id = auth.uid() and awm.status = 'active'));
create policy lead_line_details_no_delete on public.lead_line_details
  as permissive for delete to authenticated using (false);
create policy lead_line_details_service_role_all on public.lead_line_details
  as permissive for all to service_role using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 8. Grants. Anonymous gets nothing on any of the four.
-- ---------------------------------------------------------------------------
grant select, insert, update on public.pipeline_items to authenticated;
grant select, insert, update on public.pipeline_quotes to authenticated;
grant select, insert, update on public.pipeline_notes to authenticated;
grant select, insert, update on public.lead_line_details to authenticated;

grant all on public.pipeline_items to service_role;
grant all on public.pipeline_quotes to service_role;
grant all on public.pipeline_notes to service_role;
grant all on public.lead_line_details to service_role;

revoke all on public.pipeline_items from anon;
revoke all on public.pipeline_quotes from anon;
revoke all on public.pipeline_notes from anon;
revoke all on public.lead_line_details from anon;

-- >>> DOWN BEGIN
/*
drop trigger if exists pipeline_quotes_touch_parent on public.pipeline_quotes;
drop trigger if exists pipeline_notes_touch_parent on public.pipeline_notes;
drop trigger if exists pipeline_items_touch_on_stage on public.pipeline_items;
drop trigger if exists audit_pipeline_items on public.pipeline_items;
drop trigger if exists prevent_hard_delete_pipeline_items on public.pipeline_items;
drop trigger if exists set_updated_at_lead_line_details on public.lead_line_details;
drop trigger if exists set_updated_at_pipeline_quotes on public.pipeline_quotes;
drop trigger if exists set_updated_at_pipeline_items on public.pipeline_items;

drop table if exists public.lead_line_details;
drop table if exists public.pipeline_notes;
drop table if exists public.pipeline_quotes;
drop table if exists public.pipeline_items;

drop function if exists public.pipeline_child_touch_parent();
drop function if exists public.pipeline_items_touch_on_stage();
drop function if exists public.pipeline_item_is_visible(uuid);

alter table public.lead_home_insurance drop column if exists roof_year;
*/
-- >>> DOWN END
