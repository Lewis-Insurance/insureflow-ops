-- =============================================================================
-- Master COI Phase 3 (data layer) — Migration 4 of 5 (the RPC layer)
--
-- Spec: docs/COI Module/coi-module/02-master-coi-data-layer.md
--   §2.3  master_coi_lines(policies) -> text[]  (canonical line-key classifier)
--   §5.1  resolve_carrier(text)       (exact -> alias -> normalized carrier match)
--   §2.2/§2.4/§2.5/§2.6/§2.7  get_master_coi(uuid, uuid[])  (the single read model)
--   §5.2/§5.4  insurer name/NAIC precedence + the single insurer-letter algorithm
--   §3.4  save_master_coi_fields(uuid, jsonb)  (registry-whitelisted write path)
--   §4.5  set_line_ai_endorsement(...)  (three-state endorsement transitions)
--   §8.3  mark_master_coi_reviewed(uuid)  (account-level review stamp)
-- Plus: docs/COI Module/coi-module/07-supplemental-enhancements.md §6
--   get_master_coi emits the non-blocking `source_data_stale` warning per line.
-- And:  docs/COI Module/coi-module/01-disposition-and-roadmap.md R13
--   get_master_coi references NO certificates_of_insurance and has no 'legacy' src.
--
-- Depends on migrations 1 (20260702170000) and 2 (20260702171000): the endorsement
-- columns on the four AI/interest tables, policy_wc_subrogation_waivers,
-- policies.coi_field_provenance, policies.named_insured_dba, coi_field_registry
-- (29 seeded rows), account_coi_profiles. resolve_holder_endorsements ships
-- separately in migration 5 (20260702095000/renumbered) after the directory table.
--
-- Ground truth verified against live prod (lrqajzwcmdwahnjyidgv) 2026-07-02:
--   * None of these six functions exist yet.
--   * policies: carrier text NOT NULL, carrier_id/carrier_naic/named_insured/dba/
--     named_insured_dba nullable text (carrier_naic is character varying, text-compatible),
--     five <line>_details jsonb, line_of_business/line_canonical/line_category, status,
--     effective_date/expiration_date (both nullable), deleted_at, extraction_source/
--     extraction_confidence, coi_field_provenance jsonb NOT NULL default '{}'.
--   * ALL 2193 policies currently have empty/null <line>_details blobs (the book is
--     manual-empty on the extraction side until the §7 backfill runs), so EVERY jsonb
--     path read below is null-guarded and an absent blob still yields the full skeleton.
--   * AI/interest row columns: cgl/umbrella/property AIs use street/city/state/zip;
--     policy_bap_interests uses address_street/address_city/address_state/address_zip.
--     cgl carries effective_date/expiration_date; migration 1 adds effective_date/
--     expiration_date/endorsement_form to umbrella and endorsement_effective_date to
--     bap/property. All four gained endorsement_status/confirmed_at/confirmed_by/
--     additional_insured_id in migration 1.
--   * carriers(id,name,naic); cleanup.carrier_alias_map(carrier_name,raw_text);
--     normalize_entity_name(text), is_staff(), is_agency_member(uuid) all exist.
--   * accounts(name,address_line1,address_line2,city,state,zip_code,business_id,
--     agency_workspace_id,deleted_at); businesses(dba); agency_workspaces(name,phone,
--     email,address,website,settings jsonb,created_at); profiles.default_agency_workspace_id.
--   * canopy chain: canopy_business_operations(policy_id,description_of_operations,
--     created_at,updated_at) -> canopy_policies(pull_id) -> canopy_pulls(account_id,
--     completed_at,updated_at,created_at). No `pulled_at` column (use completed_at coalesce).
--
-- Idempotent: every function is CREATE OR REPLACE; grants are REVOKE-then-GRANT.
-- =============================================================================

-- =============================================================================
-- 1) master_coi_lines(policies) -> text[]   (§2.3)
--    A policy can feed more than one ACORD 25 row (a BOP feeds gl + property), so
--    classification returns a SET, not a scalar. Precedence:
--      1. detail-blob presence is authoritative (proves the extractor classified it),
--      2. line_canonical crosswalk labels,
--      3. raw line_of_business LIKE fallback,
--      4. else array['other'] (surfaced under lines.other[], never dropped).
-- =============================================================================
create or replace function public.master_coi_lines(p public.policies)
returns text[]           -- subset of {'gl','auto','umbrella','wc','property'}, or '{other}'
language sql
immutable
as $$
  select case
    -- 1) Detail blobs are authoritative: their presence proves the line. Treat an
    --    empty object '{}' as absent so manual-empty policies fall through to labels.
    when array_length(blob_lines, 1) is not null then blob_lines
    -- 2) line_canonical crosswalk labels
    when p.line_canonical = 'General Liability'             then array['gl']
    when p.line_canonical = 'Commercial Auto'               then array['auto']
    when p.line_canonical = 'Workers Compensation'          then array['wc']
    when p.line_canonical = 'Commercial Property'           then array['property']
    when p.line_canonical = 'Business Owners Policy (BOP)'  then array['gl','property']
    when p.line_canonical in ('Personal Umbrella')          then array['umbrella']
    -- 3) raw line_of_business fallback, mirroring is_workers_comp_policy
    when lower(coalesce(p.line_of_business,'')) like '%work%comp%'          then array['wc']
    when lower(coalesce(p.line_of_business,'')) like '%umbrella%'
      or lower(coalesce(p.line_of_business,'')) like '%excess%'             then array['umbrella']
    when lower(coalesce(p.line_of_business,'')) like '%general%liab%'
      or lower(coalesce(p.line_of_business,'')) = 'gl'                      then array['gl']
    when lower(coalesce(p.line_of_business,'')) like '%commercial%auto%'
      or lower(coalesce(p.line_of_business,'')) like '%business%auto%'      then array['auto']
    when lower(coalesce(p.line_of_business,'')) like '%bop%'
      or lower(coalesce(p.line_of_business,'')) like '%business%owner%'     then array['gl','property']
    when lower(coalesce(p.line_of_business,'')) like '%commercial%prop%'    then array['property']
    else array['other']
  end
  from (
    select array_remove(array[
      case when p.cgl_details      is not null and p.cgl_details      <> '{}'::jsonb then 'gl'       end,
      case when p.bap_details      is not null and p.bap_details      <> '{}'::jsonb then 'auto'     end,
      case when p.umbrella_details is not null and p.umbrella_details <> '{}'::jsonb then 'umbrella' end,
      case when p.wc_details       is not null and p.wc_details       <> '{}'::jsonb then 'wc'       end,
      case when p.property_details is not null and p.property_details <> '{}'::jsonb then 'property' end
    ], null) as blob_lines
  ) b;
$$;

revoke execute on function public.master_coi_lines(public.policies) from anon, public;
grant  execute on function public.master_coi_lines(public.policies) to authenticated, service_role;

-- =============================================================================
-- 2) resolve_carrier(text)   (§5.1, §5.2/§5.3)
--    exact lower(btrim()) name -> cleanup.carrier_alias_map exact raw_text ->
--    normalize_entity_name. SECURITY DEFINER because carrier_alias_map has RLS
--    enabled with no policies; the postgres-owned function bypasses it.
-- =============================================================================
create or replace function public.resolve_carrier(p_raw text)
returns table (carrier_id uuid, carrier_name text, naic text, match_type text)
language sql
stable
security definer
set search_path = public, cleanup
as $$
  with input as (select btrim(coalesce(p_raw, '')) as raw)
  select c.id, c.name, c.naic, m.match_type
  from (
    select c0.id, 'exact'::text as match_type, 1 as pri
      from public.carriers c0, input i
     where i.raw <> '' and lower(btrim(c0.name)) = lower(i.raw)
    union all
    select c1.id, 'alias', 2
      from cleanup.carrier_alias_map am
      join public.carriers c1 on lower(btrim(c1.name)) = lower(btrim(am.carrier_name)),
           input i
     where am.raw_text = i.raw
    union all
    select c2.id, 'normalized', 3
      from public.carriers c2, input i
     where i.raw <> ''
       and public.normalize_entity_name(c2.name) = public.normalize_entity_name(i.raw)
  ) m
  join public.carriers c on c.id = m.id
  order by m.pri
  limit 1;
$$;

revoke execute on function public.resolve_carrier(text) from anon, public;
grant  execute on function public.resolve_carrier(text) to authenticated;

-- =============================================================================
-- 3) coi_jsonb_set_deep(target, path, value)   (§3.4 step 2c helper)
--    jsonb_set does NOT create missing intermediate parents; a write to
--    cgl_details.limits.each_occurrence on a null/empty blob would silently no-op.
--    This helper walks the path and coalesces each level to '{}' so every parent
--    exists before the leaf is set. Pure/immutable; not user-callable directly.
-- =============================================================================
create or replace function public.coi_jsonb_set_deep(
  p_target jsonb,
  p_path   text[],
  p_value  jsonb
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_doc  jsonb := coalesce(p_target, '{}'::jsonb);
  v_i    int;
  v_prefix text[];
begin
  if array_length(p_path, 1) is null then
    return v_doc;
  end if;
  -- Ensure every intermediate parent object exists (all but the last path element).
  -- Walk shallow-to-deep; where a parent is missing or is not an object, coalesce it
  -- to '{}' before descending further.
  for v_i in 1 .. (array_length(p_path, 1) - 1) loop
    v_prefix := p_path[1:v_i];
    if jsonb_typeof(v_doc #> v_prefix) is distinct from 'object' then
      v_doc := jsonb_set(v_doc, v_prefix, '{}'::jsonb, true);
    end if;
  end loop;
  -- Now the leaf parent is guaranteed to exist; set the leaf (create_missing = true).
  return jsonb_set(v_doc, p_path, coalesce(p_value, 'null'::jsonb), true);
end $$;

revoke execute on function public.coi_jsonb_set_deep(jsonb, text[], jsonb) from anon, public;
grant  execute on function public.coi_jsonb_set_deep(jsonb, text[], jsonb) to authenticated, service_role;

-- =============================================================================
-- 4) save_master_coi_fields(uuid, jsonb)   (§3.4)
--    The ONLY write path for editable COI scalars. Registry-whitelisted, type-
--    validated, ledger-recording. Never raw client jsonb_set. Returns
--    {policy_id, updated:[path...], rejected:[{path,reason}...]}.
--
--    Column storage handles FOUR text columns now (a registry row was added for
--    named_insured_dba per the 2026-07-02 directive): carrier_naic, named_insured,
--    dba, named_insured_dba. All addressed via a CASE, NO dynamic SQL on user input.
-- =============================================================================
create or replace function public.save_master_coi_fields(
  p_policy_id uuid,
  p_updates   jsonb    -- flat object: {"<registry path>": <value>, ...}; value null clears the field
)
returns jsonb          -- {"policy_id": uuid, "updated": ["path", ...], "rejected": [{"path": "...", "reason": "..."}]}
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_policy       public.policies%rowtype;
  v_key          text;
  v_raw          jsonb;      -- the incoming value as jsonb (may be jsonb 'null')
  v_reg          public.coi_field_registry%rowtype;
  v_updated      text[]  := array[]::text[];
  v_rejected     jsonb   := '[]'::jsonb;
  v_num          numeric;
  v_txt          text;
  -- accumulate blob mutations in-memory, then a single UPDATE at the end
  v_cgl          jsonb;
  v_bap          jsonb;
  v_umb          jsonb;
  v_wc           jsonb;
  v_prop         jsonb;
  v_naic         text;
  v_named        text;
  v_dba          text;
  v_named_dba    text;
  v_ledger       jsonb;
  v_touched_cgl  boolean := false;
  v_touched_bap  boolean := false;
  v_touched_umb  boolean := false;
  v_touched_wc   boolean := false;
  v_touched_prop boolean := false;
  v_touched_cols boolean := false;
  v_blob_col     text;
  v_in_path      text[];
  v_old_leaf     jsonb;
  v_new_leaf     jsonb;
begin
  -- 1) Gate + lock the row (atomic read-modify-write of blobs).
  if not public.is_staff() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  select * into v_policy
  from public.policies
  where id = p_policy_id and deleted_at is null
  for update;
  if not found then
    raise exception 'policy % not found or deleted', p_policy_id using errcode = 'P0002';
  end if;

  if p_updates is null or jsonb_typeof(p_updates) is distinct from 'object' then
    raise exception 'p_updates must be a json object' using errcode = '22023';
  end if;

  -- Seed working copies of every mutable slot from the locked row.
  v_cgl       := v_policy.cgl_details;
  v_bap       := v_policy.bap_details;
  v_umb       := v_policy.umbrella_details;
  v_wc        := v_policy.wc_details;
  v_prop      := v_policy.property_details;
  v_naic      := v_policy.carrier_naic;
  v_named     := v_policy.named_insured;
  v_dba       := v_policy.dba;
  v_named_dba := v_policy.named_insured_dba;
  v_ledger    := coalesce(v_policy.coi_field_provenance, '{}'::jsonb);

  -- 2) Iterate every requested field.
  for v_key, v_raw in select * from jsonb_each(p_updates)
  loop
    -- 2a) Whitelist lookup.
    select * into v_reg from public.coi_field_registry where path = v_key;
    if not found then
      v_rejected := v_rejected || jsonb_build_object('path', v_key, 'reason', 'unknown_path');
      continue;
    end if;

    -- 2b) Validate by value_type. A jsonb 'null' clears the field and is always allowed.
    if v_raw is null or jsonb_typeof(v_raw) = 'null' then
      v_new_leaf := 'null'::jsonb;
    else
      if v_reg.value_type = 'money' then
        if jsonb_typeof(v_raw) <> 'number' then
          v_rejected := v_rejected || jsonb_build_object('path', v_key, 'reason', 'invalid_value'); continue;
        end if;
        v_num := (v_raw #>> '{}')::numeric;
        if v_num < 0 then
          v_rejected := v_rejected || jsonb_build_object('path', v_key, 'reason', 'invalid_value'); continue;
        end if;
        v_new_leaf := to_jsonb(v_num);
      elsif v_reg.value_type = 'enum' then
        if jsonb_typeof(v_raw) <> 'string'
           or (v_raw #>> '{}') <> all (coalesce(v_reg.enum_values, array[]::text[])) then
          v_rejected := v_rejected || jsonb_build_object('path', v_key, 'reason', 'invalid_value'); continue;
        end if;
        v_new_leaf := to_jsonb(v_raw #>> '{}');
      elsif v_reg.value_type = 'date' then
        if jsonb_typeof(v_raw) <> 'string' then
          v_rejected := v_rejected || jsonb_build_object('path', v_key, 'reason', 'invalid_value'); continue;
        end if;
        begin
          perform (v_raw #>> '{}')::date;
        exception when others then
          v_rejected := v_rejected || jsonb_build_object('path', v_key, 'reason', 'invalid_value'); continue;
        end;
        v_new_leaf := to_jsonb(v_raw #>> '{}');
      elsif v_reg.value_type = 'boolean' then
        if jsonb_typeof(v_raw) <> 'boolean' then
          v_rejected := v_rejected || jsonb_build_object('path', v_key, 'reason', 'invalid_value'); continue;
        end if;
        v_new_leaf := v_raw;
      else  -- text
        if jsonb_typeof(v_raw) <> 'string' then
          v_rejected := v_rejected || jsonb_build_object('path', v_key, 'reason', 'invalid_value'); continue;
        end if;
        v_txt := v_raw #>> '{}';
        if char_length(v_txt) > 2000 then
          v_rejected := v_rejected || jsonb_build_object('path', v_key, 'reason', 'invalid_value'); continue;
        end if;
        v_new_leaf := to_jsonb(v_txt);
      end if;
    end if;

    -- 2c) Apply the write.
    if v_reg.storage = 'column' then
      -- FOUR known text columns, addressed via CASE (no dynamic SQL on user input).
      v_txt := case when jsonb_typeof(v_new_leaf) = 'null' then null else v_new_leaf #>> '{}' end;
      if v_key = 'carrier_naic' then
        v_old_leaf := case when v_naic is null then 'null'::jsonb else to_jsonb(v_naic) end;
        v_naic := v_txt;
      elsif v_key = 'named_insured' then
        v_old_leaf := case when v_named is null then 'null'::jsonb else to_jsonb(v_named) end;
        v_named := v_txt;
      elsif v_key = 'dba' then
        v_old_leaf := case when v_dba is null then 'null'::jsonb else to_jsonb(v_dba) end;
        v_dba := v_txt;
      elsif v_key = 'named_insured_dba' then
        v_old_leaf := case when v_named_dba is null then 'null'::jsonb else to_jsonb(v_named_dba) end;
        v_named_dba := v_txt;
      else
        -- registry says column but path is unrecognized here: reject defensively.
        v_rejected := v_rejected || jsonb_build_object('path', v_key, 'reason', 'unknown_path');
        continue;
      end if;
      v_touched_cols := true;
    else
      -- jsonb: first path segment is the blob column, remainder is the in-blob path.
      v_blob_col := split_part(v_key, '.', 1);
      v_in_path  := (string_to_array(v_key, '.'))[2:];
      if array_length(v_in_path, 1) is null then
        v_rejected := v_rejected || jsonb_build_object('path', v_key, 'reason', 'unknown_path');
        continue;
      end if;
      if v_blob_col = 'cgl_details' then
        v_old_leaf := coalesce(v_cgl #> v_in_path, 'null'::jsonb);
        v_cgl := public.coi_jsonb_set_deep(v_cgl, v_in_path, v_new_leaf); v_touched_cgl := true;
      elsif v_blob_col = 'bap_details' then
        v_old_leaf := coalesce(v_bap #> v_in_path, 'null'::jsonb);
        v_bap := public.coi_jsonb_set_deep(v_bap, v_in_path, v_new_leaf); v_touched_bap := true;
      elsif v_blob_col = 'umbrella_details' then
        v_old_leaf := coalesce(v_umb #> v_in_path, 'null'::jsonb);
        v_umb := public.coi_jsonb_set_deep(v_umb, v_in_path, v_new_leaf); v_touched_umb := true;
      elsif v_blob_col = 'wc_details' then
        v_old_leaf := coalesce(v_wc #> v_in_path, 'null'::jsonb);
        v_wc := public.coi_jsonb_set_deep(v_wc, v_in_path, v_new_leaf); v_touched_wc := true;
      elsif v_blob_col = 'property_details' then
        v_old_leaf := coalesce(v_prop #> v_in_path, 'null'::jsonb);
        v_prop := public.coi_jsonb_set_deep(v_prop, v_in_path, v_new_leaf); v_touched_prop := true;
      else
        v_rejected := v_rejected || jsonb_build_object('path', v_key, 'reason', 'unknown_path');
        continue;
      end if;
    end if;

    -- 2d) Ledger: record val (to_jsonb form so get_master_coi's equality compare matches),
    --      prev, who, when. A deliberate blank records {"val": null, ...} (still 'manual').
    v_ledger := jsonb_set(
      v_ledger,
      array[v_key],
      jsonb_build_object(
        'val', v_new_leaf,
        'prev', v_old_leaf,
        'updated_by', to_jsonb(auth.uid()),
        'updated_at', to_jsonb(now())
      ),
      true
    );
    v_updated := v_updated || v_key;
  end loop;

  -- 3) When a jsonb write created a blob from scratch (was null/empty, now populated),
  --    stamp its extraction_source sub-key to 'manual' — ONLY on first creation, never
  --    stomping 'azure_di_claude'/'ai_extracted' on extraction-rich policies.
  if v_touched_cgl and (v_policy.cgl_details is null or v_policy.cgl_details = '{}'::jsonb)
     and not (v_cgl ? 'extraction_source') then
    v_cgl := jsonb_set(v_cgl, array['extraction_source'], to_jsonb('manual'::text), true);
  end if;
  if v_touched_bap and (v_policy.bap_details is null or v_policy.bap_details = '{}'::jsonb)
     and not (v_bap ? 'extraction_source') then
    v_bap := jsonb_set(v_bap, array['extraction_source'], to_jsonb('manual'::text), true);
  end if;
  if v_touched_umb and (v_policy.umbrella_details is null or v_policy.umbrella_details = '{}'::jsonb)
     and not (v_umb ? 'extraction_source') then
    v_umb := jsonb_set(v_umb, array['extraction_source'], to_jsonb('manual'::text), true);
  end if;
  if v_touched_wc and (v_policy.wc_details is null or v_policy.wc_details = '{}'::jsonb)
     and not (v_wc ? 'extraction_source') then
    v_wc := jsonb_set(v_wc, array['extraction_source'], to_jsonb('manual'::text), true);
  end if;
  if v_touched_prop and (v_policy.property_details is null or v_policy.property_details = '{}'::jsonb)
     and not (v_prop ? 'extraction_source') then
    v_prop := jsonb_set(v_prop, array['extraction_source'], to_jsonb('manual'::text), true);
  end if;

  -- 4) Single UPDATE accumulating every mutation. Skip entirely if nothing applied.
  if array_length(v_updated, 1) is not null then
    update public.policies
       set cgl_details          = case when v_touched_cgl  then v_cgl  else cgl_details      end,
           bap_details          = case when v_touched_bap  then v_bap  else bap_details      end,
           umbrella_details     = case when v_touched_umb  then v_umb  else umbrella_details end,
           wc_details           = case when v_touched_wc   then v_wc   else wc_details       end,
           property_details     = case when v_touched_prop then v_prop else property_details end,
           carrier_naic         = case when v_touched_cols then v_naic      else carrier_naic      end,
           named_insured        = case when v_touched_cols then v_named     else named_insured     end,
           dba                  = case when v_touched_cols then v_dba       else dba              end,
           named_insured_dba    = case when v_touched_cols then v_named_dba else named_insured_dba end,
           coi_field_provenance = v_ledger
     where id = p_policy_id;
  end if;

  return jsonb_build_object(
    'policy_id', p_policy_id,
    'updated',   to_jsonb(v_updated),
    'rejected',  v_rejected
  );
end $$;

revoke execute on function public.save_master_coi_fields(uuid, jsonb) from anon, public;
grant  execute on function public.save_master_coi_fields(uuid, jsonb) to authenticated;

-- =============================================================================
-- 5) set_line_ai_endorsement(...)   (§4.5)
--    The single attributable transition for endorsement_status across all five
--    tables. Row creation and name/address/ai_type edits stay on the existing
--    direct-table paths; only the legal-assertion status field is RPC-gated.
--
--    'endorsed' requires evidence: a form param, an existing form on the row, or
--    the row being document-extracted (extraction_status = 'AUTO_APPLIED'). WC
--    waivers have no extraction_status, so only the form-based evidence applies there.
--    gl/umbrella carry an effective_date column; auto/property/wc use
--    endorsement_effective_date.
-- =============================================================================
create or replace function public.set_line_ai_endorsement(
  p_line   text,     -- 'gl' | 'umbrella' | 'auto' | 'property' | 'wc'
  p_row_id uuid,     -- PK in the line's table
  p_status text,     -- 'none' | 'requested' | 'endorsed'
  p_endorsement_form text default null,
  p_endorsement_effective_date date default null
)
returns jsonb        -- the updated row as jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row       jsonb;
  v_has_form  boolean;
  v_auto_app  boolean;
  v_is_ai     boolean;
  v_confirmed boolean;
begin
  -- 1) Gate.
  if not public.is_staff() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  if p_line not in ('gl','umbrella','auto','property','wc') then
    raise exception 'invalid line %', p_line using errcode = '22023';
  end if;
  if p_status not in ('none','requested','endorsed') then
    raise exception 'invalid status %', p_status using errcode = '22023';
  end if;

  v_confirmed := (p_status = 'endorsed');

  -- 2) Dispatch to the row's table. Each branch: validate AI-scope + evidence, then
  --    UPDATE and return the row as jsonb. RLS on each table still applies to the
  --    staff caller (SECURITY DEFINER runs as owner, but the is_staff() gate above
  --    plus the per-table policies bound this to legitimate staff writes).
  if p_line = 'gl' then
    select (r.endorsement_form is not null),
           (r.extraction_status = 'AUTO_APPLIED')
      into v_has_form, v_auto_app
    from public.policy_cgl_additional_insureds r where r.id = p_row_id;
    if not found then raise exception 'row % not found on gl', p_row_id using errcode = 'P0002'; end if;
    if p_status = 'endorsed' and not (p_endorsement_form is not null or v_has_form or v_auto_app) then
      raise exception 'endorsed status requires an endorsement form reference' using errcode = '22023';
    end if;
    update public.policy_cgl_additional_insureds
       set endorsement_status       = p_status,
           endorsement_form         = coalesce(p_endorsement_form, endorsement_form),
           effective_date           = coalesce(p_endorsement_effective_date, effective_date),
           endorsement_confirmed_at = case when v_confirmed then now() else null end,
           endorsement_confirmed_by = case when v_confirmed then auth.uid() else null end
     where id = p_row_id
     returning to_jsonb(policy_cgl_additional_insureds.*) into v_row;

  elsif p_line = 'umbrella' then
    select (r.endorsement_form is not null),
           (r.extraction_status = 'AUTO_APPLIED')
      into v_has_form, v_auto_app
    from public.policy_umbrella_additional_insureds r where r.id = p_row_id;
    if not found then raise exception 'row % not found on umbrella', p_row_id using errcode = 'P0002'; end if;
    if p_status = 'endorsed' and not (p_endorsement_form is not null or v_has_form or v_auto_app) then
      raise exception 'endorsed status requires an endorsement form reference' using errcode = '22023';
    end if;
    update public.policy_umbrella_additional_insureds
       set endorsement_status       = p_status,
           endorsement_form         = coalesce(p_endorsement_form, endorsement_form),
           effective_date           = coalesce(p_endorsement_effective_date, effective_date),
           endorsement_confirmed_at = case when v_confirmed then now() else null end,
           endorsement_confirmed_by = case when v_confirmed then auth.uid() else null end
     where id = p_row_id
     returning to_jsonb(policy_umbrella_additional_insureds.*) into v_row;

  elsif p_line = 'auto' then
    select (r.interest_type = 'additional_insured'),
           (r.endorsement_form is not null),
           (r.extraction_status = 'AUTO_APPLIED')
      into v_is_ai, v_has_form, v_auto_app
    from public.policy_bap_interests r where r.id = p_row_id;
    if not found then raise exception 'row % not found on auto', p_row_id using errcode = 'P0002'; end if;
    if not v_is_ai then
      raise exception 'row % is not an additional_insured interest', p_row_id using errcode = '22023';
    end if;
    if p_status = 'endorsed' and not (p_endorsement_form is not null or v_has_form or v_auto_app) then
      raise exception 'endorsed status requires an endorsement form reference' using errcode = '22023';
    end if;
    update public.policy_bap_interests
       set endorsement_status         = p_status,
           endorsement_form           = coalesce(p_endorsement_form, endorsement_form),
           endorsement_effective_date = coalesce(p_endorsement_effective_date, endorsement_effective_date),
           endorsement_confirmed_at   = case when v_confirmed then now() else null end,
           endorsement_confirmed_by   = case when v_confirmed then auth.uid() else null end
     where id = p_row_id
     returning to_jsonb(policy_bap_interests.*) into v_row;

  elsif p_line = 'property' then
    select (r.interest_type = 'additional_insured'),
           (r.endorsement_form is not null),
           (r.extraction_status = 'AUTO_APPLIED')
      into v_is_ai, v_has_form, v_auto_app
    from public.policy_property_interests r where r.id = p_row_id;
    if not found then raise exception 'row % not found on property', p_row_id using errcode = 'P0002'; end if;
    if not v_is_ai then
      raise exception 'row % is not an additional_insured interest', p_row_id using errcode = '22023';
    end if;
    if p_status = 'endorsed' and not (p_endorsement_form is not null or v_has_form or v_auto_app) then
      raise exception 'endorsed status requires an endorsement form reference' using errcode = '22023';
    end if;
    update public.policy_property_interests
       set endorsement_status         = p_status,
           endorsement_form           = coalesce(p_endorsement_form, endorsement_form),
           endorsement_effective_date = coalesce(p_endorsement_effective_date, endorsement_effective_date),
           endorsement_confirmed_at   = case when v_confirmed then now() else null end,
           endorsement_confirmed_by   = case when v_confirmed then auth.uid() else null end
     where id = p_row_id
     returning to_jsonb(policy_property_interests.*) into v_row;

  else  -- wc: policy_wc_subrogation_waivers (no interest_type, no extraction_status)
    select (r.endorsement_form is not null)
      into v_has_form
    from public.policy_wc_subrogation_waivers r where r.id = p_row_id;
    if not found then raise exception 'row % not found on wc', p_row_id using errcode = 'P0002'; end if;
    if p_status = 'endorsed' and not (p_endorsement_form is not null or v_has_form) then
      raise exception 'endorsed status requires an endorsement form reference' using errcode = '22023';
    end if;
    update public.policy_wc_subrogation_waivers
       set endorsement_status         = p_status,
           endorsement_form           = coalesce(p_endorsement_form, endorsement_form),
           endorsement_effective_date = coalesce(p_endorsement_effective_date, endorsement_effective_date),
           endorsement_confirmed_at   = case when v_confirmed then now() else null end,
           endorsement_confirmed_by   = case when v_confirmed then auth.uid() else null end
     where id = p_row_id
     returning to_jsonb(policy_wc_subrogation_waivers.*) into v_row;
  end if;

  return v_row;
end $$;

revoke execute on function public.set_line_ai_endorsement(text, uuid, text, text, date) from anon, public;
grant  execute on function public.set_line_ai_endorsement(text, uuid, text, text, date) to authenticated;

-- =============================================================================
-- 6) mark_master_coi_reviewed(uuid)   (§8.3)
--    Upsert the account-level review stamp. The trigger on account_coi_profiles
--    derives agency_workspace_id server-side on insert; the client value is ignored.
-- =============================================================================
create or replace function public.mark_master_coi_reviewed(p_account_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_at  timestamptz := now();
begin
  if not public.is_staff() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
  if not exists (select 1 from public.accounts a where a.id = p_account_id and a.deleted_at is null) then
    raise exception 'account % not found', p_account_id using errcode = 'P0002';
  end if;

  insert into public.account_coi_profiles (account_id, last_reviewed_at, last_reviewed_by)
  values (p_account_id, v_at, v_uid)
  on conflict (account_id) do update
    set last_reviewed_at = excluded.last_reviewed_at,
        last_reviewed_by = excluded.last_reviewed_by;

  return jsonb_build_object(
    'account_id', p_account_id,
    'last_reviewed_at', v_at,
    'last_reviewed_by', v_uid
  );
end $$;

revoke execute on function public.mark_master_coi_reviewed(uuid) from anon, public;
grant  execute on function public.mark_master_coi_reviewed(uuid) to authenticated;

-- =============================================================================
-- 7) Cell builders for get_master_coi (§2.5 cell shape + §3.3 provenance)
--
-- coi_fixed_cell: a cell whose provenance is known and fixed by mapping
--   (account / workspace / reference / a derived read-only value). src is passed
--   in; path is the registry write path or null (null = not editable here).
--   v null with a non-missing src still reports that src except when caller asks
--   for auto-missing: callers pass src='missing' explicitly when v is null.
-- =============================================================================
create or replace function public.coi_fixed_cell(
  p_value jsonb,
  p_src   text,
  p_path  text default null,
  p_conf  numeric default null
)
returns jsonb
language sql
immutable
as $$
  -- The caller always passes the correct src, including 'missing' when the value
  -- is null (a null account/workspace/reference slot is reported by the caller as
  -- src='missing' per the §2.6 examples). src is therefore p_src verbatim.
  select jsonb_build_object(
    'v',          case when p_value is null or jsonb_typeof(p_value) = 'null' then null else p_value end,
    'src',        p_src,
    'path',       p_path,
    'conf',       p_conf,
    'updated_at', null,
    'updated_by', null,
    'flag',       null
  );
$$;

-- coi_provenanced_cell: the §3.3 resolution for an editable value that may be
--   manual (ledger) or extracted (blob). Deterministic order:
--     1. ledger entry exists AND ledger.val == current value -> 'manual' + who/when
--     2. ledger entry exists AND differs -> 'extracted' + flag 'overwritten_manual'
--     3. no ledger, value non-null, extraction-attributed -> 'extracted' + conf
--     4. no ledger, value non-null -> 'manual' (null who/when)
--     5. value null/absent -> 'missing'
--   p_value is the current value at the path as jsonb ('null'::jsonb when absent).
--   p_extraction_attributed: blob extraction_source in the extracted set OR the
--     in-blob path present in <line>_field_evidence (computed by the caller).
-- =============================================================================
create or replace function public.coi_provenanced_cell(
  p_value                 jsonb,
  p_path                  text,
  p_ledger                jsonb,
  p_extraction_attributed boolean,
  p_conf                  numeric default null
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_has_val   boolean := (p_value is not null and jsonb_typeof(p_value) <> 'null');
  v_led       jsonb   := case when p_ledger is not null and p_path is not null
                              then p_ledger -> p_path else null end;
  v_led_val   jsonb;
  v_src       text;
  v_flag      text := null;
  v_up_at     jsonb := null;
  v_up_by     jsonb := null;
  v_conf      numeric := null;
begin
  if v_led is not null then
    v_led_val := coalesce(v_led -> 'val', 'null'::jsonb);
    -- Compare ledger.val to the current path value the SAME way it was written
    -- (to_jsonb form). A cleared field records {"val": null} and reads back manual/null.
    if v_led_val is not distinct from coalesce(p_value, 'null'::jsonb) then
      v_src   := 'manual';
      v_up_at := v_led -> 'updated_at';
      v_up_by := v_led -> 'updated_by';
    else
      -- An extractor re-ran after the manual edit and overwrote it.
      v_src  := 'extracted';
      v_flag := 'overwritten_manual';
      if p_extraction_attributed then v_conf := p_conf; end if;
    end if;
  elsif v_has_val and p_extraction_attributed then
    v_src  := 'extracted';
    v_conf := p_conf;
  elsif v_has_val then
    v_src := 'manual';   -- unattributed human entry (PolicyManualDetailsModal, imports)
  else
    v_src := 'missing';
  end if;

  return jsonb_build_object(
    'v',          case when v_has_val then p_value else null end,
    'src',        v_src,
    'path',       p_path,
    'conf',       v_conf,
    'updated_at', v_up_at,
    'updated_by', v_up_by,
    'flag',       v_flag
  );
end $$;

revoke execute on function public.coi_fixed_cell(jsonb, text, text, numeric) from anon, public;
grant  execute on function public.coi_fixed_cell(jsonb, text, text, numeric) to authenticated, service_role;
revoke execute on function public.coi_provenanced_cell(jsonb, text, jsonb, boolean, numeric) from anon, public;
grant  execute on function public.coi_provenanced_cell(jsonb, text, jsonb, boolean, numeric) to authenticated, service_role;


-- =============================================================================
-- 8) coi_build_line(uuid, text)   (§2.5 / §2.6 per-line cell assembly)
--    Reads ONE policy and returns the full per-line jsonb object EXCEPT
--    insurer_letter and candidates (the caller injects those, since candidates
--    are computed across the line's whole candidate set and the letter comes from
--    the cross-policy letter algorithm). Every blob path is null-guarded; an
--    absent/empty blob yields all-'missing' coverage cells (EMPTY-BLOB TOLERANCE).
--
--    Extraction attribution per editable cell: the owning blob's extraction_source
--    is in ('ai_extracted','azure_di_claude') OR the in-blob dotted path is a key
--    in the flat <line>_field_evidence map (extract-*-policy write a flat dotted map).
--    conf = policies.extraction_confidence.
-- =============================================================================
create or replace function public.coi_build_line(p_policy_id uuid, p_line text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p           public.policies%rowtype;
  v_blob      jsonb;
  v_ev        jsonb;
  v_ledger    jsonb;
  v_conf      numeric;
  v_extracted boolean;     -- blob-level extraction attribution
  v_present   boolean;
  v_expired   boolean;
  v_obj       jsonb;
  v_ais       jsonb := '[]'::jsonb;
  -- helper closures are not available; per-cell attribution is inlined via
  -- coi_provenanced_cell(value, path, ledger, attributed, conf).
begin
  select * into p from public.policies where id = p_policy_id;
  if not found then
    return null;
  end if;

  v_ledger := coalesce(p.coi_field_provenance, '{}'::jsonb);
  v_conf   := p.extraction_confidence;
  v_expired := (p.expiration_date is not null and p.expiration_date < current_date);

  -- Select blob + evidence + blob-level extraction flag for this line.
  if p_line = 'gl' then
    v_blob := p.cgl_details; v_ev := p.cgl_field_evidence;
  elsif p_line = 'auto' then
    v_blob := p.bap_details; v_ev := p.bap_field_evidence;
  elsif p_line = 'umbrella' then
    v_blob := p.umbrella_details; v_ev := p.umbrella_field_evidence;
  elsif p_line = 'wc' then
    v_blob := p.wc_details; v_ev := p.wc_field_evidence;
  elsif p_line = 'property' then
    v_blob := p.property_details; v_ev := p.property_field_evidence;
  else
    return null;
  end if;
  v_blob := coalesce(v_blob, '{}'::jsonb);
  v_ev   := coalesce(v_ev, '{}'::jsonb);
  v_present := true;   -- the caller only calls this for a selected (present) policy
  -- Blob-level extraction attribution: the blob's own extraction_source, else the
  -- policy's extraction_source column, in the extracted set.
  v_extracted := coalesce(v_blob ->> 'extraction_source', p.extraction_source) in ('ai_extracted','azure_di_claude');

  -- Core cells common to every line. policy_number/effective/expiration are typed
  -- columns edited via EditPolicyModal, NOT save_master_coi_fields, so path=null and
  -- provenance is unattributed 'manual' when present (per §2.6 examples).
  v_obj := jsonb_build_object(
    'present',         v_present,
    'policy_id',       to_jsonb(p.id),
    'status',          to_jsonb(p.status),
    'expired',         to_jsonb(v_expired),
    'policy_number',   public.coi_fixed_cell(to_jsonb(p.policy_number), case when p.policy_number is not null then 'manual' else 'missing' end, null),
    'effective_date',  public.coi_fixed_cell(to_jsonb(p.effective_date),  case when p.effective_date is not null then 'manual' else 'missing' end, null),
    'expiration_date', public.coi_fixed_cell(to_jsonb(p.expiration_date), case when p.expiration_date is not null then 'manual' else 'missing' end, null)
  );

  -- Line-specific coverage cells (all via coi_provenanced_cell on the registry path).
  if p_line = 'gl' then
    v_obj := v_obj
      || jsonb_build_object(
        'occurrence_or_claims_made', public.coi_provenanced_cell(coalesce(v_blob #> '{coverage_options,policy_form}','null'::jsonb),
              'cgl_details.coverage_options.policy_form', v_ledger, v_extracted or (v_ev ? 'coverage_options.policy_form'), v_conf),
        'aggregate_applies_per', public.coi_provenanced_cell(coalesce(v_blob #> '{limits,aggregate_applies_per}','null'::jsonb),
              'cgl_details.limits.aggregate_applies_per', v_ledger, v_extracted or (v_ev ? 'limits.aggregate_applies_per'), v_conf),
        'limits', jsonb_build_object(
          'each_occurrence', public.coi_provenanced_cell(coalesce(v_blob #> '{limits,each_occurrence}','null'::jsonb),
              'cgl_details.limits.each_occurrence', v_ledger, v_extracted or (v_ev ? 'limits.each_occurrence'), v_conf),
          'damage_to_rented_premises', public.coi_provenanced_cell(coalesce(v_blob #> '{limits,damage_to_rented_premises}','null'::jsonb),
              'cgl_details.limits.damage_to_rented_premises', v_ledger, v_extracted or (v_ev ? 'limits.damage_to_rented_premises'), v_conf),
          'medical_expense', public.coi_provenanced_cell(coalesce(v_blob #> '{limits,medical_expense}','null'::jsonb),
              'cgl_details.limits.medical_expense', v_ledger, v_extracted or (v_ev ? 'limits.medical_expense'), v_conf),
          'personal_advertising_injury', public.coi_provenanced_cell(coalesce(v_blob #> '{limits,personal_advertising_injury}','null'::jsonb),
              'cgl_details.limits.personal_advertising_injury', v_ledger, v_extracted or (v_ev ? 'limits.personal_advertising_injury'), v_conf),
          'general_aggregate', public.coi_provenanced_cell(coalesce(v_blob #> '{limits,general_aggregate}','null'::jsonb),
              'cgl_details.limits.general_aggregate', v_ledger, v_extracted or (v_ev ? 'limits.general_aggregate'), v_conf),
          'products_completed_ops_aggregate', public.coi_provenanced_cell(coalesce(v_blob #> '{limits,products_completed_ops_aggregate}','null'::jsonb),
              'cgl_details.limits.products_completed_ops_aggregate', v_ledger, v_extracted or (v_ev ? 'limits.products_completed_ops_aggregate'), v_conf)
        )
      );
    -- GL additional insureds: policy_cgl_additional_insureds rows (§2.6 row shape).
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'name', r.name, 'additional_insured_id', r.additional_insured_id,
        'ai_type', r.ai_type, 'primary_noncontributory', r.primary_noncontributory,
        'waiver_of_subrogation', r.waiver_of_subrogation,
        'endorsement_status', r.endorsement_status, 'endorsement_form', r.endorsement_form,
        'effective_date', r.effective_date, 'expiration_date', r.expiration_date,
        'endorsement_confirmed_at', r.endorsement_confirmed_at,
        'endorsement_confirmed_by', r.endorsement_confirmed_by
      ) order by r.created_at, r.id), '[]'::jsonb)
      into v_ais
      from public.policy_cgl_additional_insureds r where r.policy_id = p_policy_id;

  elsif p_line = 'auto' then
    v_obj := v_obj
      || jsonb_build_object(
        'limit_type', public.coi_provenanced_cell(coalesce(v_blob #> '{coverage,liability,limit_type}','null'::jsonb),
              'bap_details.coverage.liability.limit_type', v_ledger, v_extracted or (v_ev ? 'coverage.liability.limit_type'), v_conf),
        'csl', public.coi_provenanced_cell(coalesce(v_blob #> '{coverage,liability,csl_limit}','null'::jsonb),
              'bap_details.coverage.liability.csl_limit', v_ledger, v_extracted or (v_ev ? 'coverage.liability.csl_limit'), v_conf),
        'bi_per_person', public.coi_provenanced_cell(coalesce(v_blob #> '{coverage,liability,bodily_injury_per_person}','null'::jsonb),
              'bap_details.coverage.liability.bodily_injury_per_person', v_ledger, v_extracted or (v_ev ? 'coverage.liability.bodily_injury_per_person'), v_conf),
        'bi_per_accident', public.coi_provenanced_cell(coalesce(v_blob #> '{coverage,liability,bodily_injury_per_accident}','null'::jsonb),
              'bap_details.coverage.liability.bodily_injury_per_accident', v_ledger, v_extracted or (v_ev ? 'coverage.liability.bodily_injury_per_accident'), v_conf),
        'pd_per_accident', public.coi_provenanced_cell(coalesce(v_blob #> '{coverage,liability,property_damage}','null'::jsonb),
              'bap_details.coverage.liability.property_damage', v_ledger, v_extracted or (v_ev ? 'coverage.liability.property_damage'), v_conf),
        'checkboxes', jsonb_build_object(
          'any_auto',        public.coi_fixed_cell(coalesce(v_blob #> '{coverage,symbols,any_auto}','null'::jsonb),        case when (v_blob #> '{coverage,symbols,any_auto}') is not null and v_extracted then 'extracted' else 'missing' end, null, v_conf),
          'owned_autos',     public.coi_fixed_cell(coalesce(v_blob #> '{coverage,symbols,owned_autos}','null'::jsonb),     case when (v_blob #> '{coverage,symbols,owned_autos}') is not null and v_extracted then 'extracted' else 'missing' end, null, v_conf),
          'scheduled_autos', public.coi_fixed_cell(coalesce(v_blob #> '{coverage,symbols,scheduled_autos}','null'::jsonb), case when (v_blob #> '{coverage,symbols,scheduled_autos}') is not null and v_extracted then 'extracted' else 'missing' end, null, v_conf),
          'hired_autos',     public.coi_fixed_cell(coalesce(v_blob #> '{coverage,symbols,hired_autos}','null'::jsonb),     case when (v_blob #> '{coverage,symbols,hired_autos}') is not null and v_extracted then 'extracted' else 'missing' end, null, v_conf),
          'non_owned_autos', public.coi_fixed_cell(coalesce(v_blob #> '{coverage,symbols,non_owned_autos}','null'::jsonb), case when (v_blob #> '{coverage,symbols,non_owned_autos}') is not null and v_extracted then 'extracted' else 'missing' end, null, v_conf)
        )
      );
    -- Auto AIs: policy_bap_interests where interest_type='additional_insured'.
    --   Address columns are address_street/address_city/address_state/address_zip.
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'name', r.name, 'additional_insured_id', r.additional_insured_id,
        'blanket', r.blanket, 'waiver_of_subrogation', r.waiver_of_subrogation,
        'primary_noncontributory', r.primary_noncontributory,
        'endorsement_status', r.endorsement_status, 'endorsement_form', r.endorsement_form,
        'endorsement_effective_date', r.endorsement_effective_date,
        'endorsement_confirmed_at', r.endorsement_confirmed_at,
        'endorsement_confirmed_by', r.endorsement_confirmed_by
      ) order by r.created_at, r.id), '[]'::jsonb)
      into v_ais
      from public.policy_bap_interests r
      where r.policy_id = p_policy_id and r.interest_type = 'additional_insured';

  elsif p_line = 'umbrella' then
    v_obj := v_obj
      || jsonb_build_object(
        'umbrella_or_excess', public.coi_provenanced_cell(coalesce(v_blob #> '{policy_type}','null'::jsonb),
              'umbrella_details.policy_type', v_ledger, v_extracted or (v_ev ? 'policy_type'), v_conf),
        'occurrence_or_claims_made', public.coi_provenanced_cell(coalesce(v_blob #> '{coi_summary,occurrence_or_claims_made}','null'::jsonb),
              'umbrella_details.coi_summary.occurrence_or_claims_made', v_ledger, v_extracted or (v_ev ? 'coi_summary.occurrence_or_claims_made'), v_conf),
        'each_occurrence', public.coi_provenanced_cell(coalesce(v_blob #> '{limits,per_occurrence}','null'::jsonb),
              'umbrella_details.limits.per_occurrence', v_ledger, v_extracted or (v_ev ? 'limits.per_occurrence'), v_conf),
        'aggregate', public.coi_provenanced_cell(coalesce(v_blob #> '{limits,aggregate}','null'::jsonb),
              'umbrella_details.limits.aggregate', v_ledger, v_extracted or (v_ev ? 'limits.aggregate'), v_conf),
        'ded_or_retention', jsonb_build_object(
          'kind', public.coi_provenanced_cell(coalesce(v_blob #> '{coi_summary,ded_or_retention_kind}','null'::jsonb),
              'umbrella_details.coi_summary.ded_or_retention_kind', v_ledger, v_extracted or (v_ev ? 'coi_summary.ded_or_retention_kind'), v_conf),
          'amount', public.coi_provenanced_cell(coalesce(v_blob #> '{retention,amount}','null'::jsonb),
              'umbrella_details.retention.amount', v_ledger, v_extracted or (v_ev ? 'retention.amount'), v_conf)
        )
      );
    -- Umbrella AIs: policy_umbrella_additional_insureds (same row shape as gl).
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'name', r.name, 'additional_insured_id', r.additional_insured_id,
        'ai_type', r.ai_type, 'primary_noncontributory', r.primary_noncontributory,
        'waiver_of_subrogation', r.waiver_of_subrogation,
        'endorsement_status', r.endorsement_status, 'endorsement_form', r.endorsement_form,
        'effective_date', r.effective_date, 'expiration_date', r.expiration_date,
        'endorsement_confirmed_at', r.endorsement_confirmed_at,
        'endorsement_confirmed_by', r.endorsement_confirmed_by
      ) order by r.created_at, r.id), '[]'::jsonb)
      into v_ais
      from public.policy_umbrella_additional_insureds r where r.policy_id = p_policy_id;

  elsif p_line = 'wc' then
    -- proprietor_excluded is derived from policy_wc_officers.is_included via a SCALAR
    -- subquery (no aggregate-over-FROM): NOT bool_or(is_included) when officer rows
    -- exist, else missing. per_statute derives from wc_details.coverage.part_one_wc.
    v_obj := v_obj
      || jsonb_build_object(
        'per_statute', public.coi_fixed_cell(
              case when (v_blob #>> '{coverage,part_one_wc}') is not null
                   then to_jsonb((v_blob #>> '{coverage,part_one_wc}') = 'statutory') else 'null'::jsonb end,
              case when (v_blob #>> '{coverage,part_one_wc}') is not null and v_extracted then 'extracted' else 'missing' end, null, v_conf),
        'el_each_accident', public.coi_provenanced_cell(coalesce(v_blob #> '{coverage,part_two_employers_liability,each_accident}','null'::jsonb),
              'wc_details.coverage.part_two_employers_liability.each_accident', v_ledger, v_extracted or (v_ev ? 'coverage.part_two_employers_liability.each_accident'), v_conf),
        'el_disease_each_employee', public.coi_provenanced_cell(coalesce(v_blob #> '{coverage,part_two_employers_liability,disease_each_employee}','null'::jsonb),
              'wc_details.coverage.part_two_employers_liability.disease_each_employee', v_ledger, v_extracted or (v_ev ? 'coverage.part_two_employers_liability.disease_each_employee'), v_conf),
        'el_disease_policy_limit', public.coi_provenanced_cell(coalesce(v_blob #> '{coverage,part_two_employers_liability,disease_policy_limit}','null'::jsonb),
              'wc_details.coverage.part_two_employers_liability.disease_policy_limit', v_ledger, v_extracted or (v_ev ? 'coverage.part_two_employers_liability.disease_policy_limit'), v_conf),
        'proprietor_excluded', public.coi_fixed_cell(
              (select case when count(*) = 0 then 'null'::jsonb
                           else to_jsonb(not bool_or(coalesce(o.is_included, false))) end
                 from public.policy_wc_officers o where o.policy_id = p_policy_id),
              (select case when exists (select 1 from public.policy_wc_officers o2 where o2.policy_id = p_policy_id)
                           then 'extracted' else 'missing' end), null)
      );
    -- WC subrogation waivers: policy_wc_subrogation_waivers rows (§2.6, §4.3).
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'waiver_scope', r.waiver_scope, 'name', r.name,
        'additional_insured_id', r.additional_insured_id,
        'endorsement_status', r.endorsement_status, 'endorsement_form', r.endorsement_form,
        'endorsement_effective_date', r.endorsement_effective_date,
        'endorsement_confirmed_at', r.endorsement_confirmed_at,
        'endorsement_confirmed_by', r.endorsement_confirmed_by
      ) order by r.created_at, r.id), '[]'::jsonb)
      into v_ais
      from public.policy_wc_subrogation_waivers r where r.policy_id = p_policy_id;
    v_obj := v_obj || jsonb_build_object('subrogation_waivers', v_ais);
    v_ais := '[]'::jsonb;   -- WC uses subrogation_waivers, not additional_insureds

  else  -- property
    v_obj := v_obj
      || jsonb_build_object(
        'label', public.coi_provenanced_cell(coalesce(v_blob #> '{coi_summary,label}','null'::jsonb),
              'property_details.coi_summary.label', v_ledger, v_extracted or (v_ev ? 'coi_summary.label'), v_conf),
        'limit_amount', public.coi_provenanced_cell(coalesce(v_blob #> '{coi_summary,limit_amount}','null'::jsonb),
              'property_details.coi_summary.limit_amount', v_ledger, v_extracted or (v_ev ? 'coi_summary.limit_amount'), v_conf),
        'limit_description', public.coi_provenanced_cell(coalesce(v_blob #> '{coi_summary,limit_description}','null'::jsonb),
              'property_details.coi_summary.limit_description', v_ledger, v_extracted or (v_ev ? 'coi_summary.limit_description'), v_conf)
      );
    -- Property AIs: policy_property_interests where interest_type='additional_insured'.
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'name', r.name, 'additional_insured_id', r.additional_insured_id,
        'blanket', r.blanket, 'waiver_of_subrogation', r.waiver_of_subrogation,
        'primary_noncontributory', r.primary_noncontributory,
        'endorsement_status', r.endorsement_status, 'endorsement_form', r.endorsement_form,
        'endorsement_effective_date', r.endorsement_effective_date,
        'endorsement_confirmed_at', r.endorsement_confirmed_at,
        'endorsement_confirmed_by', r.endorsement_confirmed_by
      ) order by r.created_at, r.id), '[]'::jsonb)
      into v_ais
      from public.policy_property_interests r
      where r.policy_id = p_policy_id and r.interest_type = 'additional_insured';
  end if;

  -- WC already attached subrogation_waivers; every other line attaches additional_insureds.
  if p_line <> 'wc' then
    v_obj := v_obj || jsonb_build_object('additional_insureds', v_ais);
  end if;

  return v_obj;
end $$;

revoke execute on function public.coi_build_line(uuid, text) from anon, public;
grant  execute on function public.coi_build_line(uuid, text) to authenticated, service_role;

-- =============================================================================
-- 9) get_master_coi(uuid, uuid[])   (§2.2 / §2.4 / §2.5 / §2.6 / §2.7 / §5 / 07 §6)
--
-- The single read model. Assembles the whole ACORD 25 picture into ONE self-
-- contained JSONB document (snapshot-ready). SECURITY DEFINER; staff or service_role.
--
-- R13 (01-disposition-and-roadmap.md): NO reference to certificates_of_insurance
-- anywhere in this body; the src closed set has six values with NO 'legacy'.
--
-- EMPTY-BLOB TOLERANCE: the whole book is currently manual-empty; coi_build_line
-- null-guards every jsonb read and absent lines still emit the full skeleton with
-- present:false and 'missing' cells.
--
-- INSURER LETTERS (§5.4) are assigned by the SINGLE algorithm implemented here in
-- SQL: canonical line order gl,auto,umbrella,wc,property (other excluded from the
-- insurer table), then policy_number asc nulls last, then id asc; group by
-- carrier_id when present else 'name:'||normalize_entity_name(display_name);
-- NAIC-conflict split within a name group (>=2 distinct non-null NAICs -> each NAIC
-- its own group + a null-NAIC bucket; <=1 distinct non-null NAIC -> null merges in);
-- a BOP feeding gl+property groups by carrier so it takes ONE letter; A..F to the
-- first six groups by first-appearance rank; 7th+ -> insurer_overflow[] + the
-- insurer_overflow blocker.
--
-- source_data_stale (07 §6): per line, emitted when EVERY load-bearing cell (that
-- line's required_for_ready registry paths) resolves src='extracted' AND the newest
-- extraction/Canopy-pull timestamp for the selected policy is older than 90 days.
-- =============================================================================
-- VOLATILITY NOTE: §2.2 declares this function `stable`. It is declared `volatile`
-- here because the assembly uses CREATE TEMPORARY TABLE ... ON COMMIT DROP for the
-- per-line selection/letter working sets, and Postgres forbids CREATE/DROP TABLE
-- inside a STABLE or IMMUTABLE function ("DROP TABLE is not allowed in a non-volatile
-- function"). The function remains a pure read of committed data with no persistent
-- side effects (the temp tables are per-call scratch, dropped at commit); VOLATILE is
-- a strict superset of STABLE for planning, and no caller relies on STABLE semantics
-- (React Query and generate-certificate both want a fresh read per call). This is the
-- only deviation from the §2.2 signature and it is forced by the temp-table approach.
create or replace function public.get_master_coi(
  p_account_id uuid,
  p_policy_ids uuid[] default null   -- null = auto-select per line (§2.4); else exact set
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, cleanup, extensions
as $$
declare
  c_stale_days constant int := 90;          -- 07 §6 named staleness constant (adjustable)
  c_expiring_soon_days constant int := 30;   -- §2.7 the only date warning window

  v_account          public.accounts%rowtype;
  v_ws_id            uuid;
  v_ws               public.agency_workspaces%rowtype;
  v_producer         jsonb;
  v_dba              text;
  v_named_insured    jsonb;

  v_insurers         jsonb := '[]'::jsonb;
  v_insurer_overflow jsonb := '[]'::jsonb;
  v_lines            jsonb := '{}'::jsonb;
  v_other            jsonb := '[]'::jsonb;
  v_blockers         jsonb := '[]'::jsonb;
  v_warnings         jsonb := '[]'::jsonb;

  v_ops              jsonb;
  v_ops_text         text;
  v_ops_source       text;
  v_ops_prefill      jsonb := '[]'::jsonb;
  v_review           jsonb;
  v_last_reviewed    timestamptz;
  v_last_reviewed_by uuid;
  v_prof_updated     timestamptz;
  v_max_touch        timestamptz;
  v_stale_review     boolean;

  v_letter_map       jsonb := '{}'::jsonb;   -- group_key -> letter (A..F)
  v_selected_ids     uuid[] := array[]::uuid[];   -- all selected-line policy ids (deduped)
  v_ni_mismatch      boolean := false;
  v_rec              record;
  v_line             text;
  v_line_obj         jsonb;
  v_sel_policy_id    uuid;
  v_letter           text;
begin
  -- -------------------------------------------------------------------------
  -- 0) Gate + p_policy_ids validation (§2.2).
  -- -------------------------------------------------------------------------
  if auth.role() is distinct from 'service_role' and not public.is_staff() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  select * into v_account from public.accounts
  where id = p_account_id and deleted_at is null;
  if not found then
    raise exception 'account % not found', p_account_id using errcode = 'P0002';
  end if;

  if p_policy_ids is not null then
    if exists (
      select 1 from unnest(p_policy_ids) pid
      left join public.policies p
             on p.id = pid and p.account_id = p_account_id and p.deleted_at is null
      where p.id is null
    ) then
      raise exception 'policy list contains ids not belonging to account % (or deleted)', p_account_id
        using errcode = '22023';
    end if;
  end if;

  -- -------------------------------------------------------------------------
  -- 1) Workspace + producer block (§6).
  -- -------------------------------------------------------------------------
  v_ws_id := coalesce(
    v_account.agency_workspace_id,
    (select pr.default_agency_workspace_id from public.profiles pr where pr.id = auth.uid()),
    (select id from public.agency_workspaces order by created_at limit 1)
  );
  select * into v_ws from public.agency_workspaces where id = v_ws_id;

  v_producer := (
    with s as (select coalesce(v_ws.settings -> 'coi_producer', '{}'::jsonb) as cp)
    select jsonb_build_object(
      'name',           public.coi_fixed_cell(to_jsonb(coalesce(s.cp ->> 'producer_name', v_ws.name)),
                          case when coalesce(s.cp ->> 'producer_name', v_ws.name) is not null then 'workspace' else 'missing' end),
      'contact_name',   public.coi_fixed_cell(to_jsonb(s.cp ->> 'contact_name'),
                          case when nullif(s.cp ->> 'contact_name','') is not null then 'workspace' else 'missing' end),
      'phone',          public.coi_fixed_cell(to_jsonb(coalesce(s.cp ->> 'phone', v_ws.phone)),
                          case when coalesce(s.cp ->> 'phone', v_ws.phone) is not null then 'workspace' else 'missing' end),
      'fax',            public.coi_fixed_cell(to_jsonb(s.cp ->> 'fax'),
                          case when nullif(s.cp ->> 'fax','') is not null then 'workspace' else 'missing' end),
      'email',          public.coi_fixed_cell(to_jsonb(coalesce(s.cp ->> 'email', v_ws.email)),
                          case when coalesce(s.cp ->> 'email', v_ws.email) is not null then 'workspace' else 'missing' end),
      'address_line1',  public.coi_fixed_cell(to_jsonb(coalesce(s.cp ->> 'address_line1', v_ws.address)),
                          case when coalesce(s.cp ->> 'address_line1', v_ws.address) is not null then 'workspace' else 'missing' end),
      'address_line2',  public.coi_fixed_cell(to_jsonb(s.cp ->> 'address_line2'),
                          case when nullif(s.cp ->> 'address_line2','') is not null then 'workspace' else 'missing' end),
      'city',           public.coi_fixed_cell(to_jsonb(s.cp ->> 'city'),
                          case when nullif(s.cp ->> 'city','') is not null then 'workspace' else 'missing' end),
      'state',          public.coi_fixed_cell(to_jsonb(s.cp ->> 'state'),
                          case when nullif(s.cp ->> 'state','') is not null then 'workspace' else 'missing' end),
      'zip',            public.coi_fixed_cell(to_jsonb(s.cp ->> 'zip'),
                          case when nullif(s.cp ->> 'zip','') is not null then 'workspace' else 'missing' end),
      'license_number', public.coi_fixed_cell(to_jsonb(s.cp ->> 'license_number'),
                          case when nullif(s.cp ->> 'license_number','') is not null then 'workspace' else 'missing' end)
    )
    from s
  );

  if coalesce((v_producer #>> '{name,v}'), '') = '' or coalesce((v_producer #>> '{phone,v}'), '') = '' then
    v_warnings := v_warnings || jsonb_build_object('code','producer_incomplete',
      'message','Producer name or phone is missing');
  end if;

  -- -------------------------------------------------------------------------
  -- 2) Named insured block (§2.6). accounts base + businesses.dba via business_id.
  -- -------------------------------------------------------------------------
  select b.dba into v_dba from public.businesses b where b.id = v_account.business_id;

  v_named_insured := jsonb_build_object(
    'name',          public.coi_fixed_cell(to_jsonb(v_account.name),          case when v_account.name is not null then 'account' else 'missing' end),
    'dba',           public.coi_fixed_cell(to_jsonb(v_dba),                   case when v_dba is not null then 'account' else 'missing' end),
    'address_line1', public.coi_fixed_cell(to_jsonb(v_account.address_line1), case when v_account.address_line1 is not null then 'account' else 'missing' end),
    'address_line2', public.coi_fixed_cell(to_jsonb(v_account.address_line2), case when v_account.address_line2 is not null then 'account' else 'missing' end),
    'city',          public.coi_fixed_cell(to_jsonb(v_account.city),          case when v_account.city is not null then 'account' else 'missing' end),
    'state',         public.coi_fixed_cell(to_jsonb(v_account.state),         case when v_account.state is not null then 'account' else 'missing' end),
    'zip',           public.coi_fixed_cell(to_jsonb(v_account.zip_code),      case when v_account.zip_code is not null then 'account' else 'missing' end),
    'policy_named_insured_mismatch', to_jsonb(false)   -- overwritten below if a selected policy disagrees
  );

  -- -------------------------------------------------------------------------
  -- 3) Candidate + selection + insurer resolution + letter groups, in ONE pass.
  --    Materialized into a TEMP table (ON COMMIT DROP) so the per-line loop and the
  --    readiness pass can both read it. Named uniquely-per-call is unnecessary: the
  --    function runs to completion within one statement's snapshot; if generate-cert
  --    calls twice in one txn, the second create replaces cleanly after drop.
  -- -------------------------------------------------------------------------
  drop table if exists _mc_sel;
  create temporary table _mc_sel on commit drop as
  with expanded as (
    -- Every (line, policy) candidate among the 5 canonical lines. When p_policy_ids
    -- is given, restrict candidates to that set (each matches on every line it feeds).
    select
      ln.line,
      p.id as policy_id,
      p.status,
      p.policy_number,
      p.carrier,
      p.carrier_id,
      p.carrier_naic,
      p.effective_date,
      p.expiration_date,
      p.created_at,
      p.updated_at,
      (p.expiration_date is not null and p.expiration_date < current_date) as expired,
      -- extraction identity from the line's blob (carrier_name/carrier_naic) for §5.2
      case ln.line
        when 'gl'       then p.cgl_details
        when 'auto'     then p.bap_details
        when 'umbrella' then p.umbrella_details
        when 'wc'       then p.wc_details
        when 'property' then p.property_details
      end as blob
    from public.policies p
    cross join lateral unnest(public.master_coi_lines(p)) as ln(line)
    where p.account_id = p_account_id
      and p.deleted_at is null
      and ln.line = any(array['gl','auto','umbrella','wc','property'])
      and (p_policy_ids is null or p.id = any(p_policy_ids))
  ),
  ranked as (
    -- §2.4 selection order: active first, latest expiration (nulls last), latest created.
    select e.*,
      row_number() over (
        partition by e.line
        order by (e.status = 'active') desc,
                 e.expiration_date desc nulls last,
                 e.created_at desc
      ) as sel_rank
    from expanded e
  ),
  selected as (
    -- When p_policy_ids is given every candidate is selected (§2.4); else rank 1 only.
    select r.*
    from ranked r
    where (p_policy_ids is not null) or r.sel_rank = 1
  ),
  resolved as (
    -- Carrier resolution + §5.2 name/NAIC precedence per selected (line,policy).
    select
      s.*,
      rc.carrier_id  as rc_carrier_id,
      rc.carrier_name as rc_name,
      rc.naic        as rc_naic,
      rc.match_type  as rc_match_type,
      cc.name        as cid_name,
      cc.naic        as cid_naic
    from selected s
    left join lateral public.resolve_carrier(s.carrier) rc on true
    left join public.carriers cc on cc.id = s.carrier_id
  ),
  identified as (
    select
      r.*,
      -- display name precedence: blob identity.carrier_name -> policies.carrier -> carriers.name
      coalesce(
        nullif(r.blob #>> '{identity,carrier_name}', ''),
        nullif(r.carrier, ''),
        r.cid_name,
        r.rc_name
      ) as display_name,
      case
        when nullif(r.blob #>> '{identity,carrier_name}','') is not null then 'extracted'
        when nullif(r.carrier,'') is not null then 'manual'
        else 'reference'
      end as name_src,
      -- NAIC precedence: policies.carrier_naic -> blob identity.carrier_naic -> carriers.naic
      coalesce(
        nullif(r.carrier_naic, ''),
        nullif(r.blob #>> '{identity,carrier_naic}', ''),
        r.cid_naic,
        r.rc_naic
      ) as naic,
      case
        when nullif(r.carrier_naic,'') is not null then 'manual'
        when nullif(r.blob #>> '{identity,carrier_naic}','') is not null then 'extracted'
        when coalesce(r.cid_naic, r.rc_naic) is not null then 'reference'
        else 'missing'
      end as naic_src,
      -- naic mismatch flag: typed carrier_naic and extracted identity.carrier_naic both present and differ
      (nullif(r.carrier_naic,'') is not null
        and nullif(r.blob #>> '{identity,carrier_naic}','') is not null
        and nullif(r.carrier_naic,'') <> nullif(r.blob #>> '{identity,carrier_naic}','')) as naic_mismatch,
      -- resolution label for the insurer object
      case
        when r.carrier_id is not null then 'carrier_id'
        when r.rc_match_type is not null then r.rc_match_type
        else 'unresolved'
      end as resolution,
      -- carrier grouping id (carrier_id when present else null; letter split uses name+naic below)
      r.carrier_id as grp_carrier_id
    from resolved r
  ),
  keyed as (
    -- §5.4 group key part 1: carrier_id when present; else name-normalized. The NAIC
    -- split is applied in `grouped` using the per-name-group distinct-NAIC count below.
    select i.*,
      case when i.grp_carrier_id is not null
           then 'cid:' || i.grp_carrier_id::text
           else 'name:' || public.normalize_entity_name(coalesce(i.display_name,'')) end as name_key
    from identified i
  ),
  naic_counts as (
    -- Distinct non-null NAICs per name_key, computed with a real GROUP BY (Postgres
    -- forbids DISTINCT inside a window function, so this cannot be an OVER() count).
    select k.name_key, count(distinct k.naic) filter (where k.naic is not null) as distinct_naics_in_name
    from keyed k
    group by k.name_key
  ),
  grouped as (
    -- Final group key. For name-keyed rows with >=2 distinct non-null NAICs, split by
    -- NAIC (each distinct NAIC + a null-NAIC bucket). carrier_id groups are never split.
    select k.*,
      nc.distinct_naics_in_name,
      case
        when k.grp_carrier_id is not null then k.name_key
        when nc.distinct_naics_in_name >= 2 then k.name_key || '|naic:' || coalesce(k.naic, '_null_')
        else k.name_key
      end as group_key,
      -- canonical line order index for first-appearance ranking
      case k.line when 'gl' then 1 when 'auto' then 2 when 'umbrella' then 3
                  when 'wc' then 4 when 'property' then 5 else 6 end as line_ord
    from keyed k
    join naic_counts nc on nc.name_key = k.name_key
  ),
  with_group_order as (
    -- Per group, its first-appearance sort key = the minimal (line_ord, policy_number
    -- nulls-last-sentinel, policy_id) across the group's selected rows. Computed as a
    -- window min over a zero-padded composite text key so a single ordered comparison
    -- captures "canonical line order, then policy_number asc nulls last, then id asc".
    select g.*,
      min(
        lpad(g.line_ord::text, 2, '0')
        || '|' || coalesce(g.policy_number, chr(255))   -- chr(255) sorts after normal text -> nulls last
        || '|' || g.policy_id::text
      ) over (partition by g.group_key) as group_sort_key
    from grouped g
  )
  select
    w.line, w.policy_id, w.status, w.policy_number, w.expired,
    w.expiration_date, w.created_at, w.updated_at,
    w.display_name, w.name_src, w.naic, w.naic_src, w.naic_mismatch,
    w.resolution, w.grp_carrier_id, w.group_key, w.line_ord,
    -- first-appearance rank of each distinct group across the canonical iteration
    dense_rank() over (order by w.group_sort_key) as group_rank,
    (w.status = 'active') as is_active
  from with_group_order w;

  -- ALL candidates per line (not just the selected one) for the §2.4 candidates[]
  -- lists. Carrier resolution is unnecessary here, so this stays cheap.
  drop table if exists _mc_cand;
  create temporary table _mc_cand on commit drop as
  select
    ln.line,
    p.id as policy_id,
    p.status,
    p.policy_number,
    p.created_at,
    p.expiration_date,
    (p.expiration_date is not null and p.expiration_date < current_date) as expired
  from public.policies p
  cross join lateral unnest(public.master_coi_lines(p)) as ln(line)
  where p.account_id = p_account_id
    and p.deleted_at is null
    and ln.line = any(array['gl','auto','umbrella','wc','property'])
    and (p_policy_ids is null or p.id = any(p_policy_ids));

  -- -------------------------------------------------------------------------
  -- 4) Letter map + insurers[] + insurer_overflow[] (§5.4). One group == one letter.
  --    Groups with rank 1..6 -> A..F; rank >= 7 -> overflow (blocker).
  -- -------------------------------------------------------------------------
  select coalesce(jsonb_object_agg(gk.group_key, chr(64 + gk.group_rank::int)), '{}'::jsonb)
    into v_letter_map
  from (select distinct group_key, group_rank from _mc_sel where group_rank <= 6) gk;

  -- insurers A..F: one object per group (rank<=6), aggregating the group's lines + policy_ids.
  select coalesce(jsonb_agg(ins order by ins->>'letter'), '[]'::jsonb)
    into v_insurers
  from (
    select jsonb_build_object(
      'letter', chr(64 + s.group_rank::int),
      'name', public.coi_fixed_cell(to_jsonb(max(s.display_name)),
                case when max(s.display_name) is not null then max(s.name_src) else 'missing' end),
      'naic', public.coi_fixed_cell(to_jsonb(max(s.naic)),
                case when max(s.naic) is not null then max(s.naic_src) else 'missing' end,
                case when bool_or(s.naic_src = 'manual') then 'carrier_naic' else null end),
      -- grp_carrier_id is constant within a group; pick one (no max(uuid) in Postgres).
      'carrier_id', to_jsonb((array_agg(s.grp_carrier_id))[1]),
      'resolution', max(s.resolution),
      -- DISTINCT first (subquery), then aggregate in canonical line order. A single
      -- `jsonb_agg(distinct .. order by <case>)` is illegal (ORDER BY expr must be in
      -- the arg list when DISTINCT is present), hence the two-step.
      'lines', (select coalesce(jsonb_agg(dl.line order by dl.ord), '[]'::jsonb)
                from (select distinct sl.line,
                             case sl.line when 'gl' then 1 when 'auto' then 2 when 'umbrella' then 3
                                          when 'wc' then 4 when 'property' then 5 else 6 end as ord
                      from _mc_sel sl where sl.group_key = s.group_key) dl),
      'policy_ids', (select coalesce(jsonb_agg(distinct sp.policy_id), '[]'::jsonb)
                     from _mc_sel sp where sp.group_key = s.group_key)
    ) as ins
    from _mc_sel s
    where s.group_rank <= 6
    group by s.group_key, s.group_rank
  ) x;

  -- insurer_overflow[]: same shape minus letter, for the 7th+ distinct group.
  select coalesce(jsonb_agg(ovf order by ovf->>'name'), '[]'::jsonb)
    into v_insurer_overflow
  from (
    select jsonb_build_object(
      'name', public.coi_fixed_cell(to_jsonb(max(s.display_name)),
                case when max(s.display_name) is not null then max(s.name_src) else 'missing' end),
      'naic', public.coi_fixed_cell(to_jsonb(max(s.naic)),
                case when max(s.naic) is not null then max(s.naic_src) else 'missing' end),
      -- grp_carrier_id is constant within a group; pick one (no max(uuid) in Postgres).
      'carrier_id', to_jsonb((array_agg(s.grp_carrier_id))[1]),
      'resolution', max(s.resolution),
      'lines', (select coalesce(jsonb_agg(distinct sl.line), '[]'::jsonb) from _mc_sel sl where sl.group_key = s.group_key),
      'policy_ids', (select coalesce(jsonb_agg(distinct sp.policy_id), '[]'::jsonb) from _mc_sel sp where sp.group_key = s.group_key)
    ) as ovf
    from _mc_sel s
    where s.group_rank >= 7
    group by s.group_key
  ) y;

  if jsonb_array_length(v_insurer_overflow) > 0 then
    v_blockers := v_blockers || jsonb_build_object(
      'code','insurer_overflow',
      'message','More than six distinct insurers across the selected lines. ACORD 25 has six insurer rows; deselect a line or issue two certificates');
  end if;

  -- collect selected policy ids (deduped) for the review-staleness scan
  select coalesce(array_agg(distinct policy_id), array[]::uuid[]) into v_selected_ids from _mc_sel;

  -- -------------------------------------------------------------------------
  -- 5) Per-line objects (§2.6). For each canonical line: the selected policy (if any)
  --    -> coi_build_line + insurer_letter + candidates; else the full absent skeleton.
  --    Readiness blockers/warnings are accumulated here per selected line (§2.7).
  -- -------------------------------------------------------------------------
  foreach v_line in array array['gl','auto','umbrella','wc','property']
  loop
    -- The selected policy for this line (sel_rank=1 in ranked; here: the row for this
    -- line in _mc_sel with the best selection order). When p_policy_ids is passed there
    -- may be several selected on one line; pick the same canonical winner for the line
    -- header cells, but candidates lists them all.
    select s.* into v_rec
    from _mc_sel s
    where s.line = v_line
    order by (s.status = 'active') desc, s.expiration_date desc nulls last, s.created_at desc
    limit 1;

    if not found then
      -- absent line skeleton (present:false, missing cells). Shape mirrors coi_build_line
      -- for a line with no policy: the caller-side minimal skeleton.
      v_line_obj := jsonb_build_object(
        'present', false,
        'policy_id', null,
        'insurer_letter', null,
        'status', null,
        'expired', false,
        'policy_number',   public.coi_fixed_cell('null'::jsonb, 'missing', null),
        'effective_date',  public.coi_fixed_cell('null'::jsonb, 'missing', null),
        'expiration_date', public.coi_fixed_cell('null'::jsonb, 'missing', null),
        'candidates', '[]'::jsonb
      );
      -- attach an empty additional_insureds / subrogation_waivers per line kind so the
      -- panel grid is stable.
      if v_line = 'wc' then
        v_line_obj := v_line_obj || jsonb_build_object('subrogation_waivers', '[]'::jsonb);
      else
        v_line_obj := v_line_obj || jsonb_build_object('additional_insureds', '[]'::jsonb);
      end if;
      v_lines := v_lines || jsonb_build_object(v_line, v_line_obj);
      continue;
    end if;

    v_sel_policy_id := v_rec.policy_id;
    v_letter := v_letter_map ->> v_rec.group_key;   -- null if this group overflowed

    -- Build the coverage object for the selected policy, then inject letter + candidates.
    v_line_obj := public.coi_build_line(v_sel_policy_id, v_line);
    v_line_obj := v_line_obj
      || jsonb_build_object('insurer_letter', to_jsonb(v_letter))
      || jsonb_build_object('candidates', (
            select coalesce(jsonb_agg(jsonb_build_object(
                     'policy_id', c.policy_id,
                     'policy_number', c.policy_number,
                     'status', c.status,
                     'expiration_date', c.expiration_date,
                     'expired', c.expired,
                     'selected', exists (select 1 from _mc_sel s2 where s2.line = v_line and s2.policy_id = c.policy_id)
                   ) order by (c.status='active') desc, c.expiration_date desc nulls last, c.created_at desc),
                   '[]'::jsonb)
            from _mc_cand c where c.line = v_line
         ));

    v_lines := v_lines || jsonb_build_object(v_line, v_line_obj);
  end loop;

  -- -------------------------------------------------------------------------
  -- 6) Unclassified 'other' policies (§2.6 lines.other[]) so nothing disappears.
  -- -------------------------------------------------------------------------
  select coalesce(jsonb_agg(jsonb_build_object(
      'policy_id', p.id,
      'policy_number', p.policy_number,
      'line_of_business', p.line_of_business,
      'line_canonical', p.line_canonical,
      'carrier', p.carrier,
      'status', p.status,
      'effective_date', p.effective_date,
      'expiration_date', p.expiration_date
    ) order by p.created_at desc), '[]'::jsonb)
    into v_other
  from public.policies p
  where p.account_id = p_account_id
    and p.deleted_at is null
    and (p_policy_ids is null or p.id = any(p_policy_ids))
    and 'other' = any(public.master_coi_lines(p));

  -- -------------------------------------------------------------------------
  -- 7) Description of operations (§7) + read-only prefill candidates. NO tier reads
  --    certificates_of_insurance (R13); ops_source vocabulary has no 'legacy'.
  -- -------------------------------------------------------------------------
  select acp.description_of_operations, acp.ops_source, acp.last_reviewed_at, acp.last_reviewed_by, acp.updated_at
    into v_ops_text, v_ops_source, v_last_reviewed, v_last_reviewed_by, v_prof_updated
  from public.account_coi_profiles acp where acp.account_id = p_account_id;

  -- canopy prefill: newest non-empty canopy_business_operations.description_of_operations
  --   via canopy_business_operations.policy_id -> canopy_policies.pull_id -> canopy_pulls.account_id
  --   Each UNION ALL branch is parenthesized because each carries its own ORDER BY/LIMIT
  --   (a bare `... order by .. limit 1 union all ..` is a syntax error in Postgres).
  v_ops_prefill := (
    select coalesce(jsonb_agg(cand order by cand->>'source'), '[]'::jsonb)
    from (
      (
        select jsonb_build_object('source','canopy','text', cbo.description_of_operations) as cand
        from public.canopy_business_operations cbo
        join public.canopy_policies cp on cp.id = cbo.policy_id
        join public.canopy_pulls    cpull on cpull.id = cp.pull_id
        where cpull.account_id = p_account_id
          and nullif(btrim(coalesce(cbo.description_of_operations,'')),'') is not null
        order by coalesce(cbo.updated_at, cbo.created_at) desc
        limit 1
      )
      union all
      -- bap_risk_context: bap_details.risk_context.business_description from any auto policy
      (
        select jsonb_build_object('source','bap_risk_context','text', bd.business_description) as cand
        from (
          select nullif(btrim(p.bap_details #>> '{risk_context,business_description}'),'') as business_description
          from public.policies p
          where p.account_id = p_account_id and p.deleted_at is null
            and nullif(btrim(p.bap_details #>> '{risk_context,business_description}'),'') is not null
          order by p.updated_at desc
          limit 1
        ) bd
        where bd.business_description is not null
      )
    ) prefills
  );

  v_ops := jsonb_build_object(
    'v', v_ops_text,
    'src', coalesce(v_ops_source, 'missing'),
    'prefill_candidates', v_ops_prefill
  );

  if nullif(btrim(coalesce(v_ops_text,'')),'') is null then
    v_warnings := v_warnings || jsonb_build_object('code','ops_missing','message','Description of operations is empty');
  end if;

  -- -------------------------------------------------------------------------
  -- 8) Review stamp + staleness (§8.3). stale when any contributing updated_at
  --    (policies, the AI tables, wc waivers, the profile) is later than last_reviewed_at,
  --    or never reviewed.
  -- -------------------------------------------------------------------------
  select greatest(
           coalesce(max(p.updated_at), 'epoch'::timestamptz),
           coalesce((select max(r.updated_at) from public.policy_cgl_additional_insureds r where r.policy_id = any(v_selected_ids)), 'epoch'::timestamptz),
           coalesce((select max(r.updated_at) from public.policy_umbrella_additional_insureds r where r.policy_id = any(v_selected_ids)), 'epoch'::timestamptz),
           coalesce((select max(r.updated_at) from public.policy_bap_interests r where r.policy_id = any(v_selected_ids)), 'epoch'::timestamptz),
           coalesce((select max(r.updated_at) from public.policy_property_interests r where r.policy_id = any(v_selected_ids)), 'epoch'::timestamptz),
           coalesce((select max(r.updated_at) from public.policy_wc_subrogation_waivers r where r.policy_id = any(v_selected_ids)), 'epoch'::timestamptz),
           coalesce(v_prof_updated, 'epoch'::timestamptz)
         )
    into v_max_touch
  from public.policies p where p.id = any(v_selected_ids);

  v_stale_review := (v_last_reviewed is null) or (v_max_touch is not null and v_max_touch > v_last_reviewed);

  v_review := jsonb_build_object(
    'last_reviewed_at', v_last_reviewed,
    'last_reviewed_by', v_last_reviewed_by,
    'stale', v_stale_review
  );

  if v_stale_review then
    v_warnings := v_warnings || jsonb_build_object('code','review_stale','message','Policy data changed after the last Master COI review');
  end if;
  if jsonb_array_length(v_other) > 0 then
    v_warnings := v_warnings || jsonb_build_object('code','unclassified_policies','message', (jsonb_array_length(v_other))::text || ' policy(ies) are not classified into an ACORD 25 line');
  end if;

  -- -------------------------------------------------------------------------
  -- 9) Readiness blockers (§2.7). Computed over the SELECTED lines (_mc_sel) and the
  --    built v_lines cells. ready = (no blockers).
  -- -------------------------------------------------------------------------

  -- no_lines: nothing classified into any of the five lines.
  if not exists (select 1 from _mc_sel) then
    v_blockers := v_blockers || jsonb_build_object('code','no_lines','message','No policy is classified into any ACORD 25 line');
  end if;

  -- policy_core_missing + policy_expired + policy_expiring_soon over selected policies.
  for v_rec in
    select distinct s.line, s.policy_id, s.policy_number, s.status, s.expired, s.expiration_date
    from _mc_sel s
  loop
    -- core fields from the policy row
    if exists (
      select 1 from public.policies p
      where p.id = v_rec.policy_id
        and (nullif(btrim(coalesce(p.policy_number,'')),'') is null
             or p.effective_date is null or p.expiration_date is null)
    ) then
      v_blockers := v_blockers || jsonb_build_object('code','policy_core_missing','line', v_rec.line,
        'message','Policy ' || coalesce(v_rec.policy_number,'(no number)') || ' is missing policy number, effective date, or expiration date');
    end if;
    if v_rec.expired then
      v_blockers := v_blockers || jsonb_build_object('code','policy_expired','line', v_rec.line,
        'message', upper(v_rec.line) || ' policy ' || coalesce(v_rec.policy_number,'') || ' expired ' || coalesce(v_rec.expiration_date::text,''));
    elsif v_rec.expiration_date is not null and v_rec.expiration_date <= current_date + (c_expiring_soon_days || ' days')::interval then
      v_warnings := v_warnings || jsonb_build_object('code','policy_expiring_soon','line', v_rec.line,
        'message', upper(v_rec.line) || ' policy expires in ' || (v_rec.expiration_date - current_date)::text || ' days');
    end if;
  end loop;

  -- insurer_unresolved: a selected line's carrier resolves to NO name at all.
  if exists (select 1 from _mc_sel s where nullif(btrim(coalesce(s.display_name,'')),'') is null) then
    for v_rec in
      select distinct s.line, s.policy_number
      from _mc_sel s where nullif(btrim(coalesce(s.display_name,'')),'') is null
    loop
      v_blockers := v_blockers || jsonb_build_object('code','insurer_unresolved','line', v_rec.line,
        'message','Carrier for ' || upper(v_rec.line) || ' policy ' || coalesce(v_rec.policy_number,'') || ' does not resolve to an insurer name');
    end loop;
  end if;

  -- limit_missing (§2.7): a required registry path is null on a selected line. Auto is
  -- special: ready when csl present OR the full split set present.
  --   gl: each_occurrence AND general_aggregate
  --   umbrella: each_occurrence   |   wc: all three EL limits
  -- Read the built cell values from v_lines so this matches exactly what the panel shows.
  if (v_lines #> '{gl,present}') = to_jsonb(true) then
    if (v_lines #>> '{gl,limits,each_occurrence,v}') is null then
      v_blockers := v_blockers || jsonb_build_object('code','limit_missing','line','gl','path','cgl_details.limits.each_occurrence','message','GL Each Occurrence limit is empty');
    end if;
    if (v_lines #>> '{gl,limits,general_aggregate,v}') is null then
      v_blockers := v_blockers || jsonb_build_object('code','limit_missing','line','gl','path','cgl_details.limits.general_aggregate','message','GL General Aggregate limit is empty');
    end if;
  end if;
  if (v_lines #> '{auto,present}') = to_jsonb(true) then
    if (v_lines #>> '{auto,csl,v}') is null
       and not ((v_lines #>> '{auto,bi_per_person,v}') is not null
                and (v_lines #>> '{auto,bi_per_accident,v}') is not null
                and (v_lines #>> '{auto,pd_per_accident,v}') is not null) then
      v_blockers := v_blockers || jsonb_build_object('code','limit_missing','line','auto','path','bap_details.coverage.liability.csl_limit','message','Auto liability limit is empty (need CSL or the full split set)');
    end if;
  end if;
  if (v_lines #> '{umbrella,present}') = to_jsonb(true) then
    if (v_lines #>> '{umbrella,each_occurrence,v}') is null then
      v_blockers := v_blockers || jsonb_build_object('code','limit_missing','line','umbrella','path','umbrella_details.limits.per_occurrence','message','Umbrella Each Occurrence limit is empty');
    end if;
  end if;
  if (v_lines #> '{wc,present}') = to_jsonb(true) then
    if (v_lines #>> '{wc,el_each_accident,v}') is null then
      v_blockers := v_blockers || jsonb_build_object('code','limit_missing','line','wc','path','wc_details.coverage.part_two_employers_liability.each_accident','message','WC EL Each Accident limit is empty');
    end if;
    if (v_lines #>> '{wc,el_disease_each_employee,v}') is null then
      v_blockers := v_blockers || jsonb_build_object('code','limit_missing','line','wc','path','wc_details.coverage.part_two_employers_liability.disease_each_employee','message','WC EL Disease Each Employee limit is empty');
    end if;
    if (v_lines #>> '{wc,el_disease_policy_limit,v}') is null then
      v_blockers := v_blockers || jsonb_build_object('code','limit_missing','line','wc','path','wc_details.coverage.part_two_employers_liability.disease_policy_limit','message','WC EL Disease Policy Limit is empty');
    end if;
  end if;

  -- naic_missing / naic_mismatch warnings from the insurer table.
  for v_rec in
    select (ins->>'letter') as letter, (ins #>> '{naic,v}') as naic_v, (ins #>> '{naic,flag}') as naic_flag
    from jsonb_array_elements(v_insurers) ins
  loop
    if nullif(btrim(coalesce(v_rec.naic_v,'')),'') is null then
      v_warnings := v_warnings || jsonb_build_object('code','naic_missing','message','Insurer ' || v_rec.letter || ' has no NAIC code');
    end if;
    if v_rec.naic_flag = 'mismatch' then
      v_warnings := v_warnings || jsonb_build_object('code','naic_mismatch','message','Insurer ' || v_rec.letter || ' NAIC differs between the manual value and the extracted value');
    end if;
  end loop;

  -- endorsement_requested + manual_overwritten by scanning the built lines.
  if exists (
    select 1 from jsonb_each(v_lines) le,
         lateral jsonb_array_elements(coalesce(le.value->'additional_insureds','[]'::jsonb)) ai
    where ai->>'endorsement_status' = 'requested'
  ) or exists (
    select 1 from jsonb_array_elements(coalesce(v_lines #> '{wc,subrogation_waivers}','[]'::jsonb)) w
    where w->>'endorsement_status' = 'requested'
  ) then
    v_warnings := v_warnings || jsonb_build_object('code','endorsement_requested','message','One or more additional insureds are requested but not yet endorsed');
  end if;

  if exists (
    select 1
    from jsonb_each(v_lines) le
    where jsonb_typeof(le.value) = 'object'
      and (
        exists (
          select 1 from jsonb_each(le.value) cell
          where jsonb_typeof(cell.value) = 'object' and (cell.value->>'flag') = 'overwritten_manual'
        )
        or exists (
          select 1 from jsonb_each(coalesce(le.value->'limits','{}'::jsonb)) lc
          where jsonb_typeof(lc.value) = 'object' and (lc.value->>'flag') = 'overwritten_manual'
        )
      )
  ) then
    v_warnings := v_warnings || jsonb_build_object('code','manual_overwritten','message','A manual value was overwritten by a later extraction; review and restore if needed');
  end if;

  -- named_insured_mismatch (§2.7): policies.named_insured or identity.named_insured
  -- disagrees with accounts.name (normalized compare).
  if exists (
    select 1 from public.policies p
    where p.id = any(v_selected_ids)
      and (
        (nullif(btrim(coalesce(p.named_insured,'')),'') is not null
          and public.normalize_entity_name(p.named_insured) <> public.normalize_entity_name(v_account.name))
        or (nullif(btrim(coalesce(p.cgl_details      #>> '{identity,named_insured}','')),'') is not null and public.normalize_entity_name(p.cgl_details      #>> '{identity,named_insured}') <> public.normalize_entity_name(v_account.name))
        or (nullif(btrim(coalesce(p.bap_details      #>> '{identity,named_insured}','')),'') is not null and public.normalize_entity_name(p.bap_details      #>> '{identity,named_insured}') <> public.normalize_entity_name(v_account.name))
        or (nullif(btrim(coalesce(p.umbrella_details #>> '{identity,named_insured}','')),'') is not null and public.normalize_entity_name(p.umbrella_details #>> '{identity,named_insured}') <> public.normalize_entity_name(v_account.name))
        or (nullif(btrim(coalesce(p.wc_details       #>> '{identity,named_insured}','')),'') is not null and public.normalize_entity_name(p.wc_details       #>> '{identity,named_insured}') <> public.normalize_entity_name(v_account.name))
        or (nullif(btrim(coalesce(p.property_details #>> '{identity,named_insured}','')),'') is not null and public.normalize_entity_name(p.property_details #>> '{identity,named_insured}') <> public.normalize_entity_name(v_account.name))
      )
  ) then
    v_ni_mismatch := true;
    v_warnings := v_warnings || jsonb_build_object('code','named_insured_mismatch','message','A policy named insured differs from the account name');
  end if;
  v_named_insured := jsonb_set(v_named_insured, array['policy_named_insured_mismatch'], to_jsonb(v_ni_mismatch));

  -- source_data_stale (07 §6): per selected line, EVERY load-bearing cell src='extracted'
  -- AND the newest extraction/Canopy-pull timestamp for that policy is older than 90 days.
  -- Load-bearing = that line's required_for_ready registry paths. property has none, so
  -- property never emits this warning. A manual edit to any load-bearing cell flips the
  -- line off (its src becomes 'manual').
  declare
    v_pol_id uuid;
    v_ts     timestamptz;
    v_all_ext boolean;
  begin
    -- GL: each_occurrence + general_aggregate
    if (v_lines #> '{gl,present}') = to_jsonb(true) then
      v_pol_id := (v_lines #>> '{gl,policy_id}')::uuid;
      v_all_ext := (v_lines #>> '{gl,limits,each_occurrence,src}') = 'extracted'
               and (v_lines #>> '{gl,limits,general_aggregate,src}') = 'extracted';
      if v_all_ext then
        select greatest(coalesce(p.updated_at,'epoch'::timestamptz),
                        coalesce((select max(cpull.completed_at) from public.canopy_business_operations cbo
                                    join public.canopy_policies cp on cp.id = cbo.policy_id
                                    join public.canopy_pulls cpull on cpull.id = cp.pull_id
                                   where cbo.policy_id = v_pol_id or cpull.account_id = p_account_id), 'epoch'::timestamptz))
          into v_ts from public.policies p where p.id = v_pol_id;
        if v_ts < now() - (c_stale_days || ' days')::interval then
          v_warnings := v_warnings || jsonb_build_object('code','source_data_stale','line','gl',
            'message','GL data is from an extraction ' || floor(extract(epoch from (now() - v_ts))/86400)::text || ' days old');
        end if;
      end if;
    end if;
    -- AUTO: csl (the required path)
    if (v_lines #> '{auto,present}') = to_jsonb(true) then
      v_pol_id := (v_lines #>> '{auto,policy_id}')::uuid;
      v_all_ext := (v_lines #>> '{auto,csl,src}') = 'extracted';
      if v_all_ext then
        select coalesce(p.updated_at,'epoch'::timestamptz) into v_ts from public.policies p where p.id = v_pol_id;
        if v_ts < now() - (c_stale_days || ' days')::interval then
          v_warnings := v_warnings || jsonb_build_object('code','source_data_stale','line','auto',
            'message','Auto data is from an extraction ' || floor(extract(epoch from (now() - v_ts))/86400)::text || ' days old');
        end if;
      end if;
    end if;
    -- UMBRELLA: each_occurrence
    if (v_lines #> '{umbrella,present}') = to_jsonb(true) then
      v_pol_id := (v_lines #>> '{umbrella,policy_id}')::uuid;
      v_all_ext := (v_lines #>> '{umbrella,each_occurrence,src}') = 'extracted';
      if v_all_ext then
        select coalesce(p.updated_at,'epoch'::timestamptz) into v_ts from public.policies p where p.id = v_pol_id;
        if v_ts < now() - (c_stale_days || ' days')::interval then
          v_warnings := v_warnings || jsonb_build_object('code','source_data_stale','line','umbrella',
            'message','Umbrella data is from an extraction ' || floor(extract(epoch from (now() - v_ts))/86400)::text || ' days old');
        end if;
      end if;
    end if;
    -- WC: all three EL limits
    if (v_lines #> '{wc,present}') = to_jsonb(true) then
      v_pol_id := (v_lines #>> '{wc,policy_id}')::uuid;
      v_all_ext := (v_lines #>> '{wc,el_each_accident,src}') = 'extracted'
               and (v_lines #>> '{wc,el_disease_each_employee,src}') = 'extracted'
               and (v_lines #>> '{wc,el_disease_policy_limit,src}') = 'extracted';
      if v_all_ext then
        select coalesce(p.updated_at,'epoch'::timestamptz) into v_ts from public.policies p where p.id = v_pol_id;
        if v_ts < now() - (c_stale_days || ' days')::interval then
          v_warnings := v_warnings || jsonb_build_object('code','source_data_stale','line','wc',
            'message','WC data is from an extraction ' || floor(extract(epoch from (now() - v_ts))/86400)::text || ' days old');
        end if;
      end if;
    end if;
  end;

  -- -------------------------------------------------------------------------
  -- 10) Final self-contained document (§2.6). Snapshot-ready.
  -- -------------------------------------------------------------------------
  return jsonb_build_object(
    'version', 1,
    'generated_at', now(),
    'account_id', p_account_id,
    'named_insured', v_named_insured,
    'producer', v_producer,
    'insurers', v_insurers,
    'insurer_overflow', v_insurer_overflow,
    'lines', v_lines || jsonb_build_object('other', v_other),
    'description_of_operations', v_ops,
    'review', v_review,
    'readiness', jsonb_build_object(
      'ready', (jsonb_array_length(v_blockers) = 0),
      'blockers', v_blockers,
      'warnings', v_warnings
    )
  );
end $$;

revoke execute on function public.get_master_coi(uuid, uuid[]) from anon, public;
grant  execute on function public.get_master_coi(uuid, uuid[]) to authenticated, service_role;
