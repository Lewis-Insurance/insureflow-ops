-- Phase 5 Slice 3: Morning tray DM batching — heartbeat packages batched per agent at office open.
-- Individual canonical delivery (Mac Mini deliver:canonical-decision-cards) skips heartbeat source;
-- those packages are delivered once via the morning tray digest instead.

-- ---------------------------------------------------------------------------
-- floor_list_morning_tray_packages — heartbeat work → one tray DM per agent
-- ---------------------------------------------------------------------------
create or replace function public.floor_list_morning_tray_packages(p_limit integer default 200)
returns table (
  package_ref text,
  for_agent_id text,
  client_display_name text,
  tray_summary text,
  involves_external_send boolean,
  sort_rank integer
)
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
      'unassigned'
    ) as for_agent_id,
    coalesce(dp.client_display_name, acct.name, 'Client') as client_display_name,
    coalesce(
      nullif(btrim(dp.recommended_action), ''),
      nullif(btrim(cp.headline), ''),
      nullif(btrim(cp.summary), ''),
      'Review decision package'
    ) as tray_summary,
    coalesce(
      dp.involves_external_send,
      cp.send_spec is not null and coalesce(cp.send_spec->>'recipient', '') not in ('', '[INTERNAL_ONLY]'),
      false
    ) as involves_external_send,
    (
      case
        when coalesce(
          dp.involves_external_send,
          cp.send_spec is not null and coalesce(cp.send_spec->>'recipient', '') not in ('', '[INTERNAL_ONLY]'),
          false
        ) then 0
        else 1
      end * 1000
      + row_number() over (
          partition by coalesce(dp.for_agent_id, agent.agent_id, 'unassigned')
          order by cp.created_at asc
        )::integer
    ) as sort_rank
  from public.decision_packages cp
  join public.automation_work_requests wr on wr.id = cp.work_request_id
  left join hermes.decision_packages dp on dp.decision_package_id = cp.id
  left join public.accounts acct on acct.id = cp.client_ref
  left join public.profiles p on p.id = coalesce(wr.owner_id, acct.owner_agent_id)
  left join hermes.agents agent on lower(agent.human_email) = lower(p.email)
  where wr.status = 'awaiting_approval'
    and wr.source = 'heartbeat'
    and coalesce(dp.state, 'prepared') in ('prepared', 'edited', 'gated')
    and (dp.slack_message_ts is null or dp.package_id is null)
  order by for_agent_id asc, sort_rank asc
  limit greatest(coalesce(p_limit, 200), 1);
$$;

comment on function public.floor_list_morning_tray_packages(integer) is
  'Heartbeat-sourced packages awaiting morning tray batch delivery (one digest DM per agent).';

-- ---------------------------------------------------------------------------
-- floor_record_morning_tray_deliveries — mark batch notified on shared tray message
-- ---------------------------------------------------------------------------
create or replace function public.floor_record_morning_tray_deliveries(
  p_for_agent_id text,
  p_channel_id text,
  p_message_ts text,
  p_package_refs text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, hermes
as $$
declare
  v_ref text;
  v_recorded integer := 0;
  v_errors jsonb := '[]'::jsonb;
begin
  if p_channel_id is null or btrim(p_channel_id) = '' or p_message_ts is null or btrim(p_message_ts) = '' then
    raise exception 'slack_delivery_refs_required' using errcode = '22023';
  end if;

  if p_package_refs is null or array_length(p_package_refs, 1) is null then
    return jsonb_build_object('for_agent_id', p_for_agent_id, 'recorded', 0, 'errors', v_errors);
  end if;

  foreach v_ref in array p_package_refs loop
    begin
      perform public.floor_record_slack_delivery(v_ref, p_channel_id, p_message_ts, null);
      v_recorded := v_recorded + 1;
    exception when others then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('package_ref', v_ref, 'error', sqlerrm));
    end;
  end loop;

  return jsonb_build_object(
    'for_agent_id', p_for_agent_id,
    'recorded', v_recorded,
    'errors', v_errors
  );
end;
$$;

comment on function public.floor_record_morning_tray_deliveries(text, text, text, text[]) is
  'After postTray, records the same Slack refs on each heartbeat package in the batch.';

-- ---------------------------------------------------------------------------
-- Exclude heartbeat packages from per-card immediate delivery queue
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
    and wr.source is distinct from 'heartbeat'
    and coalesce(dp.state, 'prepared') in ('prepared', 'edited', 'gated')
    and (dp.slack_message_ts is null or dp.package_id is null)
  order by cp.created_at asc
  limit greatest(coalesce(p_limit, 25), 1);
$$;

comment on function public.floor_list_undelivered_slack_packages(integer) is
  'Immediate per-card Slack delivery (excludes heartbeat — those use morning tray batch).';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.floor_list_morning_tray_packages(integer) from public;
revoke all on function public.floor_record_morning_tray_deliveries(text, text, text, text[]) from public;

grant execute on function public.floor_list_morning_tray_packages(integer) to hermes_app;
grant execute on function public.floor_record_morning_tray_deliveries(text, text, text, text[]) to hermes_app;
