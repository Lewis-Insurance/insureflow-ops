-- ============================================================================
-- COI endorsement write paths
-- ============================================================================
-- The READ/resolution side (resolve_holder_endorsements) and the document
-- extraction writers already exist, but there is no HUMAN write path to record
-- an additional-insured / waiver-of-subrogation endorsement on a policy. This
-- migration adds that missing surface so the policy page and the Generate COI
-- screen can:
--   * set/clear the single BLANKET additional-insured + blanket waiver row per line
--   * attach/detach a SPECIFIC (scheduled) additional insured from the directory
--   * flip status / waiver / form on any existing endorsement row
--   * read the current endorsement picture for a (policy, line) in one shape
--
-- Design notes (grounded in the live resolve_holder_endorsements body):
--   * Only endorsement_status='endorsed' prints a certificate 'Y'; 'requested'
--     shows amber; anything else is 'N'. Callers choose the status.
--   * GL blanket is detected by ai_type='owners_lessees_contractors' + a form
--     normalizing to ^(CG2033|CG2038); a GL blanket WAIVER rides that same row's
--     waiver_of_subrogation flag. Auto/Property blanket = blanket=true +
--     interest_type='additional_insured'; Umbrella blanket = ai_type='blanket';
--     WC blanket = waiver_scope='blanket'. On the four AI-bearing lines a blanket
--     waiver therefore implies the blanket AI row exists (they are one row).
--   * Rows written here are stamped extraction_status='MANUAL' (where the column
--     exists) so the UI can surface a "manually added, not document-backed"
--     warning; WC has no such column and is manual by construction.
--
-- All functions are SECURITY DEFINER, gated to is_staff() AND is_agency_member()
-- of the policy's workspace, pinned to search_path=public, and revoked from
-- anon/public. Additive only: no existing rows are modified by this migration.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Internal guard: assert the caller may write this policy, return its workspace.
-- ---------------------------------------------------------------------------
create or replace function public._coi_assert_policy_access(p_policy_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_ws uuid;
begin
  if not public.is_staff() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
  select a.agency_workspace_id
    into v_ws
  from public.policies p
  join public.accounts a on a.id = p.account_id
  where p.id = p_policy_id and p.deleted_at is null;
  if v_ws is null then
    raise exception 'policy % not found', p_policy_id using errcode = 'P0002';
  end if;
  if not public.is_agency_member(v_ws) then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
  return v_ws;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_line_blanket_endorsement: manage the single blanket row for a line.
--   p_addl_insd / p_subr_wvd = desired blanket AI / blanket waiver state.
--   When both are false the blanket row is removed. On non-WC lines a blanket
--   waiver implies the blanket AI row (they are the same row).
-- ---------------------------------------------------------------------------
create or replace function public.set_line_blanket_endorsement(
  p_policy_id uuid,
  p_line      text,
  p_addl_insd boolean,
  p_subr_wvd  boolean,
  p_status    text default 'endorsed',
  p_form      text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ws       uuid;
  v_uid      uuid := auth.uid();
  v_now      timestamptz := now();
  v_want     boolean;
  v_row_id   uuid;
  v_form     text;
  v_normform text;
  v_conf_at  timestamptz;
  v_conf_by  uuid;
begin
  if p_line not in ('gl','auto','umbrella','wc','property') then
    raise exception 'invalid line %', p_line using errcode = '22023';
  end if;
  if p_status not in ('none','requested','endorsed') then
    raise exception 'invalid status %', p_status using errcode = '22023';
  end if;
  v_ws := public._coi_assert_policy_access(p_policy_id);

  v_conf_at := case when p_status = 'endorsed' then v_now end;
  v_conf_by := case when p_status = 'endorsed' then v_uid end;

  -- WC has no AI concept; every other line couples blanket waiver to blanket AI.
  if p_line = 'wc' then
    v_want := coalesce(p_subr_wvd, false);
  else
    v_want := coalesce(p_addl_insd, false) or coalesce(p_subr_wvd, false);
  end if;

  if p_line = 'gl' then
    -- GL blanket must carry a CG2033/CG2038-normalizing form to resolve.
    v_normform := regexp_replace(upper(coalesce(p_form,'')), '[^A-Z0-9]', '', 'g');
    v_form := case when v_normform ~ '^(CG2033|CG2038)' then p_form else 'CG 20 33' end;

    select id into v_row_id
    from public.policy_cgl_additional_insureds
    where policy_id = p_policy_id
      and additional_insured_id is null
      and ai_type = 'owners_lessees_contractors'
    order by created_at asc
    limit 1;

    if not v_want then
      if v_row_id is not null then
        delete from public.policy_cgl_additional_insureds where id = v_row_id;
      end if;
      v_row_id := null;
    elsif v_row_id is null then
      insert into public.policy_cgl_additional_insureds
        (policy_id, name, ai_type, waiver_of_subrogation, endorsement_form,
         endorsement_status, endorsement_confirmed_at, endorsement_confirmed_by, extraction_status)
      values
        (p_policy_id, 'Blanket per written contract', 'owners_lessees_contractors',
         coalesce(p_subr_wvd,false), v_form, p_status, v_conf_at, v_conf_by, 'MANUAL')
      returning id into v_row_id;
    else
      update public.policy_cgl_additional_insureds
        set waiver_of_subrogation = coalesce(p_subr_wvd,false),
            endorsement_form = v_form,
            endorsement_status = p_status,
            endorsement_confirmed_at = v_conf_at,
            endorsement_confirmed_by = v_conf_by,
            extraction_status = 'MANUAL'
      where id = v_row_id;
    end if;

  elsif p_line = 'auto' then
    select id into v_row_id
    from public.policy_bap_interests
    where policy_id = p_policy_id
      and additional_insured_id is null
      and interest_type = 'additional_insured'
      and blanket = true
    order by created_at asc
    limit 1;

    if not v_want then
      if v_row_id is not null then
        delete from public.policy_bap_interests where id = v_row_id;
      end if;
      v_row_id := null;
    elsif v_row_id is null then
      insert into public.policy_bap_interests
        (policy_id, name, interest_type, blanket, waiver_of_subrogation, endorsement_form,
         endorsement_status, endorsement_confirmed_at, endorsement_confirmed_by, extraction_status)
      values
        (p_policy_id, 'Blanket per written contract', 'additional_insured', true,
         coalesce(p_subr_wvd,false), p_form, p_status, v_conf_at, v_conf_by, 'MANUAL')
      returning id into v_row_id;
    else
      update public.policy_bap_interests
        set waiver_of_subrogation = coalesce(p_subr_wvd,false),
            endorsement_form = p_form,
            endorsement_status = p_status,
            endorsement_confirmed_at = v_conf_at,
            endorsement_confirmed_by = v_conf_by,
            extraction_status = 'MANUAL'
      where id = v_row_id;
    end if;

  elsif p_line = 'umbrella' then
    select id into v_row_id
    from public.policy_umbrella_additional_insureds
    where policy_id = p_policy_id
      and additional_insured_id is null
      and ai_type = 'blanket'
    order by created_at asc
    limit 1;

    if not v_want then
      if v_row_id is not null then
        delete from public.policy_umbrella_additional_insureds where id = v_row_id;
      end if;
      v_row_id := null;
    elsif v_row_id is null then
      insert into public.policy_umbrella_additional_insureds
        (policy_id, name, ai_type, waiver_of_subrogation, endorsement_form,
         endorsement_status, endorsement_confirmed_at, endorsement_confirmed_by, extraction_status)
      values
        (p_policy_id, 'Blanket per written contract', 'blanket',
         coalesce(p_subr_wvd,false), p_form, p_status, v_conf_at, v_conf_by, 'MANUAL')
      returning id into v_row_id;
    else
      update public.policy_umbrella_additional_insureds
        set waiver_of_subrogation = coalesce(p_subr_wvd,false),
            endorsement_form = p_form,
            endorsement_status = p_status,
            endorsement_confirmed_at = v_conf_at,
            endorsement_confirmed_by = v_conf_by,
            extraction_status = 'MANUAL'
      where id = v_row_id;
    end if;

  elsif p_line = 'property' then
    select id into v_row_id
    from public.policy_property_interests
    where policy_id = p_policy_id
      and additional_insured_id is null
      and interest_type = 'additional_insured'
      and blanket = true
    order by created_at asc
    limit 1;

    if not v_want then
      if v_row_id is not null then
        delete from public.policy_property_interests where id = v_row_id;
      end if;
      v_row_id := null;
    elsif v_row_id is null then
      insert into public.policy_property_interests
        (policy_id, name, interest_type, blanket, waiver_of_subrogation, endorsement_form,
         endorsement_status, endorsement_confirmed_at, endorsement_confirmed_by, extraction_status)
      values
        (p_policy_id, 'Blanket per written contract', 'additional_insured', true,
         coalesce(p_subr_wvd,false), p_form, p_status, v_conf_at, v_conf_by, 'MANUAL')
      returning id into v_row_id;
    else
      update public.policy_property_interests
        set waiver_of_subrogation = coalesce(p_subr_wvd,false),
            endorsement_form = p_form,
            endorsement_status = p_status,
            endorsement_confirmed_at = v_conf_at,
            endorsement_confirmed_by = v_conf_by,
            extraction_status = 'MANUAL'
      where id = v_row_id;
    end if;

  elsif p_line = 'wc' then
    -- WC: no AI, no waiver_of_subrogation / extraction_status columns.
    select id into v_row_id
    from public.policy_wc_subrogation_waivers
    where policy_id = p_policy_id
      and additional_insured_id is null
      and waiver_scope = 'blanket'
    order by created_at asc
    limit 1;

    if not v_want then
      if v_row_id is not null then
        delete from public.policy_wc_subrogation_waivers where id = v_row_id;
      end if;
      v_row_id := null;
    elsif v_row_id is null then
      insert into public.policy_wc_subrogation_waivers
        (policy_id, waiver_scope, endorsement_form,
         endorsement_status, endorsement_confirmed_at, endorsement_confirmed_by)
      values
        (p_policy_id, 'blanket', coalesce(p_form, 'WC 00 03 13'),
         p_status, v_conf_at, v_conf_by)
      returning id into v_row_id;
    else
      update public.policy_wc_subrogation_waivers
        set endorsement_form = coalesce(p_form, 'WC 00 03 13'),
            endorsement_status = p_status,
            endorsement_confirmed_at = v_conf_at,
            endorsement_confirmed_by = v_conf_by
      where id = v_row_id;
    end if;
  end if;

  return jsonb_build_object('line', p_line, 'row_id', v_row_id, 'present', v_row_id is not null);
end;
$$;

-- ---------------------------------------------------------------------------
-- attach_line_scheduled_ai: attach a SPECIFIC directory additional insured to a
-- policy line (idempotent per policy+line+holder). Copies name/address from the
-- directory row and links additional_insured_id (the resolver's strongest match).
-- ---------------------------------------------------------------------------
create or replace function public.attach_line_scheduled_ai(
  p_policy_id             uuid,
  p_line                  text,
  p_additional_insured_id uuid,
  p_subr_wvd              boolean default false,
  p_status                text default 'endorsed',
  p_form                  text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ws      uuid;
  v_ai_ws   uuid;
  v_uid     uuid := auth.uid();
  v_now     timestamptz := now();
  v_name    text;
  v_a1      text;
  v_city    text;
  v_state   text;
  v_zip     text;
  v_row_id  uuid;
  v_conf_at timestamptz;
  v_conf_by uuid;
begin
  if p_line not in ('gl','auto','umbrella','wc','property') then
    raise exception 'invalid line %', p_line using errcode = '22023';
  end if;
  if p_status not in ('none','requested','endorsed') then
    raise exception 'invalid status %', p_status using errcode = '22023';
  end if;
  v_ws := public._coi_assert_policy_access(p_policy_id);

  select ai.name, ai.address_line1, ai.city, ai.state, ai.zip_code, ai.agency_workspace_id
    into v_name, v_a1, v_city, v_state, v_zip, v_ai_ws
  from public.additional_insureds ai
  where ai.id = p_additional_insured_id and ai.deleted_at is null;
  if v_name is null then
    raise exception 'additional insured % not found', p_additional_insured_id using errcode = 'P0002';
  end if;
  if v_ai_ws is distinct from v_ws then
    raise exception 'holder and policy belong to different workspaces' using errcode = '42501';
  end if;

  v_conf_at := case when p_status = 'endorsed' then v_now end;
  v_conf_by := case when p_status = 'endorsed' then v_uid end;

  if p_line = 'gl' then
    select id into v_row_id from public.policy_cgl_additional_insureds
      where policy_id = p_policy_id and additional_insured_id = p_additional_insured_id
      order by created_at asc limit 1;
    if v_row_id is null then
      insert into public.policy_cgl_additional_insureds
        (policy_id, additional_insured_id, name, street, city, state, zip, ai_type,
         waiver_of_subrogation, endorsement_form, endorsement_status,
         endorsement_confirmed_at, endorsement_confirmed_by, extraction_status)
      values
        (p_policy_id, p_additional_insured_id, v_name, v_a1, v_city, v_state, v_zip, 'both',
         coalesce(p_subr_wvd,false), p_form, p_status, v_conf_at, v_conf_by, 'MANUAL')
      returning id into v_row_id;
    else
      update public.policy_cgl_additional_insureds
        set name = v_name, street = v_a1, city = v_city, state = v_state, zip = v_zip,
            waiver_of_subrogation = coalesce(p_subr_wvd,false), endorsement_form = p_form,
            endorsement_status = p_status, endorsement_confirmed_at = v_conf_at,
            endorsement_confirmed_by = v_conf_by, extraction_status = 'MANUAL'
      where id = v_row_id;
    end if;

  elsif p_line = 'auto' then
    select id into v_row_id from public.policy_bap_interests
      where policy_id = p_policy_id and additional_insured_id = p_additional_insured_id
      order by created_at asc limit 1;
    if v_row_id is null then
      insert into public.policy_bap_interests
        (policy_id, additional_insured_id, name, address_street, address_city, address_state, address_zip,
         interest_type, blanket, waiver_of_subrogation, endorsement_form, endorsement_status,
         endorsement_confirmed_at, endorsement_confirmed_by, extraction_status)
      values
        (p_policy_id, p_additional_insured_id, v_name, v_a1, v_city, v_state, v_zip,
         'additional_insured', false, coalesce(p_subr_wvd,false), p_form, p_status,
         v_conf_at, v_conf_by, 'MANUAL')
      returning id into v_row_id;
    else
      update public.policy_bap_interests
        set name = v_name, address_street = v_a1, address_city = v_city, address_state = v_state,
            address_zip = v_zip, waiver_of_subrogation = coalesce(p_subr_wvd,false),
            endorsement_form = p_form, endorsement_status = p_status,
            endorsement_confirmed_at = v_conf_at, endorsement_confirmed_by = v_conf_by,
            extraction_status = 'MANUAL'
      where id = v_row_id;
    end if;

  elsif p_line = 'umbrella' then
    select id into v_row_id from public.policy_umbrella_additional_insureds
      where policy_id = p_policy_id and additional_insured_id = p_additional_insured_id
      order by created_at asc limit 1;
    if v_row_id is null then
      insert into public.policy_umbrella_additional_insureds
        (policy_id, additional_insured_id, name, street, city, state, zip, ai_type,
         waiver_of_subrogation, endorsement_form, endorsement_status,
         endorsement_confirmed_at, endorsement_confirmed_by, extraction_status)
      values
        (p_policy_id, p_additional_insured_id, v_name, v_a1, v_city, v_state, v_zip, 'scheduled',
         coalesce(p_subr_wvd,false), p_form, p_status, v_conf_at, v_conf_by, 'MANUAL')
      returning id into v_row_id;
    else
      update public.policy_umbrella_additional_insureds
        set name = v_name, street = v_a1, city = v_city, state = v_state, zip = v_zip,
            waiver_of_subrogation = coalesce(p_subr_wvd,false), endorsement_form = p_form,
            endorsement_status = p_status, endorsement_confirmed_at = v_conf_at,
            endorsement_confirmed_by = v_conf_by, extraction_status = 'MANUAL'
      where id = v_row_id;
    end if;

  elsif p_line = 'property' then
    select id into v_row_id from public.policy_property_interests
      where policy_id = p_policy_id and additional_insured_id = p_additional_insured_id
      order by created_at asc limit 1;
    if v_row_id is null then
      insert into public.policy_property_interests
        (policy_id, additional_insured_id, name, street, city, state, zip, interest_type,
         blanket, waiver_of_subrogation, endorsement_form, endorsement_status,
         endorsement_confirmed_at, endorsement_confirmed_by, extraction_status)
      values
        (p_policy_id, p_additional_insured_id, v_name, v_a1, v_city, v_state, v_zip, 'additional_insured',
         false, coalesce(p_subr_wvd,false), p_form, p_status, v_conf_at, v_conf_by, 'MANUAL')
      returning id into v_row_id;
    else
      update public.policy_property_interests
        set name = v_name, street = v_a1, city = v_city, state = v_state, zip = v_zip,
            waiver_of_subrogation = coalesce(p_subr_wvd,false), endorsement_form = p_form,
            endorsement_status = p_status, endorsement_confirmed_at = v_conf_at,
            endorsement_confirmed_by = v_conf_by, extraction_status = 'MANUAL'
      where id = v_row_id;
    end if;

  elsif p_line = 'wc' then
    -- WC scheduled = a specific waiver (waiver_scope='specific'); the row IS the waiver.
    select id into v_row_id from public.policy_wc_subrogation_waivers
      where policy_id = p_policy_id and additional_insured_id = p_additional_insured_id
      order by created_at asc limit 1;
    if v_row_id is null then
      insert into public.policy_wc_subrogation_waivers
        (policy_id, additional_insured_id, waiver_scope, name, street, city, state, zip,
         endorsement_form, endorsement_status, endorsement_confirmed_at, endorsement_confirmed_by)
      values
        (p_policy_id, p_additional_insured_id, 'specific', v_name, v_a1, v_city, v_state, v_zip,
         p_form, p_status, v_conf_at, v_conf_by)
      returning id into v_row_id;
    else
      update public.policy_wc_subrogation_waivers
        set name = v_name, street = v_a1, city = v_city, state = v_state, zip = v_zip,
            endorsement_form = p_form, endorsement_status = p_status,
            endorsement_confirmed_at = v_conf_at, endorsement_confirmed_by = v_conf_by
      where id = v_row_id;
    end if;
  end if;

  return jsonb_build_object('line', p_line, 'row_id', v_row_id,
                            'additional_insured_id', p_additional_insured_id, 'name', v_name);
end;
$$;

-- ---------------------------------------------------------------------------
-- set_line_endorsement_row: flip status / waiver / form on ONE existing row
-- (blanket or scheduled), identified by line + row id. Null args are left as-is.
-- ---------------------------------------------------------------------------
create or replace function public.set_line_endorsement_row(
  p_line     text,
  p_row_id   uuid,
  p_status   text default null,
  p_subr_wvd boolean default null,
  p_form     text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_policy_id uuid;
  v_ws        uuid;
  v_uid       uuid := auth.uid();
  v_now       timestamptz := now();
  v_status    text;
  v_conf_at   timestamptz;
  v_conf_by   uuid;
begin
  if p_line not in ('gl','auto','umbrella','wc','property') then
    raise exception 'invalid line %', p_line using errcode = '22023';
  end if;
  if p_status is not null and p_status not in ('none','requested','endorsed') then
    raise exception 'invalid status %', p_status using errcode = '22023';
  end if;

  if p_line = 'gl' then
    select policy_id into v_policy_id from public.policy_cgl_additional_insureds where id = p_row_id;
  elsif p_line = 'auto' then
    select policy_id into v_policy_id from public.policy_bap_interests where id = p_row_id;
  elsif p_line = 'umbrella' then
    select policy_id into v_policy_id from public.policy_umbrella_additional_insureds where id = p_row_id;
  elsif p_line = 'wc' then
    select policy_id into v_policy_id from public.policy_wc_subrogation_waivers where id = p_row_id;
  elsif p_line = 'property' then
    select policy_id into v_policy_id from public.policy_property_interests where id = p_row_id;
  end if;
  if v_policy_id is null then
    raise exception 'endorsement row % not found on line %', p_row_id, p_line using errcode = 'P0002';
  end if;
  v_ws := public._coi_assert_policy_access(v_policy_id);

  -- Resolve the status we will end at (for confirmed_at/by stamping).
  v_status := coalesce(p_status,
    case p_line
      when 'gl'       then (select endorsement_status from public.policy_cgl_additional_insureds where id = p_row_id)
      when 'auto'     then (select endorsement_status from public.policy_bap_interests where id = p_row_id)
      when 'umbrella' then (select endorsement_status from public.policy_umbrella_additional_insureds where id = p_row_id)
      when 'wc'       then (select endorsement_status from public.policy_wc_subrogation_waivers where id = p_row_id)
      when 'property' then (select endorsement_status from public.policy_property_interests where id = p_row_id)
    end);
  v_conf_at := case when v_status = 'endorsed' then v_now end;
  v_conf_by := case when v_status = 'endorsed' then v_uid end;

  if p_line = 'gl' then
    update public.policy_cgl_additional_insureds
      set endorsement_status = coalesce(p_status, endorsement_status),
          waiver_of_subrogation = coalesce(p_subr_wvd, waiver_of_subrogation),
          endorsement_form = coalesce(p_form, endorsement_form),
          endorsement_confirmed_at = v_conf_at, endorsement_confirmed_by = v_conf_by
    where id = p_row_id;
  elsif p_line = 'auto' then
    update public.policy_bap_interests
      set endorsement_status = coalesce(p_status, endorsement_status),
          waiver_of_subrogation = coalesce(p_subr_wvd, waiver_of_subrogation),
          endorsement_form = coalesce(p_form, endorsement_form),
          endorsement_confirmed_at = v_conf_at, endorsement_confirmed_by = v_conf_by
    where id = p_row_id;
  elsif p_line = 'umbrella' then
    update public.policy_umbrella_additional_insureds
      set endorsement_status = coalesce(p_status, endorsement_status),
          waiver_of_subrogation = coalesce(p_subr_wvd, waiver_of_subrogation),
          endorsement_form = coalesce(p_form, endorsement_form),
          endorsement_confirmed_at = v_conf_at, endorsement_confirmed_by = v_conf_by
    where id = p_row_id;
  elsif p_line = 'wc' then
    update public.policy_wc_subrogation_waivers
      set endorsement_status = coalesce(p_status, endorsement_status),
          endorsement_form = coalesce(p_form, endorsement_form),
          endorsement_confirmed_at = v_conf_at, endorsement_confirmed_by = v_conf_by
    where id = p_row_id;
  elsif p_line = 'property' then
    update public.policy_property_interests
      set endorsement_status = coalesce(p_status, endorsement_status),
          waiver_of_subrogation = coalesce(p_subr_wvd, waiver_of_subrogation),
          endorsement_form = coalesce(p_form, endorsement_form),
          endorsement_confirmed_at = v_conf_at, endorsement_confirmed_by = v_conf_by
    where id = p_row_id;
  end if;

  return jsonb_build_object('line', p_line, 'row_id', p_row_id, 'status', v_status);
end;
$$;

-- ---------------------------------------------------------------------------
-- remove_line_endorsement_row: delete ONE endorsement row (blanket or scheduled).
-- ---------------------------------------------------------------------------
create or replace function public.remove_line_endorsement_row(
  p_line   text,
  p_row_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_policy_id uuid;
begin
  if p_line not in ('gl','auto','umbrella','wc','property') then
    raise exception 'invalid line %', p_line using errcode = '22023';
  end if;

  if p_line = 'gl' then
    select policy_id into v_policy_id from public.policy_cgl_additional_insureds where id = p_row_id;
  elsif p_line = 'auto' then
    select policy_id into v_policy_id from public.policy_bap_interests where id = p_row_id;
  elsif p_line = 'umbrella' then
    select policy_id into v_policy_id from public.policy_umbrella_additional_insureds where id = p_row_id;
  elsif p_line = 'wc' then
    select policy_id into v_policy_id from public.policy_wc_subrogation_waivers where id = p_row_id;
  elsif p_line = 'property' then
    select policy_id into v_policy_id from public.policy_property_interests where id = p_row_id;
  end if;
  if v_policy_id is null then
    return jsonb_build_object('line', p_line, 'row_id', p_row_id, 'removed', false);
  end if;
  perform public._coi_assert_policy_access(v_policy_id);

  if p_line = 'gl' then
    delete from public.policy_cgl_additional_insureds where id = p_row_id;
  elsif p_line = 'auto' then
    delete from public.policy_bap_interests where id = p_row_id;
  elsif p_line = 'umbrella' then
    delete from public.policy_umbrella_additional_insureds where id = p_row_id;
  elsif p_line = 'wc' then
    delete from public.policy_wc_subrogation_waivers where id = p_row_id;
  elsif p_line = 'property' then
    delete from public.policy_property_interests where id = p_row_id;
  end if;

  return jsonb_build_object('line', p_line, 'row_id', p_row_id, 'removed', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- get_line_endorsements: the current endorsement picture for one (policy, line),
-- in a uniform shape the editor renders directly. `blanket` is the singleton
-- blanket-signature row (null when absent); `scheduled` is every other row.
-- ---------------------------------------------------------------------------
create or replace function public.get_line_endorsements(
  p_policy_id uuid,
  p_line      text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_ws        uuid;
  v_blanket   jsonb := null;
  v_scheduled jsonb := '[]'::jsonb;
begin
  if p_line not in ('gl','auto','umbrella','wc','property') then
    raise exception 'invalid line %', p_line using errcode = '22023';
  end if;
  v_ws := public._coi_assert_policy_access(p_policy_id);

  if p_line = 'gl' then
    select jsonb_build_object(
             'present', true, 'row_id', id, 'status', endorsement_status,
             'addl_insd', true, 'subr_wvd', coalesce(waiver_of_subrogation,false),
             'endorsement_form', endorsement_form,
             'is_manual', extraction_status = 'MANUAL')
      into v_blanket
    from public.policy_cgl_additional_insureds
    where policy_id = p_policy_id and additional_insured_id is null
      and ai_type = 'owners_lessees_contractors'
    order by created_at asc limit 1;

    select coalesce(jsonb_agg(jsonb_build_object(
             'row_id', id, 'additional_insured_id', additional_insured_id, 'name', name,
             'status', endorsement_status, 'subr_wvd', coalesce(waiver_of_subrogation,false),
             'endorsement_form', endorsement_form,
             'is_manual', extraction_status = 'MANUAL',
             'has_evidence', coalesce(cardinality(evidence_ids),0) > 0)
             order by created_at asc), '[]'::jsonb)
      into v_scheduled
    from public.policy_cgl_additional_insureds
    where policy_id = p_policy_id
      and not (additional_insured_id is null and ai_type = 'owners_lessees_contractors');

  elsif p_line = 'auto' then
    select jsonb_build_object(
             'present', true, 'row_id', id, 'status', endorsement_status,
             'addl_insd', true, 'subr_wvd', coalesce(waiver_of_subrogation,false),
             'endorsement_form', endorsement_form,
             'is_manual', extraction_status = 'MANUAL')
      into v_blanket
    from public.policy_bap_interests
    where policy_id = p_policy_id and additional_insured_id is null
      and interest_type = 'additional_insured' and blanket = true
    order by created_at asc limit 1;

    select coalesce(jsonb_agg(jsonb_build_object(
             'row_id', id, 'additional_insured_id', additional_insured_id, 'name', name,
             'status', endorsement_status, 'subr_wvd', coalesce(waiver_of_subrogation,false),
             'endorsement_form', endorsement_form,
             'is_manual', extraction_status = 'MANUAL',
             'has_evidence', coalesce(cardinality(evidence_ids),0) > 0)
             order by created_at asc), '[]'::jsonb)
      into v_scheduled
    from public.policy_bap_interests
    where policy_id = p_policy_id
      and interest_type = 'additional_insured'
      and not (additional_insured_id is null and blanket = true);

  elsif p_line = 'umbrella' then
    select jsonb_build_object(
             'present', true, 'row_id', id, 'status', endorsement_status,
             'addl_insd', true, 'subr_wvd', coalesce(waiver_of_subrogation,false),
             'endorsement_form', endorsement_form,
             'is_manual', extraction_status = 'MANUAL')
      into v_blanket
    from public.policy_umbrella_additional_insureds
    where policy_id = p_policy_id and additional_insured_id is null and ai_type = 'blanket'
    order by created_at asc limit 1;

    select coalesce(jsonb_agg(jsonb_build_object(
             'row_id', id, 'additional_insured_id', additional_insured_id, 'name', name,
             'status', endorsement_status, 'subr_wvd', coalesce(waiver_of_subrogation,false),
             'endorsement_form', endorsement_form, 'ai_type', ai_type,
             'is_manual', extraction_status = 'MANUAL',
             'has_evidence', coalesce(cardinality(evidence_ids),0) > 0)
             order by created_at asc), '[]'::jsonb)
      into v_scheduled
    from public.policy_umbrella_additional_insureds
    where policy_id = p_policy_id
      and not (additional_insured_id is null and ai_type = 'blanket');

  elsif p_line = 'property' then
    select jsonb_build_object(
             'present', true, 'row_id', id, 'status', endorsement_status,
             'addl_insd', true, 'subr_wvd', coalesce(waiver_of_subrogation,false),
             'endorsement_form', endorsement_form,
             'is_manual', extraction_status = 'MANUAL')
      into v_blanket
    from public.policy_property_interests
    where policy_id = p_policy_id and additional_insured_id is null
      and interest_type = 'additional_insured' and blanket = true
    order by created_at asc limit 1;

    select coalesce(jsonb_agg(jsonb_build_object(
             'row_id', id, 'additional_insured_id', additional_insured_id, 'name', name,
             'status', endorsement_status, 'subr_wvd', coalesce(waiver_of_subrogation,false),
             'endorsement_form', endorsement_form,
             'is_manual', extraction_status = 'MANUAL',
             'has_evidence', coalesce(cardinality(evidence_ids),0) > 0)
             order by created_at asc), '[]'::jsonb)
      into v_scheduled
    from public.policy_property_interests
    where policy_id = p_policy_id
      and interest_type = 'additional_insured'
      and not (additional_insured_id is null and blanket = true);

  elsif p_line = 'wc' then
    select jsonb_build_object(
             'present', true, 'row_id', id, 'status', endorsement_status,
             'addl_insd', false, 'subr_wvd', true,
             'endorsement_form', endorsement_form, 'is_manual', true)
      into v_blanket
    from public.policy_wc_subrogation_waivers
    where policy_id = p_policy_id and additional_insured_id is null and waiver_scope = 'blanket'
    order by created_at asc limit 1;

    select coalesce(jsonb_agg(jsonb_build_object(
             'row_id', id, 'additional_insured_id', additional_insured_id, 'name', name,
             'status', endorsement_status, 'subr_wvd', true,
             'endorsement_form', endorsement_form, 'is_manual', true, 'has_evidence', false)
             order by created_at asc), '[]'::jsonb)
      into v_scheduled
    from public.policy_wc_subrogation_waivers
    where policy_id = p_policy_id
      and not (additional_insured_id is null and waiver_scope = 'blanket');
  end if;

  return jsonb_build_object(
    'line', p_line,
    'blanket', v_blanket,
    'scheduled', v_scheduled);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: staff-only via the internal is_staff()/is_agency_member() guards.
-- Revoke from anon/public; execute to authenticated (the app's signed-in role).
-- ---------------------------------------------------------------------------
revoke all on function public._coi_assert_policy_access(uuid) from public, anon;
revoke all on function public.set_line_blanket_endorsement(uuid,text,boolean,boolean,text,text) from public, anon;
revoke all on function public.attach_line_scheduled_ai(uuid,text,uuid,boolean,text,text) from public, anon;
revoke all on function public.set_line_endorsement_row(text,uuid,text,boolean,text) from public, anon;
revoke all on function public.remove_line_endorsement_row(text,uuid) from public, anon;
revoke all on function public.get_line_endorsements(uuid,text) from public, anon;

grant execute on function public.set_line_blanket_endorsement(uuid,text,boolean,boolean,text,text) to authenticated;
grant execute on function public.attach_line_scheduled_ai(uuid,text,uuid,boolean,text,text) to authenticated;
grant execute on function public.set_line_endorsement_row(text,uuid,text,boolean,text) to authenticated;
grant execute on function public.remove_line_endorsement_row(text,uuid) to authenticated;
grant execute on function public.get_line_endorsements(uuid,text) to authenticated;
