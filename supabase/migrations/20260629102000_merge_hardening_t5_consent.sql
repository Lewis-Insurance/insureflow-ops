-- Merge hardening T5: consent strictest-wins resolution (policy section C.6).
-- After merge_accounts reparents the loser consent rows onto the survivor, collapse
-- them so the survivor inherits the MOST RESTRICTIVE state. Never grants a permission
-- neither side independently had. Called after the merge inside the review path.

create or replace function public.apply_consent_strictest_wins(p_survivor uuid, p_losers uuid[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_all uuid[] := p_survivor || p_losers;
  v_dnc boolean := false;
  v_phone_dups int := 0;
begin
  -- 1) insured_phones: de-dup the survivor's phones by number, do_not_call = OR (strictest).
  with norm as (
    select id, lower(btrim(e164)) as k, do_not_call, is_primary, created_at
    from public.insured_phones
    where account_id = p_survivor and nullif(btrim(e164),'') is not null
  ),
  agg as (
    select k,
           bool_or(coalesce(do_not_call,false)) as any_dnc,
           bool_or(coalesce(is_primary,false))  as any_primary,
           (array_agg(id order by coalesce(is_primary,false) desc, created_at))[1] as keep_id,
           array_agg(id) as all_ids
    from norm group by k having count(*) > 1
  ),
  upd as (
    update public.insured_phones p
       set do_not_call = a.any_dnc, is_primary = a.any_primary
      from agg a where p.id = a.keep_id
      returning 1
  )
  delete from public.insured_phones p
  using agg a
  where p.id = any(a.all_ids) and p.id <> a.keep_id;
  get diagnostics v_phone_dups = row_count;

  -- account is do-not-contact if any surviving phone is DNC
  select bool_or(coalesce(do_not_call,false)) into v_dnc
    from public.insured_phones where account_id = p_survivor;

  -- 2) communication_preferences: collapse to one survivor row. Suppression flags OR-ed,
  --    marketing-allowed flags AND-ed (any opt-out wins).
  if exists (select 1 from public.communication_preferences where account_id = any(v_all)) then
    with rolled as (
      select
        bool_or(coalesce(do_not_contact,false)) or coalesce(v_dnc,false) as do_not_contact,
        bool_or(coalesce(do_not_market,false))  as do_not_market,
        bool_or(coalesce(deceased,false))       as deceased,
        bool_and(coalesce(sms_marketing,false))   as sms_marketing,
        bool_and(coalesce(email_marketing,false)) as email_marketing,
        bool_and(coalesce(phone_marketing,false)) as phone_marketing,
        bool_and(coalesce(mail_marketing,false))  as mail_marketing,
        (array_agg(id order by coalesce(last_updated_at, created_at) desc nulls last))[1] as keep_id
      from public.communication_preferences where account_id = any(v_all)
    ),
    upd as (
      update public.communication_preferences c
         set do_not_contact = r.do_not_contact, do_not_market = r.do_not_market, deceased = r.deceased,
             sms_marketing = r.sms_marketing, email_marketing = r.email_marketing,
             phone_marketing = r.phone_marketing, mail_marketing = r.mail_marketing,
             account_id = p_survivor, last_updated_at = now(), last_updated_source = 'merge_strictest_wins'
        from rolled r where c.id = r.keep_id
        returning 1
    )
    delete from public.communication_preferences c
    using rolled r
    where c.account_id = any(v_all) and c.id <> r.keep_id;
  end if;
  -- When no communication_preferences row exists, a DNC phone is already the source of
  -- truth (insured_phones.do_not_call), so no synthetic account-level row is created.

  -- 3) consents (account-scoped granted boolean): an opt-out for a type voids contradicting opt-ins.
  update public.consents c
     set deleted_at = now()
   where c.account_id = p_survivor and c.deleted_at is null and c.granted = true
     and exists (
       select 1 from public.consents c2
       where c2.account_id = p_survivor and c2.deleted_at is null and c2.granted = false and c2.type = c.type
     );

  return jsonb_build_object('survivor', p_survivor, 'phone_dups_removed', v_phone_dups, 'account_dnc', coalesce(v_dnc,false));
end;
$function$;

revoke execute on function public.apply_consent_strictest_wins(uuid, uuid[]) from anon, public;
grant execute on function public.apply_consent_strictest_wins(uuid, uuid[]) to authenticated, service_role;
