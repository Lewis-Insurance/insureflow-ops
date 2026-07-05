-- ============================================================================
-- Phase 3 Property: line-aware quote capture + bind (SOW v3 Phase 3)
-- ============================================================================
-- Extends the atomic submission RPCs beyond GL. The old signatures are
-- DROPPED first (CREATE OR REPLACE with more args would create an overload
-- and break PostgREST rpc resolution); the new ones default p_line='gl' and
-- keep the original named parameters, so existing GL callers are unchanged.
--
-- Property write-through targets the property line's COI registry paths
-- (verified live): property_details.coi_summary.limit_amount / label /
-- limit_description. Property has no required_for_ready fields, but a bind
-- without its limit would close the file without the value the feature
-- exists to propagate - so the property limit is required at bind, mirroring
-- the GL rule.

drop function if exists public.add_submission_quote(uuid, text, numeric, numeric, numeric);
create or replace function public.add_submission_quote(
  p_submission_id uuid,
  p_carrier_name text,
  p_premium numeric default null,
  p_each_occurrence numeric default null,
  p_general_aggregate numeric default null,
  p_line text default 'gl',
  p_property_limit numeric default null
) returns uuid
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_sub record;
  v_quote_id uuid;
begin
  if p_line not in ('gl','property') then raise exception 'unsupported line %', p_line; end if;
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
  values (v_sub.account_id, p_submission_id, p_line::public.line_of_business, p_premium, 'open', now(),
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
  else
    if p_property_limit is not null then
      insert into public.quote_coverages (quote_id, coverage_type, limit_amount)
      values (v_quote_id, 'property_limit', p_property_limit);
    end if;
  end if;

  update public.commercial_submissions
  set status = 'quoted'
  where id = p_submission_id
    and status in ('draft','intake','packet_ready','signing','submitted');

  return v_quote_id;
end; $$;
comment on function public.add_submission_quote(uuid, text, numeric, numeric, numeric, text, numeric) is
  'Atomic quote capture on a commercial submission, line-aware (gl | property). Staff + workspace gated inside; SECURITY DEFINER.';
revoke execute on function public.add_submission_quote(uuid, text, numeric, numeric, numeric, text, numeric) from anon, public;
grant  execute on function public.add_submission_quote(uuid, text, numeric, numeric, numeric, text, numeric) to authenticated;

drop function if exists public.bind_submission_quote(uuid, uuid, numeric, numeric);
create or replace function public.bind_submission_quote(
  p_quote_id uuid,
  p_policy_id uuid,
  p_each_occurrence numeric default null,
  p_general_aggregate numeric default null,
  p_line text default 'gl',
  p_property_limit numeric default null,
  p_property_description text default null
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_quote record;
  v_sub record;
  v_save jsonb;
  v_updates jsonb;
begin
  if p_line not in ('gl','property') then raise exception 'unsupported line %', p_line; end if;
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
  -- The bind line is derived from the QUOTE, not trusted from the client: a
  -- mismatch would write the wrong line's COI paths (review fix).
  if v_quote.line_of_business::text <> p_line then
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
  else
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
comment on function public.bind_submission_quote(uuid, uuid, numeric, numeric, text, numeric, text) is
  'Atomic line-aware bind (gl | property): tenancy validated, line-required limits enforced, save_master_coi_fields rejections fail the bind, won/lost + event + bound in one transaction under a submission row lock. Staff + workspace gated inside; SECURITY DEFINER.';
revoke execute on function public.bind_submission_quote(uuid, uuid, numeric, numeric, text, numeric, text) from anon, public;
grant  execute on function public.bind_submission_quote(uuid, uuid, numeric, numeric, text, numeric, text) to authenticated;
