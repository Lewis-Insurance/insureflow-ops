-- Persist claims-made and defense-inside-limits on booked quote options.

create or replace function public.apply_extract_writeback_proposal(p_proposal_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_proposal record;
  v_payload jsonb;
  v_quote jsonb;
  v_options jsonb;
  v_coverages jsonb;
  v_quote_id uuid;
  v_document_id uuid;
  v_submission_id uuid;
  v_line text;
  v_lob text;
  v_carrier text;
  v_premium numeric;
  v_each_occurrence numeric;
  v_general_aggregate numeric;
  v_property_limit numeric;
  v_el_each_accident numeric;
  v_el_disease_each_employee numeric;
  v_el_disease_policy_limit numeric;
  v_umb_per_occurrence numeric;
  v_umb_aggregate numeric;
  v_auto_csl numeric;
  v_cov jsonb;
  v_cov_type text;
  v_limit numeric;
begin
  if not public.is_staff() then
    raise exception 'staff only';
  end if;

  select p.*, a.agency_workspace_id
  into v_proposal
  from public.extract_writeback_proposals p
  join public.accounts a on a.id = p.account_id
  where p.id = p_proposal_id
  for update of p;

  if not found then
    raise exception 'proposal not found';
  end if;

  if not public.is_agency_member(v_proposal.agency_workspace_id) then
    raise exception 'proposal not accessible';
  end if;

  if v_proposal.status = 'applied' and v_proposal.quote_id is not null then
    return v_proposal.quote_id;
  end if;

  if v_proposal.status <> 'pending' then
    raise exception 'proposal is % - only pending proposals can be applied', v_proposal.status;
  end if;

  v_payload := v_proposal.proposed_quote;
  v_quote := v_payload->'quote';
  v_options := coalesce(v_quote->'options', '{}'::jsonb);
  v_coverages := coalesce(v_payload->'quote_coverages', '[]'::jsonb);
  v_carrier := coalesce(nullif(btrim(v_options->>'carrier_name'), ''), v_proposal.carrier_name);
  v_premium := nullif(v_quote->>'premium', '')::numeric;

  if v_proposal.line_class = 'personal' then
    v_lob := coalesce(v_quote->>'line_of_business', 'auto');

    insert into public.quotes (
      account_id,
      quote_ref,
      line_of_business,
      premium,
      expires_at,
      status,
      competitor_carrier,
      options,
      created_by,
      updated_by,
      quoted_at
    )
    values (
      v_proposal.account_id,
      nullif(btrim(v_quote->>'quote_ref'), ''),
      v_lob::public.line_of_business,
      v_premium,
      nullif(v_quote->>'expires_at', '')::date,
      'open',
      btrim(v_carrier),
      jsonb_build_object(
        'carrier_name', btrim(v_carrier),
        'effective_date', v_options->'effective_date',
        'premium_frequency', v_options->'premium_frequency',
        'fees', coalesce(v_options->'fees', '[]'::jsonb),
        'commission_pct', v_options->'commission_pct',
        'commission_amount', v_options->'commission_amount',
        'claims_made', v_options->'claims_made',
        'defense_inside_limits', v_options->'defense_inside_limits'
      ),
      auth.uid(),
      auth.uid(),
      now()
    )
    returning id into v_quote_id;

    insert into public.quote_coverages (
      quote_id,
      coverage_type,
      limit_amount,
      deductible_amount,
      premium_amount,
      is_included,
      extracted_from_document
    )
    select
      v_quote_id,
      nullif(btrim(cov->>'coverage_type'), ''),
      nullif(btrim(cov->>'limit_amount'), ''),
      nullif(btrim(cov->>'deductible_amount'), ''),
      nullif(cov->>'premium_amount', '')::numeric,
      coalesce((cov->>'is_included')::boolean, true),
      coalesce((cov->>'extracted_from_document')::boolean, true)
    from jsonb_array_elements(v_coverages) as cov
    where nullif(btrim(cov->>'coverage_type'), '') is not null;

  else
    v_lob := coalesce(v_quote->>'line_of_business', 'gl');
    v_line := case v_lob
      when 'workers_comp' then 'wc'
      when 'commercial_auto' then 'auto'
      when 'bop' then 'gl'
      when 'property' then 'property'
      when 'umbrella' then 'umbrella'
      when 'gl' then 'gl'
      else 'gl'
    end;

    for v_cov in select value from jsonb_array_elements(v_coverages)
    loop
      v_cov_type := lower(coalesce(v_cov->>'coverage_type', ''));
      v_limit := nullif(
        regexp_replace(coalesce(nullif(btrim(v_cov->>'limit_amount'), ''), ''), '[^0-9.-]', '', 'g'),
        ''
      )::numeric;

      if v_limit is null then
        continue;
      end if;

      if v_cov_type ~ '(^|_)gl_each_occurrence($|_)'
        or v_cov_type ~ 'each_occurrence'
        or (v_cov_type ~ 'general_liability' and v_cov_type !~ 'aggregate') then
        v_each_occurrence := coalesce(v_each_occurrence, v_limit);
      elsif v_cov_type ~ '(^|_)gl_general_aggregate($|_)'
        or v_cov_type ~ 'general_aggregate'
        or (v_cov_type ~ 'general_liability' and v_cov_type ~ 'aggregate') then
        v_general_aggregate := coalesce(v_general_aggregate, v_limit);
      elsif v_cov_type ~ '(^|_)property_limit($|_)'
        or (v_line = 'property' and v_cov_type ~ 'property') then
        v_property_limit := coalesce(v_property_limit, v_limit);
      elsif v_cov_type ~ '(^|_)wc_el_each_accident($|_)'
        or (v_line = 'wc' and v_cov_type ~ 'each_accident') then
        v_el_each_accident := coalesce(v_el_each_accident, v_limit);
      elsif v_cov_type ~ '(^|_)wc_el_disease_each_employee($|_)'
        or (v_line = 'wc' and v_cov_type ~ 'disease_each_employee') then
        v_el_disease_each_employee := coalesce(v_el_disease_each_employee, v_limit);
      elsif v_cov_type ~ '(^|_)wc_el_disease_policy_limit($|_)'
        or (v_line = 'wc' and v_cov_type ~ 'disease_policy') then
        v_el_disease_policy_limit := coalesce(v_el_disease_policy_limit, v_limit);
      elsif v_cov_type ~ '(^|_)umbrella_per_occurrence($|_)'
        or (v_line = 'umbrella' and v_cov_type ~ 'per_occurrence') then
        v_umb_per_occurrence := coalesce(v_umb_per_occurrence, v_limit);
      elsif v_cov_type ~ '(^|_)umbrella_aggregate($|_)'
        or (v_line = 'umbrella' and v_cov_type ~ 'aggregate') then
        v_umb_aggregate := coalesce(v_umb_aggregate, v_limit);
      elsif v_cov_type ~ '(^|_)auto_csl($|_)'
        or (v_line = 'auto' and v_cov_type ~ 'csl') then
        v_auto_csl := coalesce(v_auto_csl, v_limit);
      end if;
    end loop;

    select cs.id
    into v_submission_id
    from public.commercial_submissions cs
    where cs.account_id = v_proposal.account_id
      and cs.status = 'draft'
      and cs.deleted_at is null
    order by cs.created_at desc
    limit 1;

    if v_submission_id is null then
      insert into public.commercial_submissions (account_id)
      values (v_proposal.account_id)
      returning id into v_submission_id;
    end if;

    v_quote_id := public.add_submission_quote(
      v_submission_id,
      btrim(v_carrier),
      v_premium,
      v_each_occurrence,
      v_general_aggregate,
      v_line,
      v_property_limit,
      v_el_each_accident,
      v_el_disease_each_employee,
      v_el_disease_policy_limit,
      v_umb_per_occurrence,
      v_umb_aggregate,
      v_auto_csl
    );

    update public.quotes q
    set options = coalesce(q.options, '{}'::jsonb) || jsonb_build_object(
      'carrier_name', coalesce(q.options->>'carrier_name', btrim(v_carrier)),
      'effective_date', v_options->'effective_date',
      'premium_frequency', v_options->'premium_frequency',
      'fees', coalesce(v_options->'fees', '[]'::jsonb),
      'commission_pct', v_options->'commission_pct',
      'commission_amount', v_options->'commission_amount',
      'claims_made', v_options->'claims_made',
      'defense_inside_limits', v_options->'defense_inside_limits'
    ),
    updated_by = auth.uid(),
    updated_at = now()
    where q.id = v_quote_id;
  end if;

  update public.extract_writeback_proposals
  set
    status = 'applied',
    quote_id = v_quote_id,
    applied_at = now(),
    applied_by = auth.uid()
  where id = p_proposal_id;

  select da.document_id
  into v_document_id
  from public.document_analysis da
  where da.id = v_proposal.document_analysis_id;

  if v_document_id is not null then
    update public.documents d
    set
      account_id = v_proposal.account_id,
      updated_at = now()
    where d.id = v_document_id
      and (d.account_id is null or d.account_id = v_proposal.account_id);
  end if;

  insert into public.audit_logs (user_id, action, entity, entity_id, details)
  values (
    auth.uid(),
    'extract_writeback_applied',
    'extract_writeback_proposals',
    p_proposal_id,
    jsonb_build_object(
      'quote_id', v_quote_id,
      'account_id', v_proposal.account_id,
      'carrier_name', v_proposal.carrier_name,
      'line_class', v_proposal.line_class
    )
  );

  return v_quote_id;
end;
$$;
