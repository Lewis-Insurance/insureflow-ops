-- Relationship Graph — Phase 3: dedup review + alias-aware global search + retire
--
-- 1) global_search_v1 (sidebar) becomes alias-aware (goes_by + account_aliases).
-- 2) Group-merge wrapper records same_as provenance, then runs the existing engine.
-- 3) Review-queue list RPC over the 165 pending duplicate_groups.
-- 4) Retire dead scaffolding: DROP customer_identities (0 rows, 0 readers).
--    NOTE: businesses is intentionally KEPT — it is still read by
--    src/components/admin/CompanyManagement.tsx, global_search_v1 and
--    search_customers_ft. Retiring it would break a live screen; deferred on purpose.

-- 1) Alias-aware sidebar global search --------------------------------------------
create or replace function public.global_search_v1(p_search_term text, p_limit integer default 50)
returns table(entity_type text, id uuid, label text, subtitle text, email text, phone text)
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_search_pattern TEXT;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL OR p_search_term IS NULL OR trim(p_search_term) = '' THEN
    RETURN;
  END IF;
  v_search_pattern := '%' || trim(p_search_term) || '%';

  RETURN QUERY

  -- Accounts (alias-aware: name, goes_by, aliases, email, phone)
  SELECT 'account'::TEXT, a.id,
    CASE WHEN a.goes_by IS NOT NULL AND a.goes_by <> ''
         THEN a.name || ' (' || a.goes_by || ')' ELSE COALESCE(a.name, 'Unnamed Account') END,
    CASE WHEN a.city IS NOT NULL AND a.state IS NOT NULL THEN a.city || ', ' || a.state ELSE NULL END,
    a.email, a.phone
  FROM accounts a
  LEFT JOIN agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
    AND awm.user_id = v_user_id AND awm.status = 'active'
  WHERE a.deleted_at IS NULL
    AND (a.agency_workspace_id IS NULL OR awm.id IS NOT NULL)
    AND (a.name ILIKE v_search_pattern OR a.email ILIKE v_search_pattern OR a.phone ILIKE v_search_pattern
      OR a.goes_by ILIKE v_search_pattern
      OR EXISTS (SELECT 1 FROM account_aliases al WHERE al.account_id = a.id AND al.alias ILIKE v_search_pattern))

  UNION ALL

  -- Contacts
  SELECT 'contact'::TEXT, c.id,
    COALESCE(NULLIF(trim(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), ''), 'Unnamed Contact'),
    NULL, c.email_primary, COALESCE(c.phone_mobile, c.phone_home, c.phone_work)
  FROM contacts c
  INNER JOIN accounts a ON a.id = c.account_id
  LEFT JOIN agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
    AND awm.user_id = v_user_id AND awm.status = 'active'
  WHERE c.deleted_at IS NULL
    AND (a.agency_workspace_id IS NULL OR awm.id IS NOT NULL)
    AND (c.first_name ILIKE v_search_pattern OR c.last_name ILIKE v_search_pattern
      OR c.email_primary ILIKE v_search_pattern OR c.phone_mobile ILIKE v_search_pattern)

  UNION ALL

  -- Businesses (kept; empty today)
  SELECT 'business'::TEXT, b.id, COALESCE(b.legal_name, b.dba, 'Unnamed Business'),
    b.dba, NULL, NULL
  FROM businesses b
  INNER JOIN accounts a ON a.business_id = b.id
  LEFT JOIN agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
    AND awm.user_id = v_user_id AND awm.status = 'active'
  WHERE b.deleted_at IS NULL
    AND (a.agency_workspace_id IS NULL OR awm.id IS NOT NULL)
    AND (b.legal_name ILIKE v_search_pattern OR b.dba ILIKE v_search_pattern)

  UNION ALL

  -- Policies
  SELECT 'policy'::TEXT, p.id,
    CASE WHEN p.policy_number IS NOT NULL THEN 'Policy #' || p.policy_number ELSE COALESCE(p.named_insured, 'Unnamed Policy') END,
    COALESCE(car.name, 'Unknown Carrier') || ' - ' || COALESCE(p.line_of_business, 'Unknown Line'),
    NULL, NULL
  FROM policies p
  LEFT JOIN carriers car ON car.id = p.carrier_id
  INNER JOIN accounts a ON a.id = p.account_id
  LEFT JOIN agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
    AND awm.user_id = v_user_id AND awm.status = 'active'
  WHERE p.deleted_at IS NULL
    AND (a.agency_workspace_id IS NULL OR awm.id IS NOT NULL)
    AND (p.policy_number ILIKE v_search_pattern OR p.named_insured ILIKE v_search_pattern
      OR p.line_of_business ILIKE v_search_pattern OR car.name ILIKE v_search_pattern)

  LIMIT p_limit;
END;
$function$;

-- 2) Group-merge wrapper: provenance (same_as) then the existing merge engine ------
create or replace function public.relgraph_merge_duplicate_group(p_group_id uuid, p_survivor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  g record;
  losers uuid[];
  l uuid;
begin
  select * into g from public.duplicate_groups where id = p_group_id and status = 'pending';
  if not found then
    raise exception 'Duplicate group not found or already processed';
  end if;
  if not (p_survivor_id = any(g.entity_ids)) then
    raise exception 'Survivor ID not found in duplicate group';
  end if;

  losers := array_remove(g.entity_ids, p_survivor_id);

  -- Record provenance as same_as edges (survivor -> each loser) BEFORE the merge
  -- soft-deletes the losers, so history is never silently lost.
  if g.entity_type = 'accounts' then
    foreach l in array losers loop
      insert into public.account_relationships
        (from_account, to_account, rel_type, source, note, created_by)
      values
        (p_survivor_id, l, 'same_as', 'merge',
         'Merged duplicate (group ' || p_group_id::text || ')', auth.uid())
      on conflict do nothing;
    end loop;
  end if;

  return public.merge_duplicate_records(p_group_id, p_survivor_id, '{}'::jsonb);
end;
$function$;

grant execute on function public.relgraph_merge_duplicate_group(uuid, uuid) to authenticated;

-- 3) Review queue: pending duplicate_groups with resolved member previews ----------
create or replace function public.list_duplicate_groups_for_review(p_limit integer default 50, p_offset integer default 0)
returns table(
  group_id uuid,
  entity_type text,
  match_score numeric,
  status text,
  created_at timestamptz,
  member_count integer,
  members jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    g.id,
    g.entity_type,
    g.match_score,
    g.status,
    g.created_at,
    coalesce(array_length(g.entity_ids, 1), 0),
    (select jsonb_agg(jsonb_build_object(
        'account_id', a.id,
        'name', a.name,
        'goes_by', a.goes_by,
        'type', a.type::text,
        'status', a.account_status::text,
        'email', a.email,
        'phone', a.phone,
        'city', a.city,
        'state', a.state,
        'created_at', a.created_at,
        'deleted_at', a.deleted_at,
        'policies_count', coalesce((select count(*)::int from public.policies p
                                      where p.account_id = a.id and p.deleted_at is null), 0),
        'active_premium', (select sum(p.premium) from public.policies p
                             where p.account_id = a.id and p.deleted_at is null and p.status = 'active')
      ) order by a.deleted_at nulls first, a.created_at)
     from public.accounts a where a.id = any(g.entity_ids)) as members
  from public.duplicate_groups g
  where g.entity_type = 'accounts' and g.status = 'pending'
  order by g.match_score desc nulls last, g.created_at desc
  limit p_limit offset p_offset;
$function$;

grant execute on function public.list_duplicate_groups_for_review(integer, integer) to authenticated;

-- 4) Retire customer_identities (0 rows, 0 readers) --------------------------------
drop table if exists public.customer_identities cascade;
