-- Merge UX: list reversible (single-loser, not-yet-unmerged) account merges for the
-- "Recently merged" undo view. Returns resolved names + counts from the manifest;
-- no raw PII snapshot is sent to the client. Staff-gated.

create or replace function public.list_recent_merges(p_limit integer default 50)
returns table(
  merge_history_id uuid,
  rule text,
  merged_at timestamp with time zone,
  survivor_id uuid,
  survivor_name text,
  loser_id uuid,
  loser_name text,
  reparent_total integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    h.id,
    h.merge_data->>'rule',
    h.created_at,
    h.survivor_id,
    coalesce((select a.name from public.accounts a where a.id = h.survivor_id), h.merge_data->'survivor_before'->>'name'),
    h.merged_ids[1],
    coalesce(h.merge_data->'losers_before'->0->>'name', (select a.name from public.accounts a where a.id = h.merged_ids[1])),
    coalesce((h.merge_data->>'reparent_total')::int, 0)
  from public.merge_history h
  where h.entity_type = 'accounts'
    and h.unmerged_at is null
    and coalesce(array_length(h.merged_ids, 1), 0) = 1
    and (auth.uid() is null or public.is_staff())
  order by h.created_at desc
  limit p_limit;
$function$;

revoke execute on function public.list_recent_merges(integer) from anon, public;
grant execute on function public.list_recent_merges(integer) to authenticated;
