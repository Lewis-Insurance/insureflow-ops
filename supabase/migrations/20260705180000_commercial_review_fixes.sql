-- ============================================================================
-- Commercial review fixes (Bugbot + Codex on PRs #52/#54, 2026-07-05)
-- ============================================================================
-- 1) commercial_vehicles.unit_number integer -> text (fleet units are
--    alphanumeric; mirrors canopy_commercial_vehicles.unit_number, verified
--    text on prod).
-- 2) Append-only enforcement on the two evidence tables (submission_events,
--    submission_declinations): RLS already denies authenticated UPDATE/DELETE
--    (no policies), but service-role code paths bypass RLS; a block trigger
--    makes accidental mutation impossible there too.
-- 3) Cross-account link validation (the tenancy trigger scopes rows to their
--    ACCOUNT's workspace but did not tie link columns together):
--      - commercial_vehicles.garaging_location_id must be the vehicle's account
--      - submission_offer_rejections.submission_id/policy_id must match account
--      - quotes.submission_id must match the quote's account
-- 4) Atomic add_submission_quote / bind_submission_quote RPCs, replacing the
--    client-side sequences (partial-state windows, stranded won/lost on
--    failure, unchecked save_master_coi_fields rejections, empty-limit binds).
-- NOTE (Codex P1 on quote_coverages RLS): NO change - the legacy permissive
-- policies ("Users can insert coverages for their quotes") OR with the
-- account_memberships ones, so staff writes already pass; and these RPCs write
-- as SECURITY DEFINER regardless. Verified against live pg_policies.
-- Idempotent throughout.

-- ---------------------------------------------------------------------------
-- 1) unit_number -> text
-- ---------------------------------------------------------------------------
alter table public.commercial_vehicles
  alter column unit_number type text using unit_number::text;

-- ---------------------------------------------------------------------------
-- 2) Append-only evidence tables
-- ---------------------------------------------------------------------------
create or replace function public.commercial_block_mutation()
returns trigger language plpgsql set search_path to 'public'
as $$
begin
  raise exception '% is append-only evidence; % is not allowed', TG_TABLE_NAME, TG_OP;
end; $$;

drop trigger if exists trg_submission_events_append_only on public.submission_events;
create trigger trg_submission_events_append_only
  before update or delete on public.submission_events
  for each row execute function public.commercial_block_mutation();

drop trigger if exists trg_submission_declinations_append_only on public.submission_declinations;
create trigger trg_submission_declinations_append_only
  before update or delete on public.submission_declinations
  for each row execute function public.commercial_block_mutation();

-- ---------------------------------------------------------------------------
-- 3) Cross-account link validation
-- ---------------------------------------------------------------------------
create or replace function public.commercial_vehicles_check_garaging()
returns trigger language plpgsql set search_path to 'public'
as $$
begin
  if new.garaging_location_id is not null and not exists (
    select 1 from public.commercial_locations l
    where l.id = new.garaging_location_id
      and l.account_id = new.account_id
      and l.deleted_at is null
  ) then
    raise exception 'garaging_location_id must be a live location on the same account';
  end if;
  return new;
end; $$;
drop trigger if exists trg_commercial_vehicles_garaging on public.commercial_vehicles;
create trigger trg_commercial_vehicles_garaging
  before insert or update of garaging_location_id, account_id on public.commercial_vehicles
  for each row execute function public.commercial_vehicles_check_garaging();

create or replace function public.offer_rejections_check_links()
returns trigger language plpgsql set search_path to 'public'
as $$
begin
  if new.submission_id is not null and not exists (
    select 1 from public.commercial_submissions s
    where s.id = new.submission_id and s.account_id = new.account_id
  ) then
    raise exception 'submission_id must belong to the same account as the offer record';
  end if;
  if new.policy_id is not null and not exists (
    select 1 from public.policies p
    where p.id = new.policy_id and p.account_id = new.account_id
  ) then
    raise exception 'policy_id must belong to the same account as the offer record';
  end if;
  return new;
end; $$;
drop trigger if exists trg_offer_rejections_links on public.submission_offer_rejections;
create trigger trg_offer_rejections_links
  before insert or update of submission_id, policy_id, account_id on public.submission_offer_rejections
  for each row execute function public.offer_rejections_check_links();

create or replace function public.quotes_check_submission_account()
returns trigger language plpgsql set search_path to 'public'
as $$
begin
  if new.submission_id is not null and not exists (
    select 1 from public.commercial_submissions s
    where s.id = new.submission_id and s.account_id = new.account_id
  ) then
    raise exception 'quotes.submission_id must belong to the same account as the quote';
  end if;
  return new;
end; $$;
drop trigger if exists trg_quotes_submission_account on public.quotes;
create trigger trg_quotes_submission_account
  before insert or update of submission_id, account_id on public.quotes
  for each row execute function public.quotes_check_submission_account();

-- ---------------------------------------------------------------------------
-- 4a) add_submission_quote: one transaction for quote + coverages + status.
-- ---------------------------------------------------------------------------
create or replace function public.add_submission_quote(
  p_submission_id uuid,
  p_carrier_name text,
  p_premium numeric default null,
  p_each_occurrence numeric default null,
  p_general_aggregate numeric default null
) returns uuid
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_sub record;
  v_quote_id uuid;
begin
  select * into v_sub from public.commercial_submissions
  where id = p_submission_id and deleted_at is null;
  if v_sub.id is null then raise exception 'submission not found'; end if;
  if not (public.is_staff() and public.is_agency_member(v_sub.agency_workspace_id)) then
    raise exception 'staff only';
  end if;
  if nullif(btrim(coalesce(p_carrier_name,'')),'') is null then
    raise exception 'carrier name required';
  end if;

  insert into public.quotes (account_id, submission_id, line_of_business, premium, status, quoted_at, options, created_by)
  values (v_sub.account_id, p_submission_id, 'gl', p_premium, 'open', now(),
          jsonb_build_object('carrier_name', btrim(p_carrier_name)), auth.uid())
  returning id into v_quote_id;

  if p_each_occurrence is not null then
    insert into public.quote_coverages (quote_id, coverage_type, limit_amount)
    values (v_quote_id, 'gl_each_occurrence', p_each_occurrence);
  end if;
  if p_general_aggregate is not null then
    insert into public.quote_coverages (quote_id, coverage_type, limit_amount)
    values (v_quote_id, 'gl_general_aggregate', p_general_aggregate);
  end if;

  update public.commercial_submissions
  set status = 'quoted'
  where id = p_submission_id
    and status in ('draft','intake','packet_ready','signing','submitted');

  return v_quote_id;
end; $$;
comment on function public.add_submission_quote(uuid, text, numeric, numeric, numeric) is
  'Atomic quote capture on a commercial submission (quote + structured GL coverages + status advance in one txn). Staff + workspace gated inside; SECURITY DEFINER.';
revoke execute on function public.add_submission_quote(uuid, text, numeric, numeric, numeric) from anon, public;
grant  execute on function public.add_submission_quote(uuid, text, numeric, numeric, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 4b) bind_submission_quote: the whole bind in one transaction.
--     Requires BOTH COI-required GL limits (an empty-limit bind closes the
--     file without the values the feature exists to propagate). Checks the
--     save_master_coi_fields result for rejected paths. Locks the submission
--     row so concurrent binds serialize (no two won quotes).
-- ---------------------------------------------------------------------------
create or replace function public.bind_submission_quote(
  p_quote_id uuid,
  p_policy_id uuid,
  p_each_occurrence numeric,
  p_general_aggregate numeric
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_quote record;
  v_sub record;
  v_save jsonb;
begin
  select * into v_quote from public.quotes
  where id = p_quote_id and deleted_at is null;
  if v_quote.id is null then raise exception 'quote not found'; end if;
  if v_quote.submission_id is null then raise exception 'quote is not linked to a submission'; end if;

  -- Serialize concurrent binds on the submission.
  select * into v_sub from public.commercial_submissions
  where id = v_quote.submission_id and deleted_at is null
  for update;
  if v_sub.id is null then raise exception 'submission not found'; end if;
  if not (public.is_staff() and public.is_agency_member(v_sub.agency_workspace_id)) then
    raise exception 'staff only';
  end if;
  if v_sub.status = 'bound' then raise exception 'submission is already bound'; end if;
  if v_quote.status <> 'open' then raise exception 'quote is % - only open quotes can bind', v_quote.status; end if;
  if p_each_occurrence is null or p_general_aggregate is null then
    raise exception 'both GL limits (each occurrence, general aggregate) are required to bind';
  end if;
  if not exists (
    select 1 from public.policies p
    where p.id = p_policy_id and p.account_id = v_sub.account_id and p.deleted_at is null
  ) then
    raise exception 'policy does not belong to this submission''s account';
  end if;

  -- Write the bound limits through the registry-whitelisted COI path; refuse
  -- the bind when any path is rejected (auth.uid() is the calling staff user,
  -- so save_master_coi_fields'' own staff gate applies normally).
  v_save := public.save_master_coi_fields(
    p_policy_id,
    jsonb_build_object(
      'cgl_details.limits.each_occurrence',  p_each_occurrence,
      'cgl_details.limits.general_aggregate', p_general_aggregate
    )
  );
  if coalesce(jsonb_array_length(v_save->'rejected'), 0) > 0 then
    raise exception 'COI field write rejected: %', v_save->'rejected';
  end if;

  update public.quotes set status = 'won' where id = p_quote_id;
  update public.quotes set status = 'lost'
  where submission_id = v_sub.id and id <> p_quote_id and status = 'open';

  insert into public.submission_events (submission_id, action, actor_id, metadata)
  values (v_sub.id, 'bound', auth.uid(), jsonb_build_object(
    'quote_id', p_quote_id, 'policy_id', p_policy_id,
    'each_occurrence', p_each_occurrence, 'general_aggregate', p_general_aggregate));

  update public.commercial_submissions set status = 'bound' where id = v_sub.id;

  return jsonb_build_object('quote_id', p_quote_id, 'policy_id', p_policy_id, 'save_result', v_save);
end; $$;
comment on function public.bind_submission_quote(uuid, uuid, numeric, numeric) is
  'Atomic bind: validates quote/submission/policy tenancy, requires both COI GL limits, writes them via save_master_coi_fields (rejects fail the bind), quote won + siblings lost + bound event + submission bound, all in one transaction under a submission row lock. Staff + workspace gated inside; SECURITY DEFINER.';
revoke execute on function public.bind_submission_quote(uuid, uuid, numeric, numeric) from anon, public;
grant  execute on function public.bind_submission_quote(uuid, uuid, numeric, numeric) to authenticated;
