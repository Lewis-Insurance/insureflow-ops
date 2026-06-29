-- Relationship Graph v2 / Sprint 2 — recursive Hub function.
--
-- get_account_cluster(p_account_id) returns the whole cluster for ANY member:
-- the owner (person), every business they own, sibling businesses co-owned via
-- that owner, affiliated businesses, and household/spouse/dependent members --
-- each node enriched with policy count, active premium and next expiration, plus
-- cluster roll-up totals duplicated on every row for the Hub UI.
--
-- Traversal is a bounded (<=5 hop), cycle-guarded recursive walk over the
-- relationship edge types that form a real cluster (owns, spouse,
-- household_member, dependent, affiliated_business, parent_company). same_as and
-- related are intentionally excluded -- same_as is a merge/dup marker and related
-- is too loose to belong in an ownership cluster.
--
-- Single-hop get_account_relationships is left intact for the direct-edge views.
-- is_staff()-gated (service-role null-uid allowed); SECURITY DEFINER.

drop function if exists public.get_account_cluster(uuid);

create or replace function public.get_account_cluster(p_account_id uuid)
returns table(
  account_id uuid,
  name text,
  goes_by text,
  account_type text,
  account_status text,
  is_business boolean,
  node_role text,
  depth int,
  policies_count int,
  active_premium numeric,
  next_expiration date,
  owner_account_id uuid,
  owner_name text,
  cluster_size int,
  cluster_business_count int,
  cluster_member_count int,
  cluster_total_policies int,
  cluster_active_premium numeric
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
begin
  if not (auth.uid() is null or public.is_staff()) then
    return;
  end if;

  return query
  with recursive trav(aid, depth, path) as (
    select p_account_id, 0, array[p_account_id]
    union all
    select nb.other, t.depth + 1, t.path || nb.other
    from trav t
    join lateral (
      select case when r.from_account = t.aid then r.to_account else r.from_account end as other
      from public.account_relationships r
      where (r.from_account = t.aid or r.to_account = t.aid)
        and r.rel_type in ('owns','spouse','household_member','dependent','affiliated_business','parent_company')
    ) nb on true
    where nb.other <> all(t.path)
      and t.depth < 5
  ),
  nodes as (
    select aid, min(depth) as depth from trav group by aid
  ),
  enriched as (
    select
      a.id as aid,
      n.depth,
      a.name,
      a.goes_by,
      a.account_type::text as account_type,
      a.account_status::text as account_status,
      (a.type::text = 'commercial_business') as is_business,
      coalesce((select count(*)::int from public.policies p where p.account_id = a.id and p.deleted_at is null), 0) as policies_count,
      (select sum(p.premium) from public.policies p where p.account_id = a.id and p.deleted_at is null and p.status = 'active') as active_premium,
      (select min(p.expiration_date) from public.policies p where p.account_id = a.id and p.deleted_at is null and p.status = 'active') as next_expiration
    from nodes n
    join public.accounts a on a.id = n.aid and a.deleted_at is null
  ),
  owner_pick as (
    -- the person in the cluster who owns the most businesses is the hub center
    select e.aid
    from enriched e
    where e.is_business = false
    order by (select count(*) from public.account_relationships r where r.from_account = e.aid and r.rel_type = 'owns') desc, e.name
    limit 1
  )
  select
    e.aid,
    e.name,
    e.goes_by,
    e.account_type,
    e.account_status,
    e.is_business,
    case
      when e.aid = (select aid from owner_pick) then 'owner'
      else coalesce((
        select case r.rel_type
          when 'owns'               then 'owned_business'
          when 'spouse'             then 'spouse'
          when 'household_member'   then 'household'
          when 'dependent'          then 'dependent'
          when 'affiliated_business' then 'affiliated_business'
          when 'parent_company'     then 'parent_company'
          else 'related'
        end
        from public.account_relationships r
        where ((r.from_account = (select aid from owner_pick) and r.to_account = e.aid)
            or (r.to_account = (select aid from owner_pick) and r.from_account = e.aid))
        order by r.is_primary desc
        limit 1
      ), case when e.is_business then 'affiliated_business' else 'member' end)
    end as node_role,
    e.depth,
    e.policies_count,
    e.active_premium,
    e.next_expiration,
    (select aid from owner_pick) as owner_account_id,
    (select name from enriched where aid = (select aid from owner_pick)) as owner_name,
    count(*) over ()::int as cluster_size,
    count(*) filter (where e.is_business) over ()::int as cluster_business_count,
    count(*) filter (where not e.is_business) over ()::int as cluster_member_count,
    coalesce(sum(e.policies_count) over (), 0)::int as cluster_total_policies,
    coalesce(sum(e.active_premium) over (), 0) as cluster_active_premium
  from enriched e
  order by (e.aid = (select aid from owner_pick)) desc, e.is_business desc, e.active_premium desc nulls last, e.name;
end;
$function$;

revoke execute on function public.get_account_cluster(uuid) from anon, public;
grant execute on function public.get_account_cluster(uuid) to authenticated;

-- ROLLBACK: drop function if exists public.get_account_cluster(uuid);
