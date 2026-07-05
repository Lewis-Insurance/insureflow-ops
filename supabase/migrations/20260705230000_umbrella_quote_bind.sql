-- ============================================================================
-- Phase 5 Excess/Umbrella: line-aware quote/bind extension
-- ============================================================================
-- Adds 'umbrella' to the atomic submission RPCs (enum label 'umbrella' is
-- valid on quotes.line_of_business - no mapping needed; 'wc' keeps its
-- workers_comp mapping). Old signatures DROPPED first (overload safety);
-- new params default null so gl/property/wc callers are unchanged.
-- Umbrella bind requires per-occurrence (the line's only required_for_ready
-- field on the COI registry, verified live: umbrella_details.limits.
-- per_occurrence) and writes the aggregate too when provided.

drop function if exists public.add_submission_quote(uuid, text, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric);
create or replace function public.add_submission_quote(
  p_submission_id uuid,
  p_carrier_name text,
  p_premium numeric default null,
  p_each_occurrence numeric default null,
  p_general_aggregate numeric default null,
  p_line text default 'gl',
  p_property_limit numeric default null,
  p_el_each_accident numeric default null,
  p_el_disease_each_employee numeric default null,
  p_el_disease_policy_limit numeric default null,
  p_umb_per_occurrence numeric default null,
  p_umb_aggregate numeric default null
) returns uuid
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_sub record;
  v_quote_id uuid;
  v_lob public.line_of_business;
begin
  if p_line not in ('gl','property','wc') then raise exception 'unsupported line %', p_line; end if;
  -- Module line key -> enum label ('wc' is 'workers_comp' in the enum).
  v_lob := (case p_line when 'wc' then 'workers_comp' else p_line end)::public.line_of_business;

  select * into v_sub from public.commercial_submissions
  where id = p_submission_id and deleted_at is null;
  if v_sub.id is null then raise exception 'submission not found'; end if;
  if not (public.is_staff() and public.is_agency_member(v_sub.agency_workspace_id)) then
    raise exception 'staff only';
  end if;
  if nullif(btrim(coalesce(p_carrier_name,'')),'') is null then
    raise exception 'carrier name required';
  end if;

  insert into public.quotes (account_id, submission_id, line_of_business, premium, status, quoted_at, options, created_by)
  values (v_sub.account_id, p_submission_id, v_lob, p_premium, 'open', now(),
          jsonb_build_object('carrier_name', btrim(p_carrier_name)), auth.uid())
  returning id into v_quote_id;

  if p_line = 'gl' then
    if p_each_occurrence is not null then
      insert into public.quote_coverages (quote_id, coverage_type, limit_amount)
      values (v_quote_id, 'gl_each_occurrence', p_each_occurrence);
    end if;
    if p_general_aggregate is not null then
      insert into public.quote_coverages (quote_id, coverage_type, limit_amount)
      values (v_quote_id, 'gl_general_aggregate', p_general_aggregate);
    end if;
  elsif p_line = 'property' then
    if p_property_limit is not null then
      insert into public.quote_coverages (quote_id, coverage_type, limit_amount)
      values (v_quote_id, 'property_limit', p_property_limit);
    end if;
  elsif p_line = 'wc' then
    if p_el_each_accident is not null then
      insert into public.quote_coverages (quote_id, coverage_type, limit_amount)
      values (v_quote_id, 'wc_el_each_accident', p_el_each_accident);
    end if;
    if p_el_disease_each_employee is not null then
      insert into public.quote_coverages (quote_id, coverage_type, limit_amount)
      values (v_quote_id, 'wc_el_disease_each_employee', p_el_disease_each_employee);
    end if;
    if p_el_disease_policy_limit is not null then
      insert into public.quote_coverages (quote_id, coverage_type, limit_amount)
      values (v_quote_id, 'wc_el_disease_policy_limit', p_el_disease_policy_limit);
    end if;
  else
    if p_umb_per_occurrence is not null then
      insert into public.quote_coverages (quote_id, coverage_type, limit_amount)
      values (v_quote_id, 'umbrella_per_occurrence', p_umb_per_occurrence);
    end if;
    if p_umb_aggregate is not null then
      insert into public.quote_coverages (quote_id, coverage_type, limit_amount)
      values (v_quote_id, 'umbrella_aggregate', p_umb_aggregate);
    end if;
  end if;

  update public.commercial_submissions
  set status = 'quoted'
  where id = p_submission_id
    and status in ('draft','intake','packet_ready','signing','submitted');

  return v_quote_id;
end; $$;
comment on function public.add_submission_quote(uuid, text, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric) is
  'Atomic quote capture on a commercial submission, line-aware (gl | property | wc | umbrella). Staff + workspace gated inside; SECURITY DEFINER.';
revoke execute on function public.add_submission_quote(uuid, text, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric) from anon, public;
grant  execute on function public.add_submission_quote(uuid, text, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric) to authenticated;

drop function if exists public.bind_submission_quote(uuid, uuid, numeric, numeric, text, numeric, text, numeric, numeric, numeric);
create or replace function public.bind_submission_quote(
  p_quote_id uuid,
  p_policy_id uuid,
  p_each_occurrence numeric default null,
  p_general_aggregate numeric default null,
  p_line text default 'gl',
  p_property_limit numeric default null,
  p_property_description text default null,
  p_el_each_accident numeric default null,
  p_el_disease_each_employee numeric default null,
  p_el_disease_policy_limit numeric default null,
  p_umb_per_occurrence numeric default null,
  p_umb_aggregate numeric default null
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_quote record;
  v_sub record;
  v_save jsonb;
  v_updates jsonb;
  v_quote_line text;
begin
  if p_line not in ('gl','property','wc','umbrella') then raise exception 'unsupported line %', p_line; end if;
  select * into v_quote from public.quotes
  where id = p_quote_id and deleted_at is null;
  if v_quote.id is null then raise exception 'quote not found'; end if;
  if v_quote.submission_id is null then raise exception 'quote is not linked to a submission'; end if;

  select * into v_sub from public.commercial_submissions
  where id = v_quote.submission_id and deleted_at is null
  for update;
  if v_sub.id is null then raise exception 'submission not found'; end if;
  if not (public.is_staff() and public.is_agency_member(v_sub.agency_workspace_id)) then
    raise exception 'staff only';
  end if;
  if v_sub.status = 'bound' then raise exception 'submission is already bound'; end if;
  if v_quote.status <> 'open' then raise exception 'quote is % - only open quotes can bind', v_quote.status; end if;
  -- Bind line derived from the QUOTE, never trusted from the client. The
  -- enum stores 'workers_comp' where the module key is 'wc' - normalize.
  v_quote_line := case v_quote.line_of_business::text when 'workers_comp' then 'wc' else v_quote.line_of_business::text end;
  if v_quote_line <> p_line then
    raise exception 'quote is a % quote - cannot bind it as %', v_quote.line_of_business, p_line;
  end if;
  if not exists (
    select 1 from public.policies p
    where p.id = p_policy_id and p.account_id = v_sub.account_id and p.deleted_at is null
  ) then
    raise exception 'policy does not belong to this submission''s account';
  end if;

  if p_line = 'gl' then
    if p_each_occurrence is null or p_general_aggregate is null then
      raise exception 'both GL limits (each occurrence, general aggregate) are required to bind';
    end if;
    v_updates := jsonb_build_object(
      'cgl_details.limits.each_occurrence',  p_each_occurrence,
      'cgl_details.limits.general_aggregate', p_general_aggregate
    );
  elsif p_line = 'property' then
    if p_property_limit is null then
      raise exception 'the property limit is required to bind';
    end if;
    v_updates := jsonb_build_object(
      'property_details.coi_summary.limit_amount', p_property_limit,
      'property_details.coi_summary.label', 'Commercial Property'
    );
    if nullif(btrim(coalesce(p_property_description,'')),'') is not null then
      v_updates := v_updates || jsonb_build_object(
        'property_details.coi_summary.limit_description', btrim(p_property_description)
      );
    end if;
  else
    -- All three EL limits are the WC line's required_for_ready trio.
    if p_el_each_accident is null or p_el_disease_each_employee is null or p_el_disease_policy_limit is null then
      raise exception 'all three WC employers liability limits are required to bind';
    end if;
    v_updates := jsonb_build_object(
      'wc_details.coverage.part_two_employers_liability.each_accident', p_el_each_accident,
      'wc_details.coverage.part_two_employers_liability.disease_each_employee', p_el_disease_each_employee,
      'wc_details.coverage.part_two_employers_liability.disease_policy_limit', p_el_disease_policy_limit
    );
  end if;

  v_save := public.save_master_coi_fields(p_policy_id, v_updates);
  if coalesce(jsonb_array_length(v_save->'rejected'), 0) > 0 then
    raise exception 'COI field write rejected: %', v_save->'rejected';
  end if;

  update public.quotes set status = 'won' where id = p_quote_id;
  update public.quotes set status = 'lost'
  where submission_id = v_sub.id and id <> p_quote_id and status = 'open';

  insert into public.submission_events (submission_id, action, actor_id, metadata)
  values (v_sub.id, 'bound', auth.uid(), jsonb_build_object(
    'quote_id', p_quote_id, 'policy_id', p_policy_id, 'line', p_line) || v_updates);

  update public.commercial_submissions set status = 'bound' where id = v_sub.id;

  return jsonb_build_object('quote_id', p_quote_id, 'policy_id', p_policy_id, 'line', p_line, 'save_result', v_save);
end; $$;
comment on function public.bind_submission_quote(uuid, uuid, numeric, numeric, text, numeric, text, numeric, numeric, numeric, numeric, numeric) is
  'Atomic line-aware bind (gl | property | wc | umbrella): line derived from the quote, line-required limits enforced, save_master_coi_fields rejections fail the bind, won/lost + event + bound in one transaction under a submission row lock. Staff + workspace gated; SECURITY DEFINER.';
revoke execute on function public.bind_submission_quote(uuid, uuid, numeric, numeric, text, numeric, text, numeric, numeric, numeric, numeric, numeric) from anon, public;
grant  execute on function public.bind_submission_quote(uuid, uuid, numeric, numeric, text, numeric, text, numeric, numeric, numeric, numeric, numeric) to authenticated;

