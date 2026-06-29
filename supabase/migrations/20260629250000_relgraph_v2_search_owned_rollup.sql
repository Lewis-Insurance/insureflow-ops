-- Relationship Graph v2 / Sprint 5 — search roll-up.
--
-- search_accounts already resolves goes_by + aliases + trigram to the person.
-- Add owned_business_count so a search result can show, inline, how many live
-- businesses that person owns ("search the person -> see their book").
--
-- Adding a column to a RETURNS TABLE changes the result type, so drop + recreate.
-- Rollback: recreate the prior 11-column search_accounts (without owned_business_count).

drop function if exists public.search_accounts(text, integer);

create function public.search_accounts(p_q text, p_limit integer default 20)
 returns table(account_id uuid, name text, goes_by text, type text, email text, phone text, city text, state text, policies_count integer, owned_business_count integer, match_reason text, score real)
 language sql
 stable security definer
 set search_path to 'public', 'extensions'
as $function$
  with q as (select nullif(trim(coalesce(p_q, '')), '') as term)
  select
    a.id as account_id, a.name, a.goes_by, a.type::text as type, a.email, a.phone, a.city, a.state,
    coalesce((select count(*)::int from public.policies pol
                where pol.account_id = a.id and pol.deleted_at is null), 0) as policies_count,
    coalesce((select count(*)::int from public.account_relationships r
                join public.accounts b on b.id = r.to_account and b.deleted_at is null and b.type::text = 'commercial_business'
                where r.from_account = a.id and r.rel_type = 'owns'), 0) as owned_business_count,
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

revoke execute on function public.search_accounts(text, integer) from anon, public;
grant  execute on function public.search_accounts(text, integer) to authenticated;
