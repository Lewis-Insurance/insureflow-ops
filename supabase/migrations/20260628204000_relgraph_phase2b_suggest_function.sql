-- Relationship Graph — Phase 2b: the nightly suggestion engine (set-based).
-- Proposes edges from signals already in the data. NEVER auto-commits: every row
-- lands in account_relationship_suggestions (status pending) for one-click confirm.
-- Skips any pair that already has an edge, and de-dups via the suggestions unique index.

create or replace function public.generate_relationship_suggestions()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  c_email   int := 0;
  c_surname int := 0;
  c_phone   int := 0;
  c_address int := 0;
  c_spouse  int := 0;
begin
  -- 1) Business email local-part matches a person's name / goes_by / alias -> owns
  insert into public.account_relationship_suggestions (from_account, to_account, rel_type, signal, reason, confidence)
  select distinct p.id, b.id, 'owns', 'business_email_name',
    'Business email ' || b.email || ' matches ' || p.name, 0.6
  from public.accounts b
  cross join lateral (select lower(split_part(b.email, '@', 1)) as local) e
  join public.accounts p
    on p.deleted_at is null and p.type = 'household' and p.id <> b.id
   and length(e.local) >= 4
   and (
        position(e.local in lower(p.name)) > 0
        or lower(coalesce(p.goes_by, '')) = e.local
        or exists (select 1 from public.account_aliases al
                     where al.account_id = p.id and lower(al.alias) = e.local)
   )
  where b.deleted_at is null and b.type = 'commercial_business'
    and b.email is not null and b.email like '%@%'
    and not exists (select 1 from public.account_relationships r
        where least(r.from_account, r.to_account) = least(p.id, b.id)
          and greatest(r.from_account, r.to_account) = greatest(p.id, b.id))
  on conflict do nothing;
  get diagnostics c_email = row_count;

  -- 2) Shared surname token between an individual and a business name -> owns
  insert into public.account_relationship_suggestions (from_account, to_account, rel_type, signal, reason, confidence)
  select distinct p.id, b.id, 'owns', 'surname_business',
    'Shares surname with business ' || b.name, 0.4
  from public.accounts p
  cross join lateral (
    select lower(coalesce((regexp_match(btrim(p.name), '([A-Za-z]+)\s*$'))[1], '')) as surname
  ) s
  join public.accounts b
    on b.deleted_at is null and b.type = 'commercial_business' and b.id <> p.id
   and length(s.surname) >= 4
   and position(s.surname in lower(b.name)) > 0
  where p.deleted_at is null and p.type = 'household'
    and not exists (select 1 from public.account_relationships r
        where least(r.from_account, r.to_account) = least(p.id, b.id)
          and greatest(r.from_account, r.to_account) = greatest(p.id, b.id))
  on conflict do nothing;
  get diagnostics c_surname = row_count;

  -- 3) Shared phone number (e164) -> related
  insert into public.account_relationship_suggestions (from_account, to_account, rel_type, signal, reason, confidence)
  select distinct least(pr.a1, pr.a2), greatest(pr.a1, pr.a2), 'related', 'shared_phone',
    'Shares a phone number', 0.5
  from (
    select ph1.account_id as a1, ph2.account_id as a2
    from public.insured_phones ph1
    join public.insured_phones ph2
      on ph2.e164 = ph1.e164 and ph2.account_id <> ph1.account_id
    where ph1.e164 is not null and btrim(ph1.e164) <> ''
  ) pr
  join public.accounts x on x.id = pr.a1 and x.deleted_at is null
  join public.accounts y on y.id = pr.a2 and y.deleted_at is null
  where not exists (select 1 from public.account_relationships r
      where least(r.from_account, r.to_account) = least(pr.a1, pr.a2)
        and greatest(r.from_account, r.to_account) = greatest(pr.a1, pr.a2))
  on conflict do nothing;
  get diagnostics c_phone = row_count;

  -- 4) Shared mailing address (line1 + postal) -> related
  insert into public.account_relationship_suggestions (from_account, to_account, rel_type, signal, reason, confidence)
  select distinct least(pr.a1, pr.a2), greatest(pr.a1, pr.a2), 'related', 'shared_address',
    'Shares a mailing address', 0.5
  from (
    select ad1.account_id as a1, ad2.account_id as a2
    from public.insured_addresses ad1
    join public.insured_addresses ad2
      on ad2.account_id <> ad1.account_id
     and lower(btrim(ad1.line1)) = lower(btrim(ad2.line1))
     and coalesce(ad1.postal_code, '') = coalesce(ad2.postal_code, '')
    where ad1.line1 is not null and btrim(ad1.line1) <> ''
  ) pr
  join public.accounts x on x.id = pr.a1 and x.deleted_at is null
  join public.accounts y on y.id = pr.a2 and y.deleted_at is null
  where not exists (select 1 from public.account_relationships r
      where least(r.from_account, r.to_account) = least(pr.a1, pr.a2)
        and greatest(r.from_account, r.to_account) = greatest(pr.a1, pr.a2))
  on conflict do nothing;
  get diagnostics c_address = row_count;

  -- 5) spouse_name (partial) matches an existing account -> spouse
  --    (exact matches were already promoted to edges in Phase 1.)
  insert into public.account_relationship_suggestions (from_account, to_account, rel_type, signal, reason, confidence)
  select distinct a.id, m.id, 'spouse', 'spouse_name',
    'Spouse name "' || a.spouse_name || '" matches ' || m.name, 0.6
  from public.accounts a
  join public.accounts m
    on m.deleted_at is null and m.id <> a.id
   and position(lower(btrim(a.spouse_name)) in lower(btrim(m.name))) > 0
  where a.deleted_at is null
    and a.spouse_name is not null and length(btrim(a.spouse_name)) >= 4
    and not exists (select 1 from public.account_relationships r
        where least(r.from_account, r.to_account) = least(a.id, m.id)
          and greatest(r.from_account, r.to_account) = greatest(a.id, m.id))
  on conflict do nothing;
  get diagnostics c_spouse = row_count;

  return jsonb_build_object(
    'business_email_name', c_email,
    'surname_business', c_surname,
    'shared_phone', c_phone,
    'shared_address', c_address,
    'spouse_name', c_spouse,
    'total', c_email + c_surname + c_phone + c_address + c_spouse
  );
end;
$function$;

revoke execute on function public.generate_relationship_suggestions() from anon, public;
grant execute on function public.generate_relationship_suggestions() to service_role;
