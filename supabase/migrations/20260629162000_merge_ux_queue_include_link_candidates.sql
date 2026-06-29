-- Merge UX: the review queue surfaces blocked (link_candidate) groups too, so a
-- reviewer sees cross-type pairs as blocked-with-reason and can Link instead —
-- rather than them silently vanishing. Pending sorts first.

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
  where g.entity_type = 'accounts' and g.status in ('pending', 'link_candidate')
    and (auth.uid() is null or public.is_staff())
  order by (g.status = 'pending') desc, g.match_score desc nulls last, g.created_at desc
  limit p_limit offset p_offset;
$function$;
