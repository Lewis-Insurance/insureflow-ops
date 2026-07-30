-- Clear orphaned per-line coverage data when a policy's declared line changes.
--
-- BUG (Atlas Investment, policy MP0023006002172): a policy first created/extracted
-- as one ACORD line (General Liability -> cgl_details populated) and later re-typed
-- to another line (Commercial Auto) through the Edit Policy modal kept its original
-- detail blob on the row. master_coi_lines() treats every non-empty <line>_details
-- blob as an AUTHORITATIVE present line (its presence "proves" the line), so the
-- re-typed policy fed BOTH the old (GL) and new (Auto) sections of the ACORD 25,
-- showing up as two policy types on the certificate.
--
-- Root causes:
--   1. The edit flow (EditPolicyModal.handleSave / importer / manual) updates
--      line_of_business but never clears the outgoing line's detail blob.
--   2. master_coi_lines() unions all non-empty blobs before it ever consults
--      line_of_business, so a stale blob becomes a phantom line.
--
-- FIX (this migration): a BEFORE UPDATE trigger on policies clears the detail blob,
-- field-evidence, and coi_field_provenance entries for any line that no longer
-- belongs to the new declared line. This covers every write path in one place.
-- A one-time backfill repairs rows already in the bad state.
--
-- Conservative by design: the trigger acts only when the declared line actually
-- changes AND the new line maps to a KNOWN ACORD line set. For an unmapped line
-- (Bond, Cyber, Inland Marine, ...) it changes nothing, so we never destroy data on
-- lines whose canonical coverage set we cannot assert. Genuine multi-line declared
-- types (BOP -> gl+property) keep every blob they are allowed to carry.
--
-- Applied as a single migration (the apply mechanism wraps it in one transaction).

-- 1) Declared allowed-lines crosswalk. Mirrors branches 2 & 3 of master_coi_lines
--    (line_canonical labels take precedence over raw line_of_business matching).
--    Returns NULL for an unmapped/unknown declared line so callers stay conservative.
create or replace function public.coi_declared_lines(
  p_line_of_business text,
  p_line_canonical  text
) returns text[]
language sql
immutable
as $$
  select case
    when p_line_canonical = 'General Liability'            then array['gl']
    when p_line_canonical = 'Commercial Auto'              then array['auto']
    when p_line_canonical = 'Workers Compensation'         then array['wc']
    when p_line_canonical = 'Commercial Property'          then array['property']
    when p_line_canonical = 'Business Owners Policy (BOP)' then array['gl','property']
    when p_line_canonical in ('Personal Umbrella')         then array['umbrella']
    when lower(coalesce(p_line_of_business,'')) like '%work%comp%'        then array['wc']
    when lower(coalesce(p_line_of_business,'')) like '%umbrella%'
      or lower(coalesce(p_line_of_business,'')) like '%excess%'           then array['umbrella']
    when lower(coalesce(p_line_of_business,'')) like '%general%liab%'
      or lower(coalesce(p_line_of_business,'')) = 'gl'                    then array['gl']
    when lower(coalesce(p_line_of_business,'')) like '%commercial%auto%'
      or lower(coalesce(p_line_of_business,'')) like '%business%auto%'    then array['auto']
    when lower(coalesce(p_line_of_business,'')) like '%bop%'
      or lower(coalesce(p_line_of_business,'')) like '%business%owner%'   then array['gl','property']
    when lower(coalesce(p_line_of_business,'')) like '%commercial%prop%'  then array['property']
    else null
  end
$$;

-- 2) Remove every key of a jsonb object whose name starts with p_prefix.
--    Used to drop coi_field_provenance entries for a cleared blob (keys look like
--    'cgl_details.limits.each_occurrence'). Passing a prefix no key matches is a no-op.
create or replace function public.jsonb_strip_key_prefix(p_obj jsonb, p_prefix text)
returns jsonb
language sql
immutable
as $$
  select coalesce(
    (select jsonb_object_agg(k, v)
       from jsonb_each(coalesce(p_obj, '{}'::jsonb)) as e(k, v)
      where left(k, length(p_prefix)) <> p_prefix),
    '{}'::jsonb
  )
$$;

-- 3) Trigger function: clear blobs orphaned by a declared-line change.
create or replace function public.clear_orphaned_coverage_blobs()
returns trigger
language plpgsql
as $$
declare
  v_allowed text[];
  v_prov    jsonb;
  v_changed boolean := false;
begin
  -- Act only when the declared line actually changed.
  if new.line_of_business is not distinct from old.line_of_business
     and new.line_canonical is not distinct from old.line_canonical then
    return new;
  end if;

  v_allowed := public.coi_declared_lines(new.line_of_business, new.line_canonical);

  -- Unknown/unmapped new declared line: change nothing.
  if v_allowed is null then
    return new;
  end if;

  v_prov := coalesce(new.coi_field_provenance, '{}'::jsonb);

  if not ('gl' = any(v_allowed))
     and new.cgl_details is not null and new.cgl_details <> '{}'::jsonb then
    new.cgl_details        := '{}'::jsonb;
    new.cgl_field_evidence := '{}'::jsonb;
    v_prov := public.jsonb_strip_key_prefix(v_prov, 'cgl_details.');
    v_changed := true;
  end if;

  if not ('auto' = any(v_allowed))
     and new.bap_details is not null and new.bap_details <> '{}'::jsonb then
    new.bap_details        := '{}'::jsonb;
    new.bap_field_evidence := '{}'::jsonb;
    v_prov := public.jsonb_strip_key_prefix(v_prov, 'bap_details.');
    v_changed := true;
  end if;

  if not ('umbrella' = any(v_allowed))
     and new.umbrella_details is not null and new.umbrella_details <> '{}'::jsonb then
    new.umbrella_details        := '{}'::jsonb;
    new.umbrella_field_evidence := '{}'::jsonb;
    v_prov := public.jsonb_strip_key_prefix(v_prov, 'umbrella_details.');
    v_changed := true;
  end if;

  if not ('wc' = any(v_allowed))
     and new.wc_details is not null and new.wc_details <> '{}'::jsonb then
    new.wc_details        := '{}'::jsonb;
    new.wc_field_evidence := '{}'::jsonb;
    v_prov := public.jsonb_strip_key_prefix(v_prov, 'wc_details.');
    v_changed := true;
  end if;

  if not ('property' = any(v_allowed))
     and new.property_details is not null and new.property_details <> '{}'::jsonb then
    new.property_details        := '{}'::jsonb;
    new.property_field_evidence := '{}'::jsonb;
    v_prov := public.jsonb_strip_key_prefix(v_prov, 'property_details.');
    v_changed := true;
  end if;

  if v_changed then
    new.coi_field_provenance := v_prov;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_clear_orphaned_coverage_blobs on public.policies;
create trigger trg_clear_orphaned_coverage_blobs
  before update on public.policies
  for each row
  execute function public.clear_orphaned_coverage_blobs();

-- 4) One-time backfill: repair rows already carrying a blob that conflicts with
--    their declared line (e.g. the Atlas Commercial Auto policy still holding GL
--    data). Mirrors the trigger's per-line clearing exactly. '~~keep~~' is a
--    sentinel prefix no provenance key matches, so allowed lines are left intact.
update public.policies p set
  cgl_details             = case when not ('gl'       = any(d.allowed)) then '{}'::jsonb else p.cgl_details end,
  cgl_field_evidence      = case when not ('gl'       = any(d.allowed)) then '{}'::jsonb else p.cgl_field_evidence end,
  bap_details             = case when not ('auto'     = any(d.allowed)) then '{}'::jsonb else p.bap_details end,
  bap_field_evidence      = case when not ('auto'     = any(d.allowed)) then '{}'::jsonb else p.bap_field_evidence end,
  umbrella_details        = case when not ('umbrella' = any(d.allowed)) then '{}'::jsonb else p.umbrella_details end,
  umbrella_field_evidence = case when not ('umbrella' = any(d.allowed)) then '{}'::jsonb else p.umbrella_field_evidence end,
  wc_details              = case when not ('wc'       = any(d.allowed)) then '{}'::jsonb else p.wc_details end,
  wc_field_evidence       = case when not ('wc'       = any(d.allowed)) then '{}'::jsonb else p.wc_field_evidence end,
  property_details        = case when not ('property' = any(d.allowed)) then '{}'::jsonb else p.property_details end,
  property_field_evidence = case when not ('property' = any(d.allowed)) then '{}'::jsonb else p.property_field_evidence end,
  coi_field_provenance    = public.jsonb_strip_key_prefix(
                              public.jsonb_strip_key_prefix(
                                public.jsonb_strip_key_prefix(
                                  public.jsonb_strip_key_prefix(
                                    public.jsonb_strip_key_prefix(
                                      coalesce(p.coi_field_provenance, '{}'::jsonb),
                                      case when not ('gl'       = any(d.allowed)) then 'cgl_details.'      else '~~keep~~' end),
                                    case when not ('auto'     = any(d.allowed)) then 'bap_details.'      else '~~keep~~' end),
                                  case when not ('umbrella' = any(d.allowed)) then 'umbrella_details.' else '~~keep~~' end),
                                case when not ('wc'       = any(d.allowed)) then 'wc_details.'       else '~~keep~~' end),
                              case when not ('property' = any(d.allowed)) then 'property_details.' else '~~keep~~' end)
from (
  select id, public.coi_declared_lines(line_of_business, line_canonical) as allowed
  from public.policies
  where deleted_at is null
) d
where d.id = p.id
  and d.allowed is not null
  and (
       (not ('gl'       = any(d.allowed)) and p.cgl_details      is not null and p.cgl_details      <> '{}'::jsonb) or
       (not ('auto'     = any(d.allowed)) and p.bap_details      is not null and p.bap_details      <> '{}'::jsonb) or
       (not ('umbrella' = any(d.allowed)) and p.umbrella_details is not null and p.umbrella_details <> '{}'::jsonb) or
       (not ('wc'       = any(d.allowed)) and p.wc_details       is not null and p.wc_details       <> '{}'::jsonb) or
       (not ('property' = any(d.allowed)) and p.property_details is not null and p.property_details <> '{}'::jsonb)
  );
