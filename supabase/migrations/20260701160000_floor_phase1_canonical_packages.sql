-- Phase 1: public.* canonical decision packages; hermes.decision_packages = Slack delivery projection.
-- ADR 002. Requires Spine A tables (20260701010000) applied on dev before this migration runs.
-- hermes_app invokes SECURITY DEFINER helpers; no direct public-table write grants.

-- ---------------------------------------------------------------------------
-- hermes.decision_packages: add canonical FK (delivery projection keyed by public row)
-- ---------------------------------------------------------------------------
alter table hermes.decision_packages
  add column if not exists decision_package_id uuid;

comment on column hermes.decision_packages.decision_package_id is
  'FK to public.decision_packages.id. When set, presentation fields are read from public.*; this row holds Slack delivery state only.';

create unique index if not exists decision_packages_canonical_id_uk
  on hermes.decision_packages (decision_package_id)
  where decision_package_id is not null;

-- ---------------------------------------------------------------------------
-- floor_get_slack_decision_package — read canonical + projection as one Slack card payload
-- ---------------------------------------------------------------------------
create or replace function public.floor_get_slack_decision_package(p_package_ref text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, hermes
as $$
declare
  v_package_id uuid;
  v_hex text;
  v_legacy_id text;
  v_row record;
begin
  if p_package_ref is null or btrim(p_package_ref) = '' then
    return null;
  end if;

  -- Opaque ref: package:{32-hex}
  if p_package_ref ~ '^package:[0-9a-fA-F]{32}$' then
    v_hex := lower(substring(p_package_ref from 9));
    v_package_id := (
      substring(v_hex from 1 for 8) || '-' ||
      substring(v_hex from 9 for 4) || '-' ||
      substring(v_hex from 13 for 4) || '-' ||
      substring(v_hex from 17 for 4) || '-' ||
      substring(v_hex from 21)
    )::uuid;
  else
    v_legacy_id := p_package_ref;
  end if;

  if v_package_id is not null and to_regclass('public.decision_packages') is not null then
    select
      cp.id,
      cp.work_request_id,
      cp.play_id,
      cp.play_version,
      cp.headline,
      cp.summary,
      cp.risk,
      cp.client_ref,
      cp.document_ref,
      cp.fields,
      cp.diff,
      cp.send_spec,
      cp.created_at,
      wr.status as work_request_status,
      wr.owner_id,
      coalesce(dp.revision, 1) as projection_revision,
      coalesce(dp.state, 'prepared') as projection_state,
      coalesce(dp.rendered_hash, '') as projection_rendered_hash,
      dp.package_id as legacy_package_id,
      dp.handoff_id as legacy_handoff_id,
      dp.for_agent_id as legacy_for_agent_id,
      dp.for_human as legacy_for_human,
      dp.intent as legacy_intent,
      dp.client_display_name as legacy_client_display_name,
      dp.recommended_action as legacy_recommended_action,
      dp.rationale as legacy_rationale,
      dp.lint_results as legacy_lint_results,
      dp.second_opinion as legacy_second_opinion,
      dp.draft_email_preview as legacy_draft_email_preview,
      dp.document_refs as legacy_document_refs,
      dp.needs as legacy_needs,
      coalesce(dp.involves_external_send, false) as legacy_involves_external_send,
      a.name as account_name,
      agent.agent_id as owner_agent_id,
      agent.human_name as owner_human_name
    into v_row
    from public.decision_packages cp
    join public.automation_work_requests wr on wr.id = cp.work_request_id
    left join hermes.decision_packages dp on dp.decision_package_id = cp.id
    left join public.accounts a on a.id = cp.client_ref
    left join public.profiles p on p.id = wr.owner_id
    left join hermes.agents agent on lower(agent.human_email) = lower(p.email)
    where cp.id = v_package_id
    limit 1;

    if found then
      return jsonb_build_object(
        'source', 'canonical',
        'package_id', coalesce(v_row.legacy_package_id, p_package_ref),
        'decision_package_id', v_row.id,
        'work_request_id', v_row.work_request_id,
        'revision', v_row.projection_revision,
        'handoff_id', coalesce(v_row.legacy_handoff_id, 'work_request:' || replace(v_row.work_request_id::text, '-', '')),
        'for_agent_id', coalesce(v_row.legacy_for_agent_id, v_row.owner_agent_id, 'unassigned'),
        'for_human', coalesce(v_row.legacy_for_human, v_row.owner_human_name, 'Unassigned'),
        'intent', coalesce(v_row.legacy_intent, v_row.play_id),
        'client_display_name', coalesce(v_row.legacy_client_display_name, v_row.account_name, 'Client'),
        'recommended_action', coalesce(v_row.legacy_recommended_action, v_row.headline),
        'rationale', coalesce(v_row.legacy_rationale, v_row.summary),
        'lint_results', coalesce(v_row.legacy_lint_results, '[]'::jsonb),
        'second_opinion', v_row.legacy_second_opinion,
        'draft_email_preview', v_row.legacy_draft_email_preview,
        'document_refs', coalesce(v_row.legacy_document_refs, '[]'::jsonb),
        'needs', coalesce(v_row.legacy_needs, 'approve'),
        'involves_external_send', case
          when v_row.legacy_involves_external_send then true
          when v_row.send_spec is not null and coalesce(v_row.send_spec->>'recipient', '') not in ('', '[INTERNAL_ONLY]') then true
          else false
        end,
        'state', v_row.projection_state,
        'created_at', v_row.created_at,
        'rendered_hash', v_row.projection_rendered_hash,
        'work_request_status', v_row.work_request_status,
        'risk', v_row.risk
      );
    end if;
  end if;

  -- Legacy fixture / pre-canonical rows (hermes-only)
  if v_legacy_id is not null then
    select
      dp.package_id,
      dp.revision,
      dp.handoff_id,
      dp.for_agent_id,
      dp.for_human,
      dp.intent,
      dp.client_display_name,
      dp.recommended_action,
      dp.rationale,
      dp.lint_results,
      dp.second_opinion,
      dp.draft_email_preview,
      dp.document_refs,
      dp.needs,
      dp.involves_external_send,
      dp.state,
      dp.created_at,
      dp.rendered_hash,
      dp.decision_package_id
    into v_row
    from hermes.decision_packages dp
    where dp.package_id = v_legacy_id
    limit 1;

    if found then
      return jsonb_build_object(
        'source', 'legacy',
        'package_id', v_row.package_id,
        'decision_package_id', v_row.decision_package_id,
        'revision', v_row.revision,
        'handoff_id', v_row.handoff_id,
        'for_agent_id', v_row.for_agent_id,
        'for_human', v_row.for_human,
        'intent', v_row.intent,
        'client_display_name', v_row.client_display_name,
        'recommended_action', v_row.recommended_action,
        'rationale', v_row.rationale,
        'lint_results', v_row.lint_results,
        'second_opinion', v_row.second_opinion,
        'draft_email_preview', v_row.draft_email_preview,
        'document_refs', v_row.document_refs,
        'needs', v_row.needs,
        'involves_external_send', v_row.involves_external_send,
        'state', v_row.state,
        'created_at', v_row.created_at,
        'rendered_hash', coalesce(v_row.rendered_hash, '')
      );
    end if;
  end if;

  return null;
end;
$$;

comment on function public.floor_get_slack_decision_package(text) is
  'Phase 1 read seam: joins public.decision_packages (canonical) with hermes delivery projection.';

-- ---------------------------------------------------------------------------
-- floor_apply_feedback — persist Approve/Edit/Kill to public.* (mirrors floor-action endpoint)
-- ---------------------------------------------------------------------------
create or replace function public.floor_apply_feedback(
  p_package_ref text,
  p_verb text,
  p_agent_id text,
  p_field_edits jsonb default null,
  p_kill_reason text default null,
  p_projection_revision integer default null,
  p_projection_state text default null,
  p_rendered_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, hermes
as $$
declare
  v_package_id uuid;
  v_hex text;
  v_payload jsonb;
  v_work_request_id uuid;
  v_play_id text;
  v_play_version text;
  v_actor_id uuid;
  v_from_state text;
  v_to_state text;
  v_feedback_id uuid;
  v_event_type text;
begin
  if to_regclass('public.decision_packages') is null then
    raise exception 'canonical_tables_missing' using errcode = '42P01';
  end if;

  if p_verb not in ('approve', 'edit', 'kill') then
    raise exception 'invalid_verb' using errcode = '22023';
  end if;

  v_payload := public.floor_get_slack_decision_package(p_package_ref);
  if v_payload is null then
    raise exception 'package_not_found' using errcode = 'P0002';
  end if;

  v_package_id := (v_payload->>'decision_package_id')::uuid;
  if v_package_id is null then
    raise exception 'legacy_package_not_canonical' using errcode = '22023';
  end if;

  select cp.work_request_id, cp.play_id, cp.play_version, wr.status
  into v_work_request_id, v_play_id, v_play_version, v_from_state
  from public.decision_packages cp
  join public.automation_work_requests wr on wr.id = cp.work_request_id
  where cp.id = v_package_id;

  if v_work_request_id is null then
    raise exception 'work_request_not_found' using errcode = 'P0002';
  end if;

  select p.id into v_actor_id
  from hermes.agents a
  join public.profiles p on lower(p.email) = lower(a.human_email)
  where a.agent_id = p_agent_id
  limit 1;

  if v_actor_id is null then
    raise exception 'actor_not_found' using errcode = 'P0002';
  end if;

  insert into public.feedback_events (
    work_request_id, play_id, play_version, verb, actor_id, field_edits, kill_reason
  ) values (
    v_work_request_id,
    v_play_id,
    v_play_version,
    p_verb,
    v_actor_id,
    p_field_edits,
    p_kill_reason
  )
  returning id into v_feedback_id;

  v_to_state := case p_verb
    when 'kill' then 'killed'
    when 'approve' then 'approved'
    else 'awaiting_approval'
  end;

  update public.automation_work_requests
  set status = v_to_state, updated_at = now()
  where id = v_work_request_id;

  insert into public.automation_work_request_events (
    work_request_id, from_state, to_state, actor_id, reason
  ) values (
    v_work_request_id,
    v_from_state,
    v_to_state,
    v_actor_id,
    'feedback_' || p_verb
  );

  v_event_type := case p_verb
    when 'approve' then case when coalesce((v_payload->>'involves_external_send')::boolean, false) then 'gated' else 'approved' end
    when 'kill' then 'rejected'
    else 'edited'
  end;

  insert into hermes.decision_packages (
    package_id, decision_package_id, revision, handoff_id, for_agent_id, for_human,
    intent, client_display_name, recommended_action, rationale, lint_results,
    document_refs, needs, involves_external_send, state, rendered_hash, updated_at
  ) values (
    p_package_ref,
    v_package_id,
    coalesce(p_projection_revision, (v_payload->>'revision')::integer, 1),
    v_payload->>'handoff_id',
    v_payload->>'for_agent_id',
    v_payload->>'for_human',
    v_payload->>'intent',
    v_payload->>'client_display_name',
    v_payload->>'recommended_action',
    v_payload->>'rationale',
    coalesce(v_payload->'lint_results', '[]'::jsonb),
    coalesce(v_payload->'document_refs', '[]'::jsonb),
    coalesce(v_payload->>'needs', 'approve'),
    coalesce((v_payload->>'involves_external_send')::boolean, false),
    coalesce(p_projection_state, v_payload->>'state', 'prepared'),
    coalesce(p_rendered_hash, v_payload->>'rendered_hash', ''),
    now()
  )
  on conflict (decision_package_id) where decision_package_id is not null do update set
    revision = excluded.revision,
    state = excluded.state,
    rendered_hash = excluded.rendered_hash,
    rationale = excluded.rationale,
    updated_at = now();

  return jsonb_build_object(
    'feedback_event_id', v_feedback_id,
    'verb', p_verb,
    'event_type', v_event_type,
    'work_request_id', v_work_request_id,
    'decision_package_id', v_package_id
  );
end;
$$;

comment on function public.floor_apply_feedback(text, text, text, jsonb, text, integer, text, text) is
  'Phase 1 write seam: persists feedback_events + work_request status; updates hermes delivery projection.';

revoke all on function public.floor_get_slack_decision_package(text) from public;
revoke all on function public.floor_apply_feedback(text, text, text, jsonb, text, integer, text, text) from public;

grant execute on function public.floor_get_slack_decision_package(text) to hermes_app;
grant execute on function public.floor_apply_feedback(text, text, text, jsonb, text, integer, text, text) to hermes_app;
