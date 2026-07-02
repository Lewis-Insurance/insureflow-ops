-- ============================================================================
-- THE FLOOR — CRM read view for per-employee Hermes agent identity (Phase 1)
-- ADR 002: hermes.agents stays canonical; CRM reads via public view only.
-- Staged only. Requires hermes.agents (lewis-the-floor migration on dev).
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'hermes' AND table_name = 'agents'
  ) THEN
    RAISE NOTICE 'hermes.agents not present — skipping floor_agent_bindings_v';
    RETURN;
  END IF;

  EXECUTE $view$
    CREATE OR REPLACE VIEW public.floor_agent_bindings_v AS
    SELECT
      a.agent_id,
      a.human_name,
      a.role,
      a.slack_display_name,
      a.status,
      a.autonomy_level,
      a.second_opinion
    FROM hermes.agents a
    WHERE a.is_staff = true
      AND lower(a.human_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  $view$;

  EXECUTE 'GRANT SELECT ON public.floor_agent_bindings_v TO authenticated';
END;
$$;

COMMENT ON VIEW public.floor_agent_bindings_v IS
  'Per-user Floor agent binding for CRM cockpit. Filters hermes.agents to auth email; no PII columns exposed.';
