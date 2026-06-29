-- Relationship Graph v2 / Sprint 1 — edge-type vocabulary.
--
-- Adds two edge types to the rel_type CHECK on BOTH account_relationships and
-- account_relationship_suggestions:
--   affiliated_business  - two commercial accounts linked by a shared owner/contact
--   dependent            - a household dependent (child, etc.) beyond spouse
-- and teaches get_account_relationships their display labels.
--
-- Widening a CHECK can never invalidate existing rows, so the DROP/ADD is safe.
-- Rollback SQL is at the bottom of this file (commented).

begin;

alter table public.account_relationships
  drop constraint if exists account_relationships_rel_type_check;
alter table public.account_relationships
  add constraint account_relationships_rel_type_check
  check (rel_type = any (array[
    'owns','household_member','spouse','parent_company','same_as','related',
    'affiliated_business','dependent']));

alter table public.account_relationship_suggestions
  drop constraint if exists account_relationship_suggestions_rel_type_check;
alter table public.account_relationship_suggestions
  add constraint account_relationship_suggestions_rel_type_check
  check (rel_type = any (array[
    'owns','household_member','spouse','parent_company','same_as','related',
    'affiliated_business','dependent']));

create or replace function public.get_account_relationships(p_account_id uuid)
 returns table(relationship_id uuid, direction text, rel_type text, display_label text, role text, is_primary boolean, source text, note text, other_account_id uuid, other_name text, other_goes_by text, other_type text, other_status text, other_policies_count integer, other_active_premium numeric, other_next_expiration date)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select
    r.id,
    case when r.from_account = p_account_id then 'outgoing' else 'incoming' end,
    r.rel_type,
    case r.rel_type
      when 'owns'                then case when r.from_account = p_account_id then 'Owner of' else 'Owned by' end
      when 'parent_company'      then case when r.from_account = p_account_id then 'Parent of' else 'Subsidiary of' end
      when 'affiliated_business' then 'Affiliated company'
      when 'spouse'              then 'Spouse'
      when 'household_member'    then 'Household'
      when 'dependent'           then 'Dependent'
      when 'same_as'             then 'Same as'
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

commit;

-- ROLLBACK (reverses this migration):
-- begin;
-- alter table public.account_relationships drop constraint if exists account_relationships_rel_type_check;
-- alter table public.account_relationships add constraint account_relationships_rel_type_check
--   check (rel_type = any (array['owns','household_member','spouse','parent_company','same_as','related']));
-- alter table public.account_relationship_suggestions drop constraint if exists account_relationship_suggestions_rel_type_check;
-- alter table public.account_relationship_suggestions add constraint account_relationship_suggestions_rel_type_check
--   check (rel_type = any (array['owns','household_member','spouse','parent_company','same_as','related']));
-- -- (restore the prior get_account_relationships label map without affiliated_business/dependent)
-- commit;
