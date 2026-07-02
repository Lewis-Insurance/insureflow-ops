-- Relationship Graph v2 / Sprint 3 — suggester rebuild (noise-free).
--
-- Defect being fixed: the old surname_business block emitted an `owns` suggestion
-- for ANY person whose surname appeared in a business name, with no second
-- signal. That put 18 unrelated Smiths on one LLC.
--
-- Rebuild:
--   * surname_business is GATED: an `owns` suggestion fires only when the surname
--     matches AND the person and business share a contact point (phone / email /
--     address / TIN). Surname alone -> zero suggestions.
--   * TIN/FEIN (accounts.tin_last4) participates as a corroborating signal.
--   * shared phone/email/address read from BOTH the normalized insured_* tables
--     AND the legacy accounts.phone_e164/phone/email/address_line1 columns, so
--     records that only have legacy columns are no longer missed.
--   * business<->business affiliated_business detection (shared owner OR shared
--     strong contact between two commercial accounts).
--   * household_member / dependent suggestions beyond spouse.
--   * one ranked candidate per pair (most specific relationship wins), all
--     human-confirm (status defaults 'pending'), deduped against existing edges
--     and (via the ars_unique index + on conflict) existing suggestions.
--
-- Rollback: re-create the prior generate_relationship_suggestions() body.

create or replace function public.generate_relationship_suggestions()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_result jsonb;
begin
  if auth.uid() is not null and not public.is_staff() then
    raise exception 'generate_relationship_suggestions: staff access required';
  end if;

  with contacts as (
    -- phones (normalized to >=10 digits) from normalized + legacy
    select account_id, 'phone'::text as kind, regexp_replace(e164, '\D', '', 'g') as val
      from public.insured_phones
      where e164 is not null and length(regexp_replace(e164, '\D', '', 'g')) >= 10
    union
    select id, 'phone', regexp_replace(coalesce(phone_e164, phone), '\D', '', 'g')
      from public.accounts
      where deleted_at is null and coalesce(phone_e164, phone) is not null
        and length(regexp_replace(coalesce(phone_e164, phone), '\D', '', 'g')) >= 10
    union
    -- emails
    select account_id, 'email', lower(btrim(email)) from public.insured_emails where email like '%@%'
    union
    select id, 'email', lower(btrim(email)) from public.accounts where deleted_at is null and email like '%@%'
    union
    -- addresses (line1 + postal)
    select account_id, 'address', lower(btrim(line1)) || '|' || lower(coalesce(postal_code, ''))
      from public.insured_addresses where line1 is not null and btrim(line1) <> ''
    union
    select id, 'address', lower(btrim(address_line1)) || '|' || lower(coalesce(zip_code, ''))
      from public.accounts where deleted_at is null and address_line1 is not null and btrim(address_line1) <> ''
    union
    -- TIN/FEIN (corroborating only)
    select id, 'tin', btrim(tin_last4) from public.accounts
      where deleted_at is null and tin_last4 is not null and btrim(tin_last4) <> ''
  ),
  shared as (
    select least(c1.account_id, c2.account_id) as a1,
           greatest(c1.account_id, c2.account_id) as a2,
           array_agg(distinct c1.kind) as kinds
    from contacts c1
    join contacts c2 on c1.kind = c2.kind and c1.val = c2.val and c1.account_id <> c2.account_id
    group by 1, 2
  ),
  acc as (
    select id, name, type::text as type_t, goes_by, spouse_name,
           lower(coalesce((regexp_match(btrim(name), '([A-Za-z]+)\s*$'))[1], '')) as surname,
           (select count(*) from public.policies p where p.account_id = a.id and p.deleted_at is null) as pol_count
    from public.accounts a
    where deleted_at is null
  ),
  cand as (
    -- 1) business email local-part matches a person's name (owns: person -> business)
    select p.id as frm, b.id as too, 'owns'::text as rel, 'business_email_name'::text as sig,
           'Business email ' || b.email || ' matches ' || p.name as rsn, 0.6::numeric as conf, 10 as prio
    from public.accounts b
    cross join lateral (select lower(split_part(b.email, '@', 1)) as local) e
    join acc p on p.type_t = 'household' and p.id <> b.id and length(e.local) >= 4
      and (position(e.local in lower(p.name)) > 0
           or lower(coalesce(p.goes_by, '')) = e.local
           or exists (select 1 from public.account_aliases al where al.account_id = p.id and lower(al.alias) = e.local))
    where b.deleted_at is null and b.type::text = 'commercial_business' and b.email like '%@%'

    union all
    -- 2) surname match GATED by a shared contact point (owns: person -> business)
    select p.id, b.id, 'owns', 'surname_business',
           'Shares surname with business ' || b.name || ' and a shared contact point', 0.6, 9
    from acc p
    join acc b on b.type_t = 'commercial_business' and b.id <> p.id
      and length(p.surname) >= 4 and position(p.surname in lower(b.name)) > 0
    where p.type_t = 'household'
      and exists (select 1 from shared sh where sh.a1 = least(p.id, b.id) and sh.a2 = greatest(p.id, b.id))

    union all
    -- 3) two businesses co-owned by the same person (affiliated_business)
    select least(o1.to_account, o2.to_account), greatest(o1.to_account, o2.to_account),
           'affiliated_business', 'shared_owner', 'Co-owned with another business by the same owner', 0.6, 8
    from public.account_relationships o1
    join public.account_relationships o2
      on o1.from_account = o2.from_account and o1.to_account <> o2.to_account
     and o1.rel_type = 'owns' and o2.rel_type = 'owns'
    join acc b1 on b1.id = o1.to_account and b1.type_t = 'commercial_business'
    join acc b2 on b2.id = o2.to_account and b2.type_t = 'commercial_business'

    union all
    -- 4) two businesses sharing a strong contact point (affiliated_business)
    select sh.a1, sh.a2, 'affiliated_business', 'shared_contact', 'Two businesses share a contact point', 0.5, 7
    from shared sh
    join acc b1 on b1.id = sh.a1 and b1.type_t = 'commercial_business'
    join acc b2 on b2.id = sh.a2 and b2.type_t = 'commercial_business'
    where sh.kinds && array['phone','email','address']

    union all
    -- 5) spouse name match (spouse)
    select a.id, m.id, 'spouse', 'spouse_name', 'Spouse name "' || a.spouse_name || '" matches ' || m.name, 0.6, 6
    from acc a
    join acc m on m.id <> a.id and position(lower(btrim(a.spouse_name)) in lower(btrim(m.name))) > 0
    where a.spouse_name is not null and length(btrim(a.spouse_name)) >= 4

    union all
    -- 6) dependent: two household members sharing address AND surname, one with policies one without (dependent)
    select hp.id, dep.id, 'dependent', 'household_dependent',
           'Possible dependent of ' || hp.name || ' (shared address and surname)', 0.4, 5
    from acc hp
    join acc dep on dep.id <> hp.id and hp.type_t = 'household' and dep.type_t = 'household'
      and length(hp.surname) >= 3 and hp.surname = dep.surname
      and hp.pol_count > 0 and dep.pol_count = 0
      and exists (select 1 from shared sh where sh.a1 = least(hp.id, dep.id) and sh.a2 = greatest(hp.id, dep.id) and sh.kinds && array['address'])

    union all
    -- 7) household_member: two household members sharing an address (household_member)
    select sh.a1, sh.a2, 'household_member', 'shared_address', 'Household members sharing an address', 0.5, 4
    from shared sh
    join acc x on x.id = sh.a1 and x.type_t = 'household'
    join acc y on y.id = sh.a2 and y.type_t = 'household'
    where sh.kinds && array['address']

    union all
    -- 8) catch-all: any pair sharing a strong contact point (related)
    select sh.a1, sh.a2, 'related', 'shared_contact', 'Shares a contact point', 0.5, 1
    from shared sh
    where sh.kinds && array['phone','email','address']
  ),
  ranked as (
    select frm, too, rel, sig, rsn, conf,
           row_number() over (partition by least(frm, too), greatest(frm, too) order by prio desc) as rn
    from cand
  ),
  ins as (
    insert into public.account_relationship_suggestions (from_account, to_account, rel_type, signal, reason, confidence)
    select r.frm, r.too, r.rel, r.sig, r.rsn, r.conf
    from ranked r
    where r.rn = 1
      and not exists (
        select 1 from public.account_relationships ar
        where least(ar.from_account, ar.to_account) = least(r.frm, r.too)
          and greatest(ar.from_account, ar.to_account) = greatest(r.frm, r.too))
    on conflict do nothing
    returning signal
  ),
  counts as (
    select signal, count(*)::int as cnt from ins group by signal
  )
  select coalesce(jsonb_object_agg(signal, cnt), '{}'::jsonb)
         || jsonb_build_object('total', coalesce(sum(cnt), 0))
  into v_result
  from counts;

  return coalesce(v_result, jsonb_build_object('total', 0));
end;
$function$;
