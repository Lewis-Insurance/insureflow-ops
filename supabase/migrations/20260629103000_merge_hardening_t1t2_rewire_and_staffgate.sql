-- Merge hardening T1 + T2:
--   T1: route the /duplicates review queue to the hardened merge_accounts engine,
--       write the same_as provenance edge AFTER the merge, apply consent strictest-wins,
--       and retire the thin merge_duplicate_records path.
--   T2: staff-gate every SECURITY DEFINER RPC over customer data via public.is_staff().
--       Reads return 0 rows for non-staff; destructive ones RAISE. Service-role (null
--       auth.uid()) calls are still allowed for the nightly suggestion cron.

-- ---------------------------------------------------------------------------
-- T1: rewire the review-queue merge
-- ---------------------------------------------------------------------------
create or replace function public.relgraph_merge_duplicate_group(p_group_id uuid, p_survivor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  g record;
  v_cluster uuid[];
  v_losers uuid[];
  v_result jsonb;
  l uuid;
begin
  -- Merge is destructive: staff only.
  if not public.is_staff() then
    raise exception 'relgraph_merge_duplicate_group: staff access required';
  end if;

  select * into g from public.duplicate_groups where id = p_group_id;
  if not found then raise exception 'Duplicate group % not found', p_group_id; end if;
  if g.status = 'merged' then raise exception 'Duplicate group already merged'; end if;
  if g.entity_type <> 'accounts' then raise exception 'Only account groups can be merged here'; end if;
  if not (p_survivor_id = any(g.entity_ids)) then raise exception 'Survivor ID not found in duplicate group'; end if;

  v_cluster := g.entity_ids;

  -- Active losers only (merge_accounts requires every loser to be live).
  select array_agg(id) into v_losers
  from public.accounts
  where id = any(g.entity_ids) and id <> p_survivor_id and deleted_at is null;

  if v_losers is null or array_length(v_losers, 1) is null then
    raise exception 'No active losers to merge in this group';
  end if;

  -- Guards (policy section B): block cross-type / conflicting strong-ID / Jr-Sr suffix.
  perform public.assert_mergeable(p_survivor_id, v_losers);

  -- Prevent self-loop CHECK violations: an edge/suggestion between two members of the
  -- cluster would be reparented to from=to and abort the merge. Drop them first.
  delete from public.account_relationships
   where from_account = any(v_cluster) and to_account = any(v_cluster);
  delete from public.account_relationship_suggestions
   where from_account = any(v_cluster) and to_account = any(v_cluster);

  -- The hardened engine: FK-driven reparent of every table, snapshot/manifest,
  -- policy de-dup, collision handling, tombstone-only.
  v_result := public.merge_accounts(p_survivor_id, v_losers, 'duplicate_review', auth.uid(), true);

  -- Provenance edges AFTER the merge (survivor -> each loser), now collision-free.
  foreach l in array v_losers loop
    insert into public.account_relationships
      (from_account, to_account, rel_type, source, note, created_by)
    values
      (p_survivor_id, l, 'same_as', 'merge',
       'Merged duplicate (group ' || p_group_id::text || ')', auth.uid())
    on conflict do nothing;
  end loop;

  -- Consent strictest-wins on the survivor (policy section C.6).
  perform public.apply_consent_strictest_wins(p_survivor_id, v_losers);

  return v_result;
end;
$function$;

revoke execute on function public.relgraph_merge_duplicate_group(uuid, uuid) from anon, public;
grant execute on function public.relgraph_merge_duplicate_group(uuid, uuid) to authenticated;

-- Retire the thin partial-reparent path so nothing can ever use it again.
drop function if exists public.merge_duplicate_records(uuid, uuid, jsonb);

-- ---------------------------------------------------------------------------
-- T2: staff-gate the read RPCs (return 0 rows for non-staff; service-role allowed)
-- ---------------------------------------------------------------------------
create or replace function public.search_accounts(p_q text, p_limit integer default 20)
returns table(account_id uuid, name text, goes_by text, type text, email text, phone text,
              city text, state text, policies_count integer, match_reason text, score real)
language sql stable security definer set search_path to 'public', 'extensions'
as $function$
  with q as (select nullif(trim(coalesce(p_q, '')), '') as term)
  select
    a.id as account_id, a.name, a.goes_by, a.type::text as type, a.email, a.phone, a.city, a.state,
    coalesce((select count(*)::int from public.policies pol
                where pol.account_id = a.id and pol.deleted_at is null), 0) as policies_count,
    case
      when a.name ilike '%' || (select term from q) || '%' then 'name'
      when a.goes_by ilike '%' || (select term from q) || '%' then 'goes by ' || a.goes_by
      when exists (select 1 from public.account_aliases al
                     where al.account_id = a.id and al.alias ilike '%' || (select term from q) || '%')
        then 'aka ' || (select al.alias from public.account_aliases al
                          where al.account_id = a.id and al.alias ilike '%' || (select term from q) || '%' limit 1)
      when a.email ilike '%' || (select term from q) || '%' then 'email'
      when a.phone ilike '%' || (select term from q) || '%' then 'phone'
      else 'fuzzy: ' || a.name
    end as match_reason,
    greatest(similarity(a.name, (select term from q)),
             similarity(coalesce(a.goes_by, ''), (select term from q))) as score
  from public.accounts a
  where a.deleted_at is null
    and (select term from q) is not null
    and (auth.uid() is null or public.is_staff())
    and (
      a.name ilike '%' || (select term from q) || '%'
      or a.goes_by ilike '%' || (select term from q) || '%'
      or a.email ilike '%' || (select term from q) || '%'
      or a.phone ilike '%' || (select term from q) || '%'
      or exists (select 1 from public.account_aliases al
                   where al.account_id = a.id and al.alias ilike '%' || (select term from q) || '%')
      or (length((select term from q)) >= 3 and similarity(a.name, (select term from q)) > 0.3)
    )
  order by
    (case when a.name ilike (select term from q) || '%'
            or a.goes_by ilike (select term from q) || '%' then 1 else 0 end) desc,
    score desc nulls last, a.name asc
  limit p_limit;
$function$;

create or replace function public.get_account_relationships(p_account_id uuid)
returns table(relationship_id uuid, direction text, rel_type text, display_label text, role text,
              is_primary boolean, source text, note text, other_account_id uuid, other_name text,
              other_goes_by text, other_type text, other_status text, other_policies_count integer,
              other_active_premium numeric, other_next_expiration date)
language sql stable security definer set search_path to 'public'
as $function$
  select
    r.id,
    case when r.from_account = p_account_id then 'outgoing' else 'incoming' end,
    r.rel_type,
    case r.rel_type
      when 'owns'           then case when r.from_account = p_account_id then 'Owner of' else 'Owned by' end
      when 'parent_company' then case when r.from_account = p_account_id then 'Parent of' else 'Subsidiary of' end
      when 'spouse'         then 'Spouse'
      when 'household_member' then 'Household'
      when 'same_as'        then 'Same as'
      else 'Related'
    end,
    r.role, r.is_primary, r.source, r.note, o.id, o.name, o.goes_by, o.type::text, o.account_status::text,
    coalesce((select count(*)::int from public.policies p where p.account_id = o.id and p.deleted_at is null), 0),
    (select sum(p.premium) from public.policies p where p.account_id = o.id and p.deleted_at is null and p.status = 'active'),
    (select min(p.expiration_date) from public.policies p where p.account_id = o.id and p.deleted_at is null and p.status = 'active')
  from public.account_relationships r
  join public.accounts o
    on o.id = case when r.from_account = p_account_id then r.to_account else r.from_account end
  where (r.from_account = p_account_id or r.to_account = p_account_id)
    and o.deleted_at is null
    and (auth.uid() is null or public.is_staff())
  order by r.is_primary desc, r.rel_type, o.name;
$function$;

create or replace function public.get_account_link_suggestions(p_account_id uuid)
returns table(suggestion_id uuid, direction text, rel_type text, suggested_label text, signal text,
              reason text, confidence numeric, other_account_id uuid, other_name text, other_goes_by text,
              other_type text, other_policies_count integer, other_active_premium numeric)
language sql stable security definer set search_path to 'public'
as $function$
  select
    s.id,
    case when s.from_account = p_account_id then 'outgoing' else 'incoming' end,
    s.rel_type,
    case s.rel_type
      when 'owns'           then case when s.from_account = p_account_id then 'Owner of' else 'Owned by' end
      when 'parent_company' then case when s.from_account = p_account_id then 'Parent of' else 'Subsidiary of' end
      when 'spouse'         then 'Spouse'
      when 'household_member' then 'Household'
      when 'same_as'        then 'Same as'
      else 'Related'
    end,
    s.signal, s.reason, s.confidence, o.id, o.name, o.goes_by, o.type::text,
    coalesce((select count(*)::int from public.policies p where p.account_id = o.id and p.deleted_at is null), 0),
    (select sum(p.premium) from public.policies p where p.account_id = o.id and p.deleted_at is null and p.status = 'active')
  from public.account_relationship_suggestions s
  join public.accounts o
    on o.id = case when s.from_account = p_account_id then s.to_account else s.from_account end
  where s.status = 'pending'
    and (s.from_account = p_account_id or s.to_account = p_account_id)
    and o.deleted_at is null
    and (auth.uid() is null or public.is_staff())
  order by s.confidence desc, o.name;
$function$;

create or replace function public.list_duplicate_groups_for_review(p_limit integer default 50, p_offset integer default 0)
returns table(group_id uuid, entity_type text, match_score numeric, status text,
              created_at timestamp with time zone, member_count integer, members jsonb)
language sql stable security definer set search_path to 'public'
as $function$
  select
    g.id, g.entity_type, g.match_score, g.status, g.created_at,
    coalesce(array_length(g.entity_ids, 1), 0),
    (select jsonb_agg(jsonb_build_object(
        'account_id', a.id, 'name', a.name, 'goes_by', a.goes_by, 'type', a.type::text,
        'status', a.account_status::text, 'email', a.email, 'phone', a.phone, 'city', a.city, 'state', a.state,
        'created_at', a.created_at, 'deleted_at', a.deleted_at,
        'policies_count', coalesce((select count(*)::int from public.policies p where p.account_id = a.id and p.deleted_at is null), 0),
        'active_premium', (select sum(p.premium) from public.policies p where p.account_id = a.id and p.deleted_at is null and p.status = 'active')
      ) order by a.deleted_at nulls first, a.created_at)
     from public.accounts a where a.id = any(g.entity_ids)) as members
  from public.duplicate_groups g
  where g.entity_type = 'accounts' and g.status = 'pending'
    and (auth.uid() is null or public.is_staff())
  order by g.match_score desc nulls last, g.created_at desc
  limit p_limit offset p_offset;
$function$;

-- ---------------------------------------------------------------------------
-- T2: staff-gate the write RPCs (RAISE for non-staff; service-role allowed for cron)
-- ---------------------------------------------------------------------------
create or replace function public.confirm_relationship_suggestion(p_suggestion_id uuid, p_role text default null)
returns uuid
language plpgsql security definer set search_path to 'public'
as $function$
declare
  s record;
  v_new_id uuid;
begin
  if not public.is_staff() then
    raise exception 'confirm_relationship_suggestion: staff access required';
  end if;

  select * into s from public.account_relationship_suggestions where id = p_suggestion_id;
  if not found then raise exception 'Suggestion % not found', p_suggestion_id; end if;
  if s.status = 'confirmed' and s.created_relationship_id is not null then
    return s.created_relationship_id;
  end if;

  insert into public.account_relationships
    (from_account, to_account, rel_type, role, source, confidence, created_by, note)
  values
    (s.from_account, s.to_account, s.rel_type, p_role, 'suggested', s.confidence, auth.uid(), s.reason)
  on conflict do nothing
  returning id into v_new_id;

  if v_new_id is null then
    select id into v_new_id from public.account_relationships
      where least(from_account, to_account) = least(s.from_account, s.to_account)
        and greatest(from_account, to_account) = greatest(s.from_account, s.to_account)
        and rel_type = s.rel_type
      limit 1;
  end if;

  update public.account_relationship_suggestions
     set status = 'confirmed', reviewed_by = auth.uid(), reviewed_at = now(),
         created_relationship_id = v_new_id, updated_at = now()
   where id = p_suggestion_id;

  return v_new_id;
end;
$function$;

-- generate_relationship_suggestions: cron (service_role, null uid) allowed; a real
-- non-staff user is blocked.
create or replace function public.generate_relationship_suggestions()
returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
declare
  c_email   int := 0;
  c_surname int := 0;
  c_phone   int := 0;
  c_address int := 0;
  c_spouse  int := 0;
begin
  if auth.uid() is not null and not public.is_staff() then
    raise exception 'generate_relationship_suggestions: staff access required';
  end if;

  insert into public.account_relationship_suggestions (from_account, to_account, rel_type, signal, reason, confidence)
  select distinct p.id, b.id, 'owns', 'business_email_name',
    'Business email ' || b.email || ' matches ' || p.name, 0.6
  from public.accounts b
  cross join lateral (select lower(split_part(b.email, '@', 1)) as local) e
  join public.accounts p
    on p.deleted_at is null and p.type = 'household' and p.id <> b.id
   and length(e.local) >= 4
   and (position(e.local in lower(p.name)) > 0
        or lower(coalesce(p.goes_by, '')) = e.local
        or exists (select 1 from public.account_aliases al where al.account_id = p.id and lower(al.alias) = e.local))
  where b.deleted_at is null and b.type = 'commercial_business' and b.email is not null and b.email like '%@%'
    and not exists (select 1 from public.account_relationships r
        where least(r.from_account, r.to_account) = least(p.id, b.id)
          and greatest(r.from_account, r.to_account) = greatest(p.id, b.id))
  on conflict do nothing;
  get diagnostics c_email = row_count;

  insert into public.account_relationship_suggestions (from_account, to_account, rel_type, signal, reason, confidence)
  select distinct p.id, b.id, 'owns', 'surname_business', 'Shares surname with business ' || b.name, 0.4
  from public.accounts p
  cross join lateral (select lower(coalesce((regexp_match(btrim(p.name), '([A-Za-z]+)\s*$'))[1], '')) as surname) s
  join public.accounts b
    on b.deleted_at is null and b.type = 'commercial_business' and b.id <> p.id
   and length(s.surname) >= 4 and position(s.surname in lower(b.name)) > 0
  where p.deleted_at is null and p.type = 'household'
    and not exists (select 1 from public.account_relationships r
        where least(r.from_account, r.to_account) = least(p.id, b.id)
          and greatest(r.from_account, r.to_account) = greatest(p.id, b.id))
  on conflict do nothing;
  get diagnostics c_surname = row_count;

  insert into public.account_relationship_suggestions (from_account, to_account, rel_type, signal, reason, confidence)
  select distinct least(pr.a1, pr.a2), greatest(pr.a1, pr.a2), 'related', 'shared_phone', 'Shares a phone number', 0.5
  from (select ph1.account_id as a1, ph2.account_id as a2
        from public.insured_phones ph1
        join public.insured_phones ph2 on ph2.e164 = ph1.e164 and ph2.account_id <> ph1.account_id
        where ph1.e164 is not null and btrim(ph1.e164) <> '') pr
  join public.accounts x on x.id = pr.a1 and x.deleted_at is null
  join public.accounts y on y.id = pr.a2 and y.deleted_at is null
  where not exists (select 1 from public.account_relationships r
      where least(r.from_account, r.to_account) = least(pr.a1, pr.a2)
        and greatest(r.from_account, r.to_account) = greatest(pr.a1, pr.a2))
  on conflict do nothing;
  get diagnostics c_phone = row_count;

  insert into public.account_relationship_suggestions (from_account, to_account, rel_type, signal, reason, confidence)
  select distinct least(pr.a1, pr.a2), greatest(pr.a1, pr.a2), 'related', 'shared_address', 'Shares a mailing address', 0.5
  from (select ad1.account_id as a1, ad2.account_id as a2
        from public.insured_addresses ad1
        join public.insured_addresses ad2 on ad2.account_id <> ad1.account_id
         and lower(btrim(ad1.line1)) = lower(btrim(ad2.line1))
         and coalesce(ad1.postal_code, '') = coalesce(ad2.postal_code, '')
        where ad1.line1 is not null and btrim(ad1.line1) <> '') pr
  join public.accounts x on x.id = pr.a1 and x.deleted_at is null
  join public.accounts y on y.id = pr.a2 and y.deleted_at is null
  where not exists (select 1 from public.account_relationships r
      where least(r.from_account, r.to_account) = least(pr.a1, pr.a2)
        and greatest(r.from_account, r.to_account) = greatest(pr.a1, pr.a2))
  on conflict do nothing;
  get diagnostics c_address = row_count;

  insert into public.account_relationship_suggestions (from_account, to_account, rel_type, signal, reason, confidence)
  select distinct a.id, m.id, 'spouse', 'spouse_name', 'Spouse name "' || a.spouse_name || '" matches ' || m.name, 0.6
  from public.accounts a
  join public.accounts m on m.deleted_at is null and m.id <> a.id
   and position(lower(btrim(a.spouse_name)) in lower(btrim(m.name))) > 0
  where a.deleted_at is null and a.spouse_name is not null and length(btrim(a.spouse_name)) >= 4
    and not exists (select 1 from public.account_relationships r
        where least(r.from_account, r.to_account) = least(a.id, m.id)
          and greatest(r.from_account, r.to_account) = greatest(a.id, m.id))
  on conflict do nothing;
  get diagnostics c_spouse = row_count;

  return jsonb_build_object('business_email_name', c_email, 'surname_business', c_surname,
    'shared_phone', c_phone, 'shared_address', c_address, 'spouse_name', c_spouse,
    'total', c_email + c_surname + c_phone + c_address + c_spouse);
end;
$function$;
