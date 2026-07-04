-- Phase 4 migration (02-owned, renumbered): resolve_holder_endorsements, the
-- holder-scoped E&O gate (02 Section 4.7).
--
-- Owned by 02-master-coi-data-layer.md (spec name 20260702095000). Sequenced into
-- Phase 4 AFTER the directory table-create (000000) because it reads
-- public.additional_insureds; renumbered to 20260704000500 so the filename sorts
-- after migrations already applied on this branch (the 20260702* prefix would sort
-- before them). Its only hard dependency is the directory table.
--
-- This is the single implementation of the Decision 5 guarantee: never print
-- ADDL INSD Y (or SUBR WVD Y) for a holder who is not actually endorsed. BOTH
-- consumers call it, so the UI toggle gate (useHolderEndorsementStatus) and the
-- printed Y/N from generate-certificate can never disagree.
--
-- Resolved values are text over the closed set 'endorsed' | 'requested' | 'none',
-- never booleans. Only 'endorsed' can ever print Y; 'requested' is the amber
-- carrier-asked state; 'none' is a locked N. p_holder_id is an
-- additional_insureds.id (the same id that lands in certificates.holder_id at
-- issue time).
--
-- Always returns EXACTLY five rows (gl, auto, umbrella, wc, property), one per
-- canonical line key, so both consumers get a stable shape. Lines with no
-- selected policy return 'none'/'none' with basis {"kind":"none"}.
--
-- Two-tier resolution per box: the endorsed tier (endorsement_status='endorsed')
-- runs first and, on a hit, resolves 'endorsed'. Only when it is empty does the
-- requested tier (endorsement_status='requested') run and resolve 'requested'.
-- The endorsed tier always wins.
--
-- Holder matching, strongest evidence first (the reported basis picks the
-- strongest matching row):
--   1. row.additional_insured_id = p_holder_id       (matched_by additional_insured_id)
--   2. normalize_entity_name(row.name) = holder norm  (matched_by normalized_name)
--   3. blanket scope per the 4.7.2 mapping            (kind blanket, no matched_by)
--
-- E&O semantics: ADDL INSD uses AI rows only (interest_type='additional_insured'
-- on bap/property). WC has no AI concept, so addl_insd_resolved is always 'none'
-- on wc. SUBR WVD on gl/auto/umbrella/property requires the resolving row to also
-- have waiver_of_subrogation=true; wc uses policy_wc_subrogation_waivers directly.
-- Under-claim, never over-claim.
--
-- CRITICAL: public.certificates does NOT exist yet (Phase 5). This function
-- references it NOWHERE. It reads only the five per-policy endorsement tables,
-- additional_insureds, accounts, and policies.
--
-- Depends on live objects: additional_insureds (000000), accounts, policies,
-- master_coi_lines(policies) [IMMUTABLE], normalize_entity_name(text)
-- [IMMUTABLE], the five per-policy tables, is_staff, auth.role.

create or replace function public.resolve_holder_endorsements(
  p_account_id uuid,
  p_holder_id  uuid,
  p_policy_ids uuid[]
)
returns table (
  line_key           text,   -- canonical: 'gl' | 'auto' | 'umbrella' | 'wc' | 'property'
  addl_insd_resolved text,   -- closed set: 'endorsed' | 'requested' | 'none'
  subr_wvd_resolved  text,   -- closed set: 'endorsed' | 'requested' | 'none'
  basis              jsonb   -- {"addl_insd": {...}, "subr_wvd": {...}}
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_holder_name text;
  v_holder_ws   uuid;
  v_holder_norm text;
  v_account_ws  uuid;

  -- GL is computed first; the umbrella follow_underlying case delegates to it.
  v_gl_addl  text := 'none';
  v_gl_subr  text := 'none';
  v_gl_addl_basis jsonb := jsonb_build_object('kind','none');
  v_gl_subr_basis jsonb := jsonb_build_object('kind','none');

  v_res  text;
  v_bas  jsonb;
  r      record;
begin
  -- Gate: staff users or the service role (generate-certificate).
  if auth.role() is distinct from 'service_role' and not public.is_staff() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  -- Holder must exist in the directory.
  select ai.name, ai.agency_workspace_id
    into v_holder_name, v_holder_ws
  from public.additional_insureds ai
  where ai.id = p_holder_id and ai.deleted_at is null;
  if not found then
    raise exception 'holder % not found', p_holder_id;
  end if;
  v_holder_norm := public.normalize_entity_name(v_holder_name);

  -- Tenancy cross-check (defense in depth under SECURITY DEFINER).
  select a.agency_workspace_id into v_account_ws
  from public.accounts a
  where a.id = p_account_id and a.deleted_at is null;
  if not found then
    raise exception 'account % not found', p_account_id;
  end if;
  if v_holder_ws is not null and v_account_ws is not null
     and v_holder_ws <> v_account_ws then
    raise exception 'holder and account belong to different workspaces';
  end if;

  -- Every requested policy must belong to the account.
  if exists (
    select 1 from unnest(coalesce(p_policy_ids, array[]::uuid[])) pid
    left join public.policies p
           on p.id = pid and p.account_id = p_account_id and p.deleted_at is null
    where p.id is null
  ) then
    raise exception 'policy list contains ids not belonging to account %', p_account_id;
  end if;

  -- =========================================================================
  -- GL line. ADDL INSD from policy_cgl_additional_insureds. Blanket when
  -- ai_type='owners_lessees_contractors' AND the normalized endorsement form
  -- starts with CG2033 or CG2038; every other case is scheduled (holder-matched).
  -- SUBR WVD additionally requires waiver_of_subrogation=true on the row.
  -- =========================================================================
  -- GL ADDL INSD (two tiers; endorsed wins).
  v_res := 'none'; v_bas := jsonb_build_object('kind','none');
  for r in
    select tier, matched_by, is_blanket, id, ai_type, endorsement_form
    from (
      select
        case when cgl.endorsement_status = 'endorsed' then 1 else 2 end as tier,
        case
          when cgl.additional_insured_id = p_holder_id then 'additional_insured_id'
          when public.normalize_entity_name(cgl.name) = v_holder_norm then 'normalized_name'
          else null
        end as matched_by,
        (cgl.ai_type = 'owners_lessees_contractors'
         and regexp_replace(upper(coalesce(cgl.endorsement_form,'')), '[^A-Z0-9]', '', 'g')
             ~ '^(CG2033|CG2038)') as is_blanket,
        cgl.id, cgl.ai_type, cgl.endorsement_form
      from public.policy_cgl_additional_insureds cgl
      join public.policies p on p.id = cgl.policy_id
      where cgl.policy_id = any(p_policy_ids)
        and 'gl' = any(public.master_coi_lines(p))
        and cgl.endorsement_status in ('endorsed','requested')
        and (
              cgl.additional_insured_id = p_holder_id
           or public.normalize_entity_name(cgl.name) = v_holder_norm
           or (cgl.ai_type = 'owners_lessees_contractors'
               and regexp_replace(upper(coalesce(cgl.endorsement_form,'')), '[^A-Z0-9]', '', 'g')
                   ~ '^(CG2033|CG2038)')
          )
    ) q
    order by tier asc,
             (matched_by = 'additional_insured_id') desc nulls last,
             (matched_by = 'normalized_name') desc nulls last
    limit 1
  loop
    v_res := case when r.tier = 1 then 'endorsed' else 'requested' end;
    v_bas := jsonb_build_object(
      'kind', case when r.matched_by is not null then 'holder_match' else 'blanket' end,
      'table', 'policy_cgl_additional_insureds', 'row_id', r.id,
      'matched_by', r.matched_by, 'ai_type', r.ai_type, 'endorsement_form', r.endorsement_form);
  end loop;
  v_gl_addl := v_res; v_gl_addl_basis := v_bas;

  -- GL SUBR WVD (waiver_of_subrogation=true required; endorsed wins).
  v_res := 'none'; v_bas := jsonb_build_object('kind','none');
  for r in
    select tier, matched_by, is_blanket, id, ai_type, endorsement_form
    from (
      select
        case when cgl.endorsement_status = 'endorsed' then 1 else 2 end as tier,
        case
          when cgl.additional_insured_id = p_holder_id then 'additional_insured_id'
          when public.normalize_entity_name(cgl.name) = v_holder_norm then 'normalized_name'
          else null
        end as matched_by,
        (cgl.ai_type = 'owners_lessees_contractors'
         and regexp_replace(upper(coalesce(cgl.endorsement_form,'')), '[^A-Z0-9]', '', 'g')
             ~ '^(CG2033|CG2038)') as is_blanket,
        cgl.id, cgl.ai_type, cgl.endorsement_form
      from public.policy_cgl_additional_insureds cgl
      join public.policies p on p.id = cgl.policy_id
      where cgl.policy_id = any(p_policy_ids)
        and 'gl' = any(public.master_coi_lines(p))
        and cgl.endorsement_status in ('endorsed','requested')
        and cgl.waiver_of_subrogation = true
        and (
              cgl.additional_insured_id = p_holder_id
           or public.normalize_entity_name(cgl.name) = v_holder_norm
           or (cgl.ai_type = 'owners_lessees_contractors'
               and regexp_replace(upper(coalesce(cgl.endorsement_form,'')), '[^A-Z0-9]', '', 'g')
                   ~ '^(CG2033|CG2038)')
          )
    ) q
    order by tier asc,
             (matched_by = 'additional_insured_id') desc nulls last,
             (matched_by = 'normalized_name') desc nulls last
    limit 1
  loop
    v_res := case when r.tier = 1 then 'endorsed' else 'requested' end;
    v_bas := jsonb_build_object(
      'kind', case when r.matched_by is not null then 'holder_match' else 'blanket' end,
      'table', 'policy_cgl_additional_insureds', 'row_id', r.id,
      'matched_by', r.matched_by, 'ai_type', r.ai_type, 'endorsement_form', r.endorsement_form);
  end loop;
  v_gl_subr := v_res; v_gl_subr_basis := v_bas;

  line_key := 'gl';
  addl_insd_resolved := v_gl_addl;
  subr_wvd_resolved  := v_gl_subr;
  basis := jsonb_build_object('addl_insd', v_gl_addl_basis, 'subr_wvd', v_gl_subr_basis);
  return next;

  -- =========================================================================
  -- AUTO line. ADDL INSD + SUBR WVD from policy_bap_interests, interest rows
  -- (interest_type='additional_insured') only. Blanket when blanket=true, else
  -- holder-matched. SUBR WVD requires waiver_of_subrogation=true.
  -- =========================================================================
  -- AUTO ADDL INSD.
  v_res := 'none'; v_bas := jsonb_build_object('kind','none');
  for r in
    select tier, matched_by, id
    from (
      select
        case when bap.endorsement_status = 'endorsed' then 1 else 2 end as tier,
        case
          when bap.additional_insured_id = p_holder_id then 'additional_insured_id'
          when public.normalize_entity_name(bap.name) = v_holder_norm then 'normalized_name'
          else null
        end as matched_by,
        bap.id
      from public.policy_bap_interests bap
      join public.policies p on p.id = bap.policy_id
      where bap.policy_id = any(p_policy_ids)
        and 'auto' = any(public.master_coi_lines(p))
        and bap.interest_type = 'additional_insured'
        and bap.endorsement_status in ('endorsed','requested')
        and (
              bap.additional_insured_id = p_holder_id
           or public.normalize_entity_name(bap.name) = v_holder_norm
           or bap.blanket = true
          )
    ) q
    order by tier asc,
             (matched_by = 'additional_insured_id') desc nulls last,
             (matched_by = 'normalized_name') desc nulls last
    limit 1
  loop
    v_res := case when r.tier = 1 then 'endorsed' else 'requested' end;
    v_bas := jsonb_build_object(
      'kind', case when r.matched_by is not null then 'holder_match' else 'blanket' end,
      'table', 'policy_bap_interests', 'row_id', r.id,
      'matched_by', r.matched_by, 'ai_type', null, 'endorsement_form', null);
  end loop;
  addl_insd_resolved := v_res;
  basis := jsonb_build_object('addl_insd', v_bas, 'subr_wvd', jsonb_build_object('kind','none'));

  -- AUTO SUBR WVD (waiver_of_subrogation=true required).
  v_res := 'none'; v_bas := jsonb_build_object('kind','none');
  for r in
    select tier, matched_by, id
    from (
      select
        case when bap.endorsement_status = 'endorsed' then 1 else 2 end as tier,
        case
          when bap.additional_insured_id = p_holder_id then 'additional_insured_id'
          when public.normalize_entity_name(bap.name) = v_holder_norm then 'normalized_name'
          else null
        end as matched_by,
        bap.id
      from public.policy_bap_interests bap
      join public.policies p on p.id = bap.policy_id
      where bap.policy_id = any(p_policy_ids)
        and 'auto' = any(public.master_coi_lines(p))
        and bap.interest_type = 'additional_insured'
        and bap.endorsement_status in ('endorsed','requested')
        and bap.waiver_of_subrogation = true
        and (
              bap.additional_insured_id = p_holder_id
           or public.normalize_entity_name(bap.name) = v_holder_norm
           or bap.blanket = true
          )
    ) q
    order by tier asc,
             (matched_by = 'additional_insured_id') desc nulls last,
             (matched_by = 'normalized_name') desc nulls last
    limit 1
  loop
    v_res := case when r.tier = 1 then 'endorsed' else 'requested' end;
    v_bas := jsonb_build_object(
      'kind', case when r.matched_by is not null then 'holder_match' else 'blanket' end,
      'table', 'policy_bap_interests', 'row_id', r.id,
      'matched_by', r.matched_by, 'ai_type', null, 'endorsement_form', null);
  end loop;
  line_key := 'auto';
  subr_wvd_resolved := v_res;
  basis := jsonb_set(basis, '{subr_wvd}', v_bas);
  return next;

  -- =========================================================================
  -- UMBRELLA line. policy_umbrella_additional_insureds. Blanket when
  -- ai_type='blanket'; scheduled when ai_type='scheduled'.
  -- ai_type='follow_underlying' is NEITHER: it delegates to the GL line result
  -- in the same policy set (addl_insd -> GL addl_insd, subr_wvd -> GL subr_wvd).
  -- If no GL line is in the selected set, follow_underlying never resolves
  -- (basis kind follow_underlying_no_underlying). SUBR WVD requires
  -- waiver_of_subrogation=true on a directly-resolving (non-delegated) row.
  -- =========================================================================
  declare
    v_um_addl text := 'none';
    v_um_subr text := 'none';
    v_um_addl_basis jsonb := jsonb_build_object('kind','none');
    v_um_subr_basis jsonb := jsonb_build_object('kind','none');
    v_gl_in_set boolean;
    v_follow_seen boolean := false;
  begin
    -- Is there any GL policy in the selected set (needed for follow_underlying)?
    select exists (
      select 1 from public.policies p
      where p.id = any(p_policy_ids) and p.account_id = p_account_id and p.deleted_at is null
        and 'gl' = any(public.master_coi_lines(p))
    ) into v_gl_in_set;

    -- UMBRELLA ADDL INSD, direct (blanket/scheduled) rows first.
    v_res := 'none'; v_bas := jsonb_build_object('kind','none');
    for r in
      select tier, matched_by, id, ai_type
      from (
        select
          case when um.endorsement_status = 'endorsed' then 1 else 2 end as tier,
          case
            when um.additional_insured_id = p_holder_id then 'additional_insured_id'
            when public.normalize_entity_name(um.name) = v_holder_norm then 'normalized_name'
            else null
          end as matched_by,
          um.id, um.ai_type
        from public.policy_umbrella_additional_insureds um
        join public.policies p on p.id = um.policy_id
        where um.policy_id = any(p_policy_ids)
          and 'umbrella' = any(public.master_coi_lines(p))
          and um.endorsement_status in ('endorsed','requested')
          and um.ai_type in ('blanket','scheduled')
          and (
                um.additional_insured_id = p_holder_id
             or public.normalize_entity_name(um.name) = v_holder_norm
             or um.ai_type = 'blanket'
            )
      ) q
      order by tier asc,
               (matched_by = 'additional_insured_id') desc nulls last,
               (matched_by = 'normalized_name') desc nulls last
      limit 1
    loop
      v_res := case when r.tier = 1 then 'endorsed' else 'requested' end;
      v_bas := jsonb_build_object(
        'kind', case when r.matched_by is not null then 'holder_match' else 'blanket' end,
        'table', 'policy_umbrella_additional_insureds', 'row_id', r.id,
        'matched_by', r.matched_by, 'ai_type', r.ai_type, 'endorsement_form', null);
    end loop;
    v_um_addl := v_res; v_um_addl_basis := v_bas;

    -- follow_underlying delegation for ADDL INSD, only if no direct row resolved.
    if v_um_addl = 'none' then
      select exists (
        select 1 from public.policy_umbrella_additional_insureds um
        join public.policies p on p.id = um.policy_id
        where um.policy_id = any(p_policy_ids)
          and 'umbrella' = any(public.master_coi_lines(p))
          and um.ai_type = 'follow_underlying'
          and um.endorsement_status in ('endorsed','requested')
      ) into v_follow_seen;
      if v_follow_seen then
        if not v_gl_in_set then
          v_um_addl := 'none';
          v_um_addl_basis := jsonb_build_object('kind','follow_underlying_no_underlying');
        else
          v_um_addl := v_gl_addl;
          v_um_addl_basis := jsonb_build_object('kind','follow_underlying', 'delegated_to','gl',
                                                'gl_addl_insd', v_gl_addl);
        end if;
      end if;
    end if;

    -- UMBRELLA SUBR WVD, direct rows first (waiver_of_subrogation=true required).
    v_res := 'none'; v_bas := jsonb_build_object('kind','none');
    for r in
      select tier, matched_by, id, ai_type
      from (
        select
          case when um.endorsement_status = 'endorsed' then 1 else 2 end as tier,
          case
            when um.additional_insured_id = p_holder_id then 'additional_insured_id'
            when public.normalize_entity_name(um.name) = v_holder_norm then 'normalized_name'
            else null
          end as matched_by,
          um.id, um.ai_type
        from public.policy_umbrella_additional_insureds um
        join public.policies p on p.id = um.policy_id
        where um.policy_id = any(p_policy_ids)
          and 'umbrella' = any(public.master_coi_lines(p))
          and um.endorsement_status in ('endorsed','requested')
          and um.waiver_of_subrogation = true
          and um.ai_type in ('blanket','scheduled')
          and (
                um.additional_insured_id = p_holder_id
             or public.normalize_entity_name(um.name) = v_holder_norm
             or um.ai_type = 'blanket'
            )
      ) q
      order by tier asc,
               (matched_by = 'additional_insured_id') desc nulls last,
               (matched_by = 'normalized_name') desc nulls last
      limit 1
    loop
      v_res := case when r.tier = 1 then 'endorsed' else 'requested' end;
      v_bas := jsonb_build_object(
        'kind', case when r.matched_by is not null then 'holder_match' else 'blanket' end,
        'table', 'policy_umbrella_additional_insureds', 'row_id', r.id,
        'matched_by', r.matched_by, 'ai_type', r.ai_type, 'endorsement_form', null);
    end loop;
    v_um_subr := v_res; v_um_subr_basis := v_bas;

    -- follow_underlying delegation for SUBR WVD, only if no direct row resolved.
    if v_um_subr = 'none' then
      if not v_follow_seen then
        select exists (
          select 1 from public.policy_umbrella_additional_insureds um
          join public.policies p on p.id = um.policy_id
          where um.policy_id = any(p_policy_ids)
            and 'umbrella' = any(public.master_coi_lines(p))
            and um.ai_type = 'follow_underlying'
            and um.endorsement_status in ('endorsed','requested')
        ) into v_follow_seen;
      end if;
      if v_follow_seen then
        if not v_gl_in_set then
          v_um_subr := 'none';
          v_um_subr_basis := jsonb_build_object('kind','follow_underlying_no_underlying');
        else
          v_um_subr := v_gl_subr;
          v_um_subr_basis := jsonb_build_object('kind','follow_underlying', 'delegated_to','gl',
                                                'gl_subr_wvd', v_gl_subr);
        end if;
      end if;
    end if;

    line_key := 'umbrella';
    addl_insd_resolved := v_um_addl;
    subr_wvd_resolved  := v_um_subr;
    basis := jsonb_build_object('addl_insd', v_um_addl_basis, 'subr_wvd', v_um_subr_basis);
    return next;
  end;

  -- =========================================================================
  -- WC line. No AI concept -> addl_insd_resolved is always 'none'. SUBR WVD from
  -- policy_wc_subrogation_waivers: blanket when waiver_scope='blanket', else
  -- holder-matched (waiver_scope='specific'). The row IS the waiver; no separate
  -- waiver_of_subrogation flag.
  -- =========================================================================
  v_res := 'none'; v_bas := jsonb_build_object('kind','none');
  for r in
    select tier, matched_by, id, waiver_scope
    from (
      select
        case when wc.endorsement_status = 'endorsed' then 1 else 2 end as tier,
        case
          when wc.additional_insured_id = p_holder_id then 'additional_insured_id'
          when public.normalize_entity_name(wc.name) = v_holder_norm then 'normalized_name'
          else null
        end as matched_by,
        wc.id, wc.waiver_scope
      from public.policy_wc_subrogation_waivers wc
      join public.policies p on p.id = wc.policy_id
      where wc.policy_id = any(p_policy_ids)
        and 'wc' = any(public.master_coi_lines(p))
        and wc.endorsement_status in ('endorsed','requested')
        and (
              wc.additional_insured_id = p_holder_id
           or public.normalize_entity_name(wc.name) = v_holder_norm
           or wc.waiver_scope = 'blanket'
          )
    ) q
    order by tier asc,
             (matched_by = 'additional_insured_id') desc nulls last,
             (matched_by = 'normalized_name') desc nulls last
    limit 1
  loop
    v_res := case when r.tier = 1 then 'endorsed' else 'requested' end;
    v_bas := jsonb_build_object(
      'kind', case when r.matched_by is not null then 'holder_match' else 'blanket' end,
      'table', 'policy_wc_subrogation_waivers', 'row_id', r.id,
      'matched_by', r.matched_by, 'ai_type', null, 'endorsement_form', null);
  end loop;
  line_key := 'wc';
  addl_insd_resolved := 'none';
  subr_wvd_resolved  := v_res;
  basis := jsonb_build_object('addl_insd', jsonb_build_object('kind','none'), 'subr_wvd', v_bas);
  return next;

  -- =========================================================================
  -- PROPERTY line. ADDL INSD + SUBR WVD from policy_property_interests, interest
  -- rows (interest_type='additional_insured') only. Blanket when blanket=true,
  -- else holder-matched. SUBR WVD requires waiver_of_subrogation=true.
  -- =========================================================================
  -- PROPERTY ADDL INSD.
  v_res := 'none'; v_bas := jsonb_build_object('kind','none');
  for r in
    select tier, matched_by, id
    from (
      select
        case when pr.endorsement_status = 'endorsed' then 1 else 2 end as tier,
        case
          when pr.additional_insured_id = p_holder_id then 'additional_insured_id'
          when public.normalize_entity_name(pr.name) = v_holder_norm then 'normalized_name'
          else null
        end as matched_by,
        pr.id
      from public.policy_property_interests pr
      join public.policies p on p.id = pr.policy_id
      where pr.policy_id = any(p_policy_ids)
        and 'property' = any(public.master_coi_lines(p))
        and pr.interest_type = 'additional_insured'
        and pr.endorsement_status in ('endorsed','requested')
        and (
              pr.additional_insured_id = p_holder_id
           or public.normalize_entity_name(pr.name) = v_holder_norm
           or pr.blanket = true
          )
    ) q
    order by tier asc,
             (matched_by = 'additional_insured_id') desc nulls last,
             (matched_by = 'normalized_name') desc nulls last
    limit 1
  loop
    v_res := case when r.tier = 1 then 'endorsed' else 'requested' end;
    v_bas := jsonb_build_object(
      'kind', case when r.matched_by is not null then 'holder_match' else 'blanket' end,
      'table', 'policy_property_interests', 'row_id', r.id,
      'matched_by', r.matched_by, 'ai_type', null, 'endorsement_form', null);
  end loop;
  addl_insd_resolved := v_res;
  basis := jsonb_build_object('addl_insd', v_bas, 'subr_wvd', jsonb_build_object('kind','none'));

  -- PROPERTY SUBR WVD (waiver_of_subrogation=true required).
  v_res := 'none'; v_bas := jsonb_build_object('kind','none');
  for r in
    select tier, matched_by, id
    from (
      select
        case when pr.endorsement_status = 'endorsed' then 1 else 2 end as tier,
        case
          when pr.additional_insured_id = p_holder_id then 'additional_insured_id'
          when public.normalize_entity_name(pr.name) = v_holder_norm then 'normalized_name'
          else null
        end as matched_by,
        pr.id
      from public.policy_property_interests pr
      join public.policies p on p.id = pr.policy_id
      where pr.policy_id = any(p_policy_ids)
        and 'property' = any(public.master_coi_lines(p))
        and pr.interest_type = 'additional_insured'
        and pr.endorsement_status in ('endorsed','requested')
        and pr.waiver_of_subrogation = true
        and (
              pr.additional_insured_id = p_holder_id
           or public.normalize_entity_name(pr.name) = v_holder_norm
           or pr.blanket = true
          )
    ) q
    order by tier asc,
             (matched_by = 'additional_insured_id') desc nulls last,
             (matched_by = 'normalized_name') desc nulls last
    limit 1
  loop
    v_res := case when r.tier = 1 then 'endorsed' else 'requested' end;
    v_bas := jsonb_build_object(
      'kind', case when r.matched_by is not null then 'holder_match' else 'blanket' end,
      'table', 'policy_property_interests', 'row_id', r.id,
      'matched_by', r.matched_by, 'ai_type', null, 'endorsement_form', null);
  end loop;
  line_key := 'property';
  subr_wvd_resolved := v_res;
  basis := jsonb_set(basis, '{subr_wvd}', v_bas);
  return next;

  return;
end;
$function$;

comment on function public.resolve_holder_endorsements(uuid, uuid, uuid[]) is
  'Holder-scoped E&O gate (02 Sec 4.7). Returns exactly five rows (gl/auto/umbrella/wc/property) with addl_insd_resolved/subr_wvd_resolved over the closed set endorsed|requested|none plus a basis jsonb. Two-tier per box (endorsed wins over requested); holder match order additional_insured_id > normalized_name > blanket; wc addl_insd always none; SUBR WVD on gl/auto/umbrella/property requires waiver_of_subrogation=true; umbrella follow_underlying delegates to the GL result. References public.certificates nowhere.';

revoke execute on function public.resolve_holder_endorsements(uuid, uuid, uuid[]) from anon, public;
grant  execute on function public.resolve_holder_endorsements(uuid, uuid, uuid[]) to authenticated, service_role;
