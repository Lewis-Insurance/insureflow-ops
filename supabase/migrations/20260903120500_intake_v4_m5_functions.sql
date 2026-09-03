-- intake-v4 migration M5: lead_promote, pipeline_start, pipeline_bind, pipeline_mark_lost.
--
-- ledger version: pending
--
-- NEEDS LANDEN APPROVAL BEFORE PROD APPLY. Runs after M4. Apply through the Supabase
-- management API (MCP apply_migration) only. Never run a CLI push against production.
--
-- Four operations, each one transaction, each failing closed.
--
--   lead_promote      turn a prospect into a customer file without a policy
--   pipeline_start    put something into the pipeline, idempotently
--   pipeline_bind     the multi line conversion: quotes become policies
--   pipeline_mark_lost close an item with a reason
--
-- Why Promote and Bind are two operations and not one (report section 11.1)
--   Personal lines quoting happens in carrier portals with the answers held on the
--   prospect record, so a personal prospect rarely needs a customer file before the
--   policy binds. Commercial always does: the commercial module works against
--   accounts, so a commercial prospect has to become an account the moment the real
--   work starts, long before anything binds. One operation cannot be both.
--
-- Why Promote could not ship before M2
--   Promote sets leads.account_id. That is precisely the condition under which the
--   two lead outbox triggers stop being dead code, and tr_lead_created reads
--   NEW.source, a column the leads table does not have. M2 removes both triggers
--   first. This ordering is not optional.
--
-- All four are SECURITY DEFINER with a pinned search_path, EXECUTE revoked from
-- PUBLIC and anon, granted to authenticated and service_role. That is the same shape
-- import_resolve_account, find_duplicate_accounts and the merge functions already use.

-- ===========================================================================
-- lead_promote
-- ===========================================================================
-- Create or attach the customer file for a prospect. No policy. The prospect stays
-- open and simply gains its account pointer, moving from new to contacted if it was
-- still new. Idempotent: promoting an already promoted prospect returns the account
-- it already has and changes nothing.
--
-- create mode goes through import_resolve_account, which takes its own advisory lock
-- on (workspace, type, normalized name), matches a business on normalized name and a
-- person on name plus a shared email, phone or date of birth, and follows a prior
-- merge to the surviving record. A near duplicate therefore lands on the existing
-- customer instead of forking a second one.
--
-- attach mode requires the account the user picked after the duplicate warning, and
-- checks it belongs to the same workspace. Changing an id in the request cannot
-- attach a prospect to another agency's customer.
create or replace function public.lead_promote(
  p_lead_id uuid,
  p_mode text,
  p_account_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid     uuid := auth.uid();
  v_lead    public.leads%rowtype;
  v_type    text;
  v_name    text;
  v_result  jsonb;
  v_account uuid;
begin
  if not public.is_staff() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_mode not in ('create', 'attach') then
    raise exception 'lead_promote: mode must be create or attach';
  end if;

  select * into v_lead from public.leads where id = p_lead_id for update;
  if v_lead.id is null then
    raise exception 'That prospect record no longer exists.';
  end if;
  if v_lead.deleted_at is not null then
    raise exception 'That prospect record was removed.';
  end if;

  if not exists (
    select 1 from public.agency_workspace_memberships awm
    where awm.agency_workspace_id = v_lead.agency_workspace_id
      and awm.user_id = v_uid and awm.status = 'active'
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- Idempotent.
  if v_lead.account_id is not null then
    return jsonb_build_object(
      'account_id', v_lead.account_id,
      'created', false,
      'already_promoted', true);
  end if;

  v_type := case when nullif(btrim(coalesce(v_lead.company_name, '')), '') is not null
                 then 'commercial_business' else 'household' end;
  v_name := case when v_type = 'commercial_business'
                 then btrim(v_lead.company_name)
                 else nullif(btrim(coalesce(v_lead.first_name, '') || ' ' || coalesce(v_lead.last_name, '')), '') end;
  if v_name is null then
    raise exception 'That prospect has no name to file the customer under.';
  end if;

  if p_mode = 'attach' then
    if p_account_id is null then
      raise exception 'Pick the customer to attach to.';
    end if;
    if not exists (
      select 1 from public.accounts a
      where a.id = p_account_id
        and a.deleted_at is null
        and a.agency_workspace_id = v_lead.agency_workspace_id
    ) then
      raise exception 'That customer is not in this agency.' using errcode = '42501';
    end if;
    v_account := p_account_id;
    v_result := jsonb_build_object('account_id', v_account, 'created', false, 'match_basis', 'attached_by_user');
  else
    v_result := public.import_resolve_account(
      p_agency_workspace_id := v_lead.agency_workspace_id,
      p_batch_id            := null,
      p_name                := v_name,
      p_type                := v_type,
      p_email               := v_lead.email,
      p_phone               := v_lead.phone,
      p_address_line1       := v_lead.address_line1,
      p_address_line2       := v_lead.address_line2,
      p_city                := v_lead.city,
      p_state               := v_lead.state,
      p_zip                 := v_lead.zip_code,
      p_dob                 := null,
      p_source              := coalesce(v_lead.lead_source, 'pipeline'),
      p_custom              := null);
    v_account := (v_result->>'account_id')::uuid;
    v_result := v_result || jsonb_build_object('created', not (v_result->>'matched')::boolean);
  end if;

  update public.leads
     set account_id = v_account,
         status     = case when status = 'new' then 'contacted' else status end,
         updated_at = now()
   where id = p_lead_id;

  return v_result || jsonb_build_object('account_id', v_account, 'already_promoted', false);
end;
$function$;

-- ===========================================================================
-- pipeline_start
-- ===========================================================================
-- Put a piece of work into the pipeline. Called by the New Lead page and by each of
-- the four doors (Work this on a renewal row, Remarket on a policy card, Start a sale
-- on a customer header, Work this on a prospect record).
--
-- Idempotent by design, not by accident: if an open item already exists for the same
-- party and source, that item is returned with created false, and the screen opens it
-- instead of making a duplicate. The partial unique indexes from M4 are the second
-- lock, so two people pressing the button at the same instant still end up with one.
create or replace function public.pipeline_start(
  p_kind              text,
  p_lead_id           uuid default null,
  p_account_id        uuid default null,
  p_source_renewal_id uuid default null,
  p_source_policy_id  uuid default null,
  p_lines             text[] default '{}'::text[],
  p_assign_self       boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid       uuid := auth.uid();
  v_workspace uuid;
  v_existing  public.pipeline_items%rowtype;
  v_id        uuid;
begin
  if not public.is_staff() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_kind not in ('new_business', 'cross_sell', 'renewal', 'rewrite') then
    raise exception 'pipeline_start: unknown kind %', p_kind;
  end if;
  if (p_lead_id is not null)::int + (p_account_id is not null)::int <> 1 then
    raise exception 'pipeline_start: pass exactly one of a prospect or a customer';
  end if;
  if (p_source_renewal_id is not null)::int + (p_source_policy_id is not null)::int > 1 then
    raise exception 'pipeline_start: an item comes from at most one place';
  end if;

  -- Workspace comes from the party, never from the caller.
  if p_lead_id is not null then
    select agency_workspace_id into v_workspace from public.leads
     where id = p_lead_id and deleted_at is null;
    if v_workspace is null then raise exception 'That prospect record no longer exists.'; end if;
  else
    select agency_workspace_id into v_workspace from public.accounts
     where id = p_account_id and deleted_at is null;
    if v_workspace is null then raise exception 'That customer no longer exists.'; end if;
  end if;

  if not exists (
    select 1 from public.agency_workspace_memberships awm
    where awm.agency_workspace_id = v_workspace
      and awm.user_id = v_uid and awm.status = 'active'
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- A source must belong to the same party, or the item would lie about where the
  -- work came from.
  if p_source_renewal_id is not null then
    if not exists (select 1 from public.renewals r
                   where r.id = p_source_renewal_id and r.account_id = p_account_id) then
      raise exception 'That renewal belongs to a different customer.';
    end if;
  end if;
  if p_source_policy_id is not null then
    if not exists (select 1 from public.policies p
                   where p.id = p_source_policy_id and p.account_id = p_account_id and p.deleted_at is null) then
      raise exception 'That policy belongs to a different customer.';
    end if;
  end if;

  -- Already open? Hand back the existing item.
  select * into v_existing
  from public.pipeline_items pi
  where pi.deleted_at is null
    and pi.stage not in ('bound', 'lost')
    and pi.lead_id is not distinct from p_lead_id
    and pi.account_id is not distinct from p_account_id
    and pi.source_renewal_id is not distinct from p_source_renewal_id
    and pi.source_policy_id is not distinct from p_source_policy_id
  limit 1;

  if v_existing.id is not null then
    return jsonb_build_object('item_id', v_existing.id, 'created', false, 'stage', v_existing.stage);
  end if;

  insert into public.pipeline_items (
    agency_workspace_id, lead_id, account_id, kind, stage,
    source_renewal_id, source_policy_id, lines_wanted, assignees, created_by)
  values (
    v_workspace, p_lead_id, p_account_id, p_kind, 'new',
    p_source_renewal_id, p_source_policy_id, coalesce(p_lines, '{}'::text[]),
    case when p_assign_self and v_uid is not null then array[v_uid] else '{}'::uuid[] end,
    v_uid)
  returning id into v_id;

  return jsonb_build_object('item_id', v_id, 'created', true, 'stage', 'new');
end;
$function$;

-- ===========================================================================
-- pipeline_bind
-- ===========================================================================
-- The conversion. One transaction, or nothing.
--
-- p_policies is an array, one entry per quote being bound:
--   [{ "quote_id": uuid, "policy_number": text, "effective_date": date,
--      "expiration_date": date (optional) }]
--
-- What it does, in order
--   1. Locks the item. An already bound item returns its original result and stops,
--      so two people pressing Bind at the same second produce one customer, one set
--      of policies and one audit row, and the second caller sees the first result.
--   2. Creates or attaches the customer when the party is a prospect (the Promote
--      path, so duplicate handling is identical).
--   3. Refuses any quote whose carrier is still free text. Carrier data is never
--      invented; the screen asks the user to pick or add the real carrier first.
--   4. For an item that came from a renewal, the quote matching the expiring policy's
--      line closes that renewal through the existing renewal functions:
--      renewal_mark_renewed when the carrier is the same, renewal_mark_moved when it
--      is different. Those functions own that behaviour today and keep owning it, so
--      Tori's Renewals page and the pipeline can never disagree.
--   5. Every other quote becomes a new policy on the customer.
--   6. Re-points the prospect's tasks and documents, folds the item's notes into the
--      customer file, stamps the prospect converted and mirrors its status to won.
--   7. Marks the item bound and records what it produced.
--
-- What it deliberately does not do
--   A rewrite started from a policy mid term does not touch the old policy. Cancelling
--   is a decision with money and dates attached; it stays with the existing
--   cancellation flow, by hand, and the item panel says so on screen.
create or replace function public.pipeline_bind(
  p_item_id    uuid,
  p_policies   jsonb,
  p_party_mode text default null,
  p_account_id uuid default null,
  p_note       text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid          uuid := auth.uid();
  v_item         public.pipeline_items%rowtype;
  v_lead         public.leads%rowtype;
  v_account      uuid;
  v_promote      jsonb;
  v_entry        jsonb;
  v_quote        public.pipeline_quotes%rowtype;
  v_carrier_name text;
  v_num          text;
  v_eff          date;
  v_exp          date;
  v_term         text;
  v_policy_id    uuid;
  v_policy_ids   uuid[] := '{}'::uuid[];
  v_total        numeric := 0;
  v_renewal      public.renewals%rowtype;
  v_old_policy   public.policies%rowtype;
  v_renewal_quote uuid;
  v_renewal_outcome text := null;
  v_result       jsonb;
  v_notes_folded int := 0;
begin
  if not public.is_staff() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select * into v_item from public.pipeline_items where id = p_item_id for update;
  if v_item.id is null then
    raise exception 'That pipeline item no longer exists.';
  end if;
  if v_item.deleted_at is not null then
    raise exception 'That pipeline item was removed.';
  end if;
  if not exists (
    select 1 from public.agency_workspace_memberships awm
    where awm.agency_workspace_id = v_item.agency_workspace_id
      and awm.user_id = v_uid and awm.status = 'active'
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- Idempotent: the second caller gets the first caller's answer.
  if v_item.stage = 'bound' then
    return coalesce(v_item.bind_result, jsonb_build_object('item_id', v_item.id))
           || jsonb_build_object('already_bound', true);
  end if;
  if v_item.stage = 'lost' then
    raise exception 'That item is closed as lost. Reopen it before binding.';
  end if;

  if p_policies is null or jsonb_typeof(p_policies) <> 'array' or jsonb_array_length(p_policies) = 0 then
    raise exception 'Pick at least one quote to bind.';
  end if;

  -- --- the customer -------------------------------------------------------
  if v_item.account_id is not null then
    v_account := v_item.account_id;
  else
    select * into v_lead from public.leads where id = v_item.lead_id for update;
    if v_lead.id is null then
      raise exception 'The prospect record for this item is missing.';
    end if;
    if v_lead.account_id is not null then
      v_account := v_lead.account_id;
    else
      if p_party_mode is null then
        raise exception 'Choose Create customer or Attach to existing before binding.';
      end if;
      v_promote := public.lead_promote(v_item.lead_id, p_party_mode, p_account_id);
      v_account := (v_promote->>'account_id')::uuid;
    end if;
  end if;

  -- --- which quote closes the renewal, if this came from one --------------
  if v_item.source_renewal_id is not null then
    select * into v_renewal from public.renewals where id = v_item.source_renewal_id for update;
    if v_renewal.id is not null and v_renewal.policy_id is not null then
      select * into v_old_policy from public.policies where id = v_renewal.policy_id;
    end if;

    if v_renewal.id is not null
       and v_renewal.status not in ('renewed','moved','lost','cancelled','non_renewed','lapsed','completed') then
      -- the quote on the same line as the expiring policy, else the first one
      select (e.value->>'quote_id')::uuid into v_renewal_quote
      from jsonb_array_elements(p_policies) e
      join public.pipeline_quotes q on q.id = (e.value->>'quote_id')::uuid
      where lower(coalesce(q.line, '')) = lower(coalesce(v_old_policy.line_of_business, ''))
      limit 1;

      if v_renewal_quote is null then
        v_renewal_quote := (p_policies->0->>'quote_id')::uuid;
      end if;
    end if;
  end if;

  -- --- the policies -------------------------------------------------------
  for v_entry in select value from jsonb_array_elements(p_policies)
  loop
    select * into v_quote
    from public.pipeline_quotes
    where id = (v_entry->>'quote_id')::uuid
      and item_id = p_item_id
      and deleted_at is null
    for update;

    if v_quote.id is null then
      raise exception 'One of the quotes is not on this item any more. Reopen the item and try again.';
    end if;

    if v_quote.carrier_id is null then
      raise exception 'Add % to the carrier list, or pick the matching carrier, before binding the % quote.',
        coalesce(nullif(btrim(v_quote.carrier_text), ''), 'that carrier'), v_quote.line
        using detail = 'CARRIER_NOT_IN_DIRECTORY=' || v_quote.id::text;
    end if;

    select name into v_carrier_name from public.carriers where id = v_quote.carrier_id;

    v_num := nullif(btrim(v_entry->>'policy_number'), '');
    if v_num is null then
      raise exception 'Enter a policy number for the % quote.', v_quote.line;
    end if;

    v_eff := nullif(v_entry->>'effective_date', '')::date;
    if v_eff is null then
      raise exception 'Enter an effective date for the % quote.', v_quote.line;
    end if;

    v_term := coalesce(nullif(v_quote.term, ''), 'annual');
    v_exp := coalesce(
      nullif(v_entry->>'expiration_date', '')::date,
      (v_eff + case when v_term = 'semiannual' then interval '6 months' else interval '1 year' end)::date);

    if v_renewal_quote is not null and v_quote.id = v_renewal_quote then
      -- This quote replaces the expiring policy. The renewal functions own that.
      if v_old_policy.id is not null
         and v_old_policy.carrier_id is not distinct from v_quote.carrier_id then
        perform public.renewal_mark_renewed(
          v_renewal.id, v_old_policy.id, v_account,
          v_num, coalesce(v_quote.premium, 0), v_term, v_eff, v_exp,
          coalesce(p_note, 'Bound from the pipeline.'));
        v_renewal_outcome := 'renewed';
        v_policy_id := v_old_policy.id;
      else
        v_policy_id := public.renewal_mark_moved(
          v_renewal.id, coalesce(v_old_policy.id, v_renewal.policy_id), v_account,
          v_carrier_name, v_num, coalesce(v_quote.premium, 0), v_term, v_eff, v_exp,
          coalesce(p_note, 'Bound from the pipeline.'), null);
        v_renewal_outcome := 'moved';
      end if;
    else
      begin
        insert into public.policies (
          account_id, policy_number, carrier, carrier_id, line_of_business,
          premium, effective_date, expiration_date, policy_term, status, created_by)
        values (
          v_account, v_num, v_carrier_name, v_quote.carrier_id, v_quote.line,
          coalesce(v_quote.premium, 0), v_eff, v_exp, v_term, 'active', v_uid)
        returning id into v_policy_id;
      exception when unique_violation then
        raise exception 'Policy number % is already on the books. Check the number, or open the policy that already exists.', v_num
          using detail = 'DUPLICATE_POLICY_NUMBER=' || v_num;
      end;
    end if;

    update public.pipeline_quotes
       set status = 'accepted', bound_policy_id = v_policy_id, updated_at = now()
     where id = v_quote.id;

    v_policy_ids := v_policy_ids || v_policy_id;
    v_total := v_total + coalesce(v_quote.premium, 0);
  end loop;

  -- --- carry the prospect's work across ------------------------------------
  if v_item.lead_id is not null then
    update public.tasks
       set account_id = v_account
     where related_lead_id = v_item.lead_id and account_id is null;

    update public.documents
       set account_id = v_account
     where related_entity_id = v_item.lead_id and account_id is null;
  end if;

  insert into public.customer_notes (customer_id, note_text, created_by, source)
  select v_account,
         'From the pipeline (' || to_char(n.created_at, 'YYYY-MM-DD') || '): ' || n.body,
         coalesce(n.created_by, v_uid),
         'pipeline'
  from public.pipeline_notes n
  where n.item_id = p_item_id and n.deleted_at is null;
  get diagnostics v_notes_folded = row_count;

  if v_item.lead_id is not null then
    update public.leads
       set converted_account_id = v_account,
           converted_at         = now(),
           won_at               = now(),
           conversion_value     = v_total,
           status               = 'won',
           updated_at           = now()
     where id = v_item.lead_id;
  end if;

  v_result := jsonb_build_object(
    'item_id',         p_item_id,
    'account_id',      v_account,
    'policy_ids',      to_jsonb(v_policy_ids),
    'policy_count',    coalesce(array_length(v_policy_ids, 1), 0),
    'premium_total',   v_total,
    'renewal_outcome', v_renewal_outcome,
    'notes_folded',    v_notes_folded,
    'bound_at',        now());

  update public.pipeline_items
     set stage         = 'bound',
         bound_at      = now(),
         account_id    = v_account,
         last_touch_at = now(),
         bind_result   = v_result,
         updated_at    = now()
   where id = p_item_id;

  return v_result || jsonb_build_object('already_bound', false);
end;
$function$;

-- ===========================================================================
-- pipeline_mark_lost
-- ===========================================================================
-- Close an item that is not going to happen. Losing an item marks only the item. A
-- renewal row behind it is marked lost only when the user picks the reason that
-- actually means the customer left, and even then it goes through renewal_mark_lost
-- so the Renewals page and the pipeline stay in step.
create or replace function public.pipeline_mark_lost(
  p_item_id       uuid,
  p_reason        text,
  p_note          text default null,
  p_close_renewal boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid  uuid := auth.uid();
  v_item public.pipeline_items%rowtype;
  v_renewal public.renewals%rowtype;
  v_renewal_outcome text := null;
begin
  if not public.is_staff() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_reason not in ('price', 'no_answer', 'went_elsewhere', 'not_eligible', 'other') then
    raise exception 'pipeline_mark_lost: unknown reason %', p_reason;
  end if;

  select * into v_item from public.pipeline_items where id = p_item_id for update;
  if v_item.id is null then
    raise exception 'That pipeline item no longer exists.';
  end if;
  if not exists (
    select 1 from public.agency_workspace_memberships awm
    where awm.agency_workspace_id = v_item.agency_workspace_id
      and awm.user_id = v_uid and awm.status = 'active'
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if v_item.stage = 'lost' then
    return jsonb_build_object('item_id', p_item_id, 'already_lost', true);
  end if;
  if v_item.stage = 'bound' then
    raise exception 'That item is already bound.';
  end if;

  -- Only "went elsewhere" says the customer actually left, and only then, and only
  -- when the user asked for it, does the renewal row move.
  if p_close_renewal and v_item.source_renewal_id is not null and p_reason = 'went_elsewhere' then
    select * into v_renewal from public.renewals where id = v_item.source_renewal_id for update;
    if v_renewal.id is not null
       and v_renewal.status not in ('renewed','moved','lost','cancelled','non_renewed','lapsed','completed') then
      v_renewal_outcome := public.renewal_mark_lost(
        v_renewal.id, v_renewal.policy_id, v_renewal.account_id,
        'lost', coalesce(nullif(btrim(p_note), ''), 'Customer went elsewhere'),
        null, null);
    end if;
  end if;

  update public.pipeline_items
     set stage         = 'lost',
         lost_reason   = p_reason,
         lost_note     = nullif(btrim(p_note), ''),
         last_touch_at = now(),
         updated_at    = now()
   where id = p_item_id;

  if v_item.lead_id is not null then
    update public.leads
       set status      = 'lost',
           lost_reason = p_reason,
           lost_notes  = nullif(btrim(p_note), ''),
           updated_at  = now()
     where id = v_item.lead_id;
  end if;

  return jsonb_build_object(
    'item_id', p_item_id,
    'already_lost', false,
    'renewal_outcome', v_renewal_outcome);
end;
$function$;

-- ===========================================================================
-- Grants
-- ===========================================================================
revoke execute on function public.lead_promote(uuid, text, uuid) from public;
revoke execute on function public.lead_promote(uuid, text, uuid) from anon;
grant execute on function public.lead_promote(uuid, text, uuid) to authenticated;
grant execute on function public.lead_promote(uuid, text, uuid) to service_role;

revoke execute on function public.pipeline_start(text, uuid, uuid, uuid, uuid, text[], boolean) from public;
revoke execute on function public.pipeline_start(text, uuid, uuid, uuid, uuid, text[], boolean) from anon;
grant execute on function public.pipeline_start(text, uuid, uuid, uuid, uuid, text[], boolean) to authenticated;
grant execute on function public.pipeline_start(text, uuid, uuid, uuid, uuid, text[], boolean) to service_role;

revoke execute on function public.pipeline_bind(uuid, jsonb, text, uuid, text) from public;
revoke execute on function public.pipeline_bind(uuid, jsonb, text, uuid, text) from anon;
grant execute on function public.pipeline_bind(uuid, jsonb, text, uuid, text) to authenticated;
grant execute on function public.pipeline_bind(uuid, jsonb, text, uuid, text) to service_role;

revoke execute on function public.pipeline_mark_lost(uuid, text, text, boolean) from public;
revoke execute on function public.pipeline_mark_lost(uuid, text, text, boolean) from anon;
grant execute on function public.pipeline_mark_lost(uuid, text, text, boolean) to authenticated;
grant execute on function public.pipeline_mark_lost(uuid, text, text, boolean) to service_role;

-- >>> DOWN BEGIN
/*
drop function if exists public.pipeline_mark_lost(uuid, text, text, boolean);
drop function if exists public.pipeline_bind(uuid, jsonb, text, uuid, text);
drop function if exists public.pipeline_start(text, uuid, uuid, uuid, uuid, text[], boolean);
drop function if exists public.lead_promote(uuid, text, uuid);
*/
-- >>> DOWN END
