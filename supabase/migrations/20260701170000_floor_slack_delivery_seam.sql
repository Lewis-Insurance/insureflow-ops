-- Phase 1 Slice 3: Slack delivery projection + home materializer read grants.
-- Connects play-created public.decision_packages to Slack DMs and App Home pending list.

-- ---------------------------------------------------------------------------
-- floor_get_slack_decision_package — account owner fallback when work_request.owner_id is null
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
    left join public.accounts acct on acct.id = cp.client_ref
    left join public.profiles p on p.id = coalesce(wr.owner_id, acct.owner_agent_id)
    left join public.accounts a on a.id = cp.client_ref
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

-- ---------------------------------------------------------------------------
-- floor_list_pending_slack_packages — home materializer (no direct public table SELECT grant)
-- ---------------------------------------------------------------------------
create or replace function public.floor_list_pending_slack_packages()
returns table (package_ref text)
language sql
stable
security definer
set search_path = public, hermes
as $$
  select coalesce(dp.package_id, 'package:' || replace(cp.id::text, '-', '')) as package_ref
  from public.decision_packages cp
  join public.automation_work_requests wr on wr.id = cp.work_request_id
  left join hermes.decision_packages dp on dp.decision_package_id = cp.id
  where wr.status = 'awaiting_approval'
    and coalesce(dp.state, 'prepared') in ('prepared', 'edited', 'gated');
$$;

comment on function public.floor_list_pending_slack_packages() is
  'Lists canonical package refs awaiting human approval for App Home materialization.';

-- ---------------------------------------------------------------------------
-- floor_list_undelivered_slack_packages — play runner → Slack DM delivery queue
-- ---------------------------------------------------------------------------
create or replace function public.floor_list_undelivered_slack_packages(p_limit integer default 25)
returns table (package_ref text, for_agent_id text)
language sql
stable
security definer
set search_path = public, hermes
as $$
  select
    coalesce(dp.package_id, 'package:' || replace(cp.id::text, '-', '')) as package_ref,
    coalesce(
      dp.for_agent_id,
      agent.agent_id,
      'brian'
    ) as for_agent_id
  from public.decision_packages cp
  join public.automation_work_requests wr on wr.id = cp.work_request_id
  left join hermes.decision_packages dp on dp.decision_package_id = cp.id
  left join public.accounts acct on acct.id = cp.client_ref
  left join public.profiles p on p.id = coalesce(wr.owner_id, acct.owner_agent_id)
  left join hermes.agents agent on lower(agent.human_email) = lower(p.email)
  where wr.status = 'awaiting_approval'
    and coalesce(dp.state, 'prepared') in ('prepared', 'edited', 'gated')
    and (dp.slack_message_ts is null or dp.package_id is null)
  order by cp.created_at asc
  limit greatest(coalesce(p_limit, 25), 1);
$$;

comment on function public.floor_list_undelivered_slack_packages(integer) is
  'Canonical packages not yet posted to Slack; used by Mac Mini delivery cron.';

-- ---------------------------------------------------------------------------
-- floor_record_slack_delivery — persist Slack DM refs on hermes delivery projection
-- ---------------------------------------------------------------------------
create or replace function public.floor_record_slack_delivery(
  p_package_ref text,
  p_channel_id text,
  p_message_ts text,
  p_rendered_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, hermes
as $$
declare
  v_payload jsonb;
  v_package_id uuid;
begin
  if p_channel_id is null or btrim(p_channel_id) = '' or p_message_ts is null or btrim(p_message_ts) = '' then
    raise exception 'slack_delivery_refs_required' using errcode = '22023';
  end if;

  v_payload := public.floor_get_slack_decision_package(p_package_ref);
  if v_payload is null then
    raise exception 'package_not_found' using errcode = 'P0002';
  end if;

  v_package_id := (v_payload->>'decision_package_id')::uuid;
  if v_package_id is null then
    raise exception 'legacy_package_not_canonical' using errcode = '22023';
  end if;

  insert into hermes.decision_packages (
    package_id, decision_package_id, revision, handoff_id, for_agent_id, for_human,
    intent, client_display_name, recommended_action, rationale, lint_results,
    document_refs, needs, involves_external_send, state, rendered_hash,
    slack_channel_id, slack_message_ts, updated_at
  ) values (
    p_package_ref,
    v_package_id,
    coalesce((v_payload->>'revision')::integer, 1),
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
    coalesce(v_payload->>'state', 'prepared'),
    coalesce(nullif(btrim(p_rendered_hash), ''), v_payload->>'rendered_hash', ''),
    p_channel_id,
    p_message_ts,
    now()
  )
  on conflict (decision_package_id) where decision_package_id is not null do update set
    package_id = excluded.package_id,
    for_agent_id = excluded.for_agent_id,
    for_human = excluded.for_human,
    slack_channel_id = excluded.slack_channel_id,
    slack_message_ts = excluded.slack_message_ts,
    rendered_hash = coalesce(nullif(btrim(excluded.rendered_hash), ''), hermes.decision_packages.rendered_hash),
    updated_at = now();

  return jsonb_build_object(
    'package_ref', p_package_ref,
    'decision_package_id', v_package_id,
    'slack_channel_id', p_channel_id,
    'slack_message_ts', p_message_ts
  );
end;
$$;

comment on function public.floor_record_slack_delivery(text, text, text, text) is
  'Records Slack DM delivery on hermes.decision_packages after postDecision.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.floor_list_pending_slack_packages() from public;
revoke all on function public.floor_list_undelivered_slack_packages(integer) from public;
revoke all on function public.floor_record_slack_delivery(text, text, text, text) from public;

grant execute on function public.floor_list_pending_slack_packages() to hermes_app;
grant execute on function public.floor_list_undelivered_slack_packages(integer) to hermes_app;
grant execute on function public.floor_record_slack_delivery(text, text, text, text) to hermes_app;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'hermes_home_materializer') then
    execute 'grant execute on function public.floor_get_slack_decision_package(text) to hermes_home_materializer';
    execute 'grant execute on function public.floor_list_pending_slack_packages() to hermes_home_materializer';
  end if;
end $$;
