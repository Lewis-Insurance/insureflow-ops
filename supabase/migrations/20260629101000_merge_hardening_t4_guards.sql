-- Merge hardening T4: pre-merge guards (policy section B) that merge_accounts lacks.
-- Blocks cross-type, conflicting strong-ID, and Jr/Sr suffix-mismatch merges. Called
-- both at propose time (UI) and inside the merge path. Also reclassifies the existing
-- cross-type pending groups out of the merge queue.

create or replace function public.assert_mergeable(p_survivor uuid, p_losers uuid[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_all uuid[] := p_survivor || p_losers;
  v_n int;
begin
  -- Cross-type: individual (household) vs business never merges -> link instead.
  select count(distinct type::text) into v_n
    from public.accounts where id = any(v_all) and deleted_at is null;
  if v_n > 1 then
    raise exception 'merge blocked: cross-type group (individual + business) cannot be merged — link instead';
  end if;

  -- Conflicting strong identifiers are dispositive (different parties).
  select count(distinct tin_last4) into v_n
    from public.accounts where id = any(v_all) and nullif(btrim(tin_last4),'') is not null;
  if v_n > 1 then
    raise exception 'merge blocked: conflicting tax IDs (tin_last4) across the group';
  end if;

  select count(distinct date_of_birth) into v_n
    from public.accounts where id = any(v_all) and date_of_birth is not null;
  if v_n > 1 then
    raise exception 'merge blocked: conflicting dates of birth across the group';
  end if;

  select count(distinct fein) into v_n
    from public.commercial_business_accounts
    where account_id = any(v_all) and nullif(btrim(fein),'') is not null;
  if v_n > 1 then
    raise exception 'merge blocked: conflicting FEIN across the group';
  end if;

  -- Suffix mismatch (Jr/Sr/II/III/IV): father and son, not a duplicate.
  select count(distinct sfx) into v_n from (
    select (regexp_match(lower(name), '\m(jr|sr|ii|iii|iv)\M'))[1] as sfx
    from public.accounts where id = any(v_all) and deleted_at is null
  ) s where sfx is not null;
  if v_n > 1 then
    raise exception 'merge blocked: name suffix mismatch (Jr/Sr) — likely different people';
  end if;
end;
$function$;

revoke execute on function public.assert_mergeable(uuid, uuid[]) from anon, public;
grant execute on function public.assert_mergeable(uuid, uuid[]) to authenticated, service_role;

-- Reclassify cross-type pending groups out of the merge queue. They become link
-- candidates: list_duplicate_groups_for_review only shows status='pending', so these
-- can no longer be merged from the UI.
update public.duplicate_groups g
set status = 'link_candidate', reviewed_at = now()
where g.status = 'pending'
  and g.entity_type = 'accounts'
  and (select count(distinct a.type::text)
       from public.accounts a
       where a.id = any(g.entity_ids) and a.deleted_at is null) > 1;
