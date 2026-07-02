-- ============================================================================
-- THE FLOOR — Phase 3 close-out (Slices 7–8)
-- Extends feedback verbs, intake latency columns, kill-during-hold on Slack path.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Intake → package latency (DoD: card in < 5s)
-- ---------------------------------------------------------------------------
ALTER TABLE public.automation_work_requests
  ADD COLUMN IF NOT EXISTS intake_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_package_at TIMESTAMPTZ;

COMMENT ON COLUMN public.automation_work_requests.intake_at IS
  'Floor intake timestamp (request received). Defaults to created_at when unset.';
COMMENT ON COLUMN public.automation_work_requests.first_package_at IS
  'When the first decision_package was linked for this work request.';

-- Backfill intake_at from created_at for existing rows
UPDATE public.automation_work_requests
SET intake_at = created_at
WHERE intake_at IS NULL;

-- ---------------------------------------------------------------------------
-- feedback_events — extend verbs for audit completeness
-- ---------------------------------------------------------------------------
ALTER TABLE public.feedback_events
  DROP CONSTRAINT IF EXISTS feedback_events_verb_check;

ALTER TABLE public.feedback_events
  ADD CONSTRAINT feedback_events_verb_check
  CHECK (verb IN (
    'approve',
    'edit',
    'kill',
    'release',
    'send_success',
    'send_failure',
    'card_created'
  ));

-- ---------------------------------------------------------------------------
-- floor_apply_feedback — cancel held send on kill (Slack/Mac Mini path)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.floor_apply_feedback(
  p_package_ref text,
  p_verb text,
  p_agent_id text,
  p_field_edits jsonb DEFAULT NULL,
  p_kill_reason text DEFAULT NULL,
  p_projection_revision integer DEFAULT NULL,
  p_projection_state text DEFAULT NULL,
  p_rendered_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, hermes
AS $$
DECLARE
  v_package_id uuid;
  v_payload jsonb;
  v_work_request_id uuid;
  v_play_id text;
  v_play_version text;
  v_actor_id uuid;
  v_from_state text;
  v_to_state text;
  v_feedback_id uuid;
  v_event_type text;
BEGIN
  IF to_regclass('public.decision_packages') IS NULL THEN
    RAISE EXCEPTION 'canonical_tables_missing' USING ERRCODE = '42P01';
  END IF;

  IF p_verb NOT IN ('approve', 'edit', 'kill') THEN
    RAISE EXCEPTION 'invalid_verb' USING ERRCODE = '22023';
  END IF;

  v_payload := public.floor_get_slack_decision_package(p_package_ref);
  IF v_payload IS NULL THEN
    RAISE EXCEPTION 'package_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_package_id := (v_payload->>'decision_package_id')::uuid;
  IF v_package_id IS NULL THEN
    RAISE EXCEPTION 'legacy_package_not_canonical' USING ERRCODE = '22023';
  END IF;

  SELECT cp.work_request_id, cp.play_id, cp.play_version, wr.status
  INTO v_work_request_id, v_play_id, v_play_version, v_from_state
  FROM public.decision_packages cp
  JOIN public.automation_work_requests wr ON wr.id = cp.work_request_id
  WHERE cp.id = v_package_id;

  IF v_work_request_id IS NULL THEN
    RAISE EXCEPTION 'work_request_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT p.id INTO v_actor_id
  FROM hermes.agents a
  JOIN public.profiles p ON lower(p.email) = lower(a.human_email)
  WHERE a.agent_id = p_agent_id
  LIMIT 1;

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.feedback_events (
    work_request_id, play_id, play_version, verb, actor_id, field_edits, kill_reason
  ) VALUES (
    v_work_request_id,
    v_play_id,
    v_play_version,
    p_verb,
    v_actor_id,
    p_field_edits,
    p_kill_reason
  )
  RETURNING id INTO v_feedback_id;

  v_to_state := CASE p_verb
    WHEN 'kill' THEN 'killed'
    WHEN 'approve' THEN 'approved'
    ELSE 'awaiting_approval'
  END;

  UPDATE public.automation_work_requests
  SET status = v_to_state, updated_at = now()
  WHERE id = v_work_request_id;

  IF p_verb = 'kill' THEN
    UPDATE public.floor_client_send_approvals
    SET status = 'killed'
    WHERE work_request_id = v_work_request_id
      AND status IN ('approved', 'held');
  END IF;

  INSERT INTO public.automation_work_request_events (
    work_request_id, from_state, to_state, actor_id, reason
  ) VALUES (
    v_work_request_id,
    v_from_state,
    v_to_state,
    v_actor_id,
    'feedback_' || p_verb
  );

  v_event_type := CASE p_verb
    WHEN 'approve' THEN CASE
      WHEN coalesce((v_payload->>'involves_external_send')::boolean, false) THEN 'gated'
      ELSE 'approved'
    END
    WHEN 'kill' THEN 'rejected'
    ELSE 'edited'
  END;

  INSERT INTO hermes.decision_packages (
    package_id, decision_package_id, revision, handoff_id, for_agent_id, for_human,
    intent, client_display_name, recommended_action, rationale, lint_results,
    document_refs, needs, involves_external_send, state, rendered_hash, updated_at
  ) VALUES (
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
  ON CONFLICT (decision_package_id) WHERE decision_package_id IS NOT NULL DO UPDATE SET
    revision = excluded.revision,
    state = excluded.state,
    rendered_hash = excluded.rendered_hash,
    rationale = excluded.rationale,
    updated_at = now();

  RETURN jsonb_build_object(
    'feedback_event_id', v_feedback_id,
    'verb', p_verb,
    'event_type', v_event_type,
    'work_request_id', v_work_request_id,
    'decision_package_id', v_package_id
  );
END;
$$;

COMMENT ON FUNCTION public.floor_apply_feedback(text, text, text, jsonb, text, integer, text, text) IS
  'Phase 1 write seam: feedback_events + work_request status; kill cancels held floor_client_send_approvals.';
