-- Keep the Haven feed current without anyone remembering to.
--
-- 20260921230000 built the feed and left publishing manual: there is no trigger
-- on public.policies, so a policy added, repriced, renewed or removed never
-- reached Haven until somebody called haven_feed_publish by hand. That makes the
-- feed a snapshot rather than an integration.
--
-- WHY A RECONCILER AND NOT A TRIGGER
--
-- A trigger fires once per write and is lost if it throws, if the feed is
-- disabled at that moment, or if a row is changed by a path that bypasses it
-- (a bulk import, a restore, a manual correction). A reconciler asks a different
-- question — "does the feed currently agree with the book?" — and answers it the
-- same way every time it runs. A missed event is not a lost event, it is a
-- difference the next pass finds. The receiver is built for exactly this: every
-- accepted page replaces the entire membership manifest, so a reconciled feed and
-- a perfectly event-sourced one are indistinguishable to it.
--
-- WHAT COUNTS AS A WITHDRAWAL
--
-- Disclosure, not policy status. A soft-deleted policy, a policy whose number was
-- removed, or one whose account is no longer approved stops being disclosed. A
-- policy that is merely cancelled or lapsed is still disclosed, carrying its own
-- status text — hiding it would leave Haven silently unaware of coverage that
-- ended, which is the failure mode this whole integration exists to prevent.

BEGIN;

CREATE FUNCTION public.haven_feed_reconcile(p_integration_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_integration public.haven_feed_integrations;
  v_published integer := 0;
  v_withdrawn integer := 0;
  v_unchanged integer := 0;
  v_policy record;
BEGIN
  SELECT * INTO v_integration FROM public.haven_feed_integrations
    WHERE id = p_integration_id AND enabled AND revoked_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No enabled Haven feed integration %', p_integration_id USING ERRCODE = '42501';
  END IF;

  -- Everything currently disclosable, alongside what the feed last said about it.
  FOR v_policy IN
    WITH current_release AS (
      SELECT DISTINCT ON (e.policy_id) e.policy_id, e.kind, e.snapshot
      FROM public.haven_feed_events AS e
      WHERE e.integration_id = p_integration_id
      ORDER BY e.policy_id, e.sequence DESC
    ),
    disclosable AS (
      SELECT p.id AS policy_id, public.haven_feed_snapshot(p.id) AS snapshot
      FROM public.policies AS p
      WHERE p.deleted_at IS NULL
        AND p.account_id = ANY (v_integration.approved_account_ids)
        AND nullif(btrim(coalesce(p.policy_number, '')), '') IS NOT NULL
    )
    SELECT
      coalesce(d.policy_id, c.policy_id) AS policy_id,
      d.snapshot AS desired,
      c.kind AS released_kind,
      c.snapshot AS released
    FROM disclosable AS d
    FULL OUTER JOIN current_release AS c ON c.policy_id = d.policy_id
  LOOP
    IF v_policy.desired IS NULL THEN
      -- No longer disclosable. Withdraw, but only if it is currently released;
      -- withdrawing an already-withdrawn policy would append a pointless event
      -- and move every consumer's cursor for no reason.
      IF v_policy.released_kind = 'released' THEN
        PERFORM public.haven_feed_withdraw(p_integration_id, v_policy.policy_id);
        v_withdrawn := v_withdrawn + 1;
      END IF;
    ELSIF v_policy.released_kind IS DISTINCT FROM 'released'
       OR v_policy.released IS DISTINCT FROM v_policy.desired THEN
      -- New, returned after a withdrawal, or changed in any of the eleven fields.
      -- jsonb equality is order-insensitive, so a rewritten-but-identical row
      -- does not churn the feed.
      PERFORM public.haven_feed_publish(p_integration_id, v_policy.policy_id);
      v_published := v_published + 1;
    ELSE
      v_unchanged := v_unchanged + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'integration_id', p_integration_id,
    'published', v_published,
    'withdrawn', v_withdrawn,
    'unchanged', v_unchanged,
    'reconciled_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
END $$;

COMMENT ON FUNCTION public.haven_feed_reconcile(uuid) IS
  'Makes the Haven feed agree with the book. Idempotent: a second run with no changes publishes nothing.';

REVOKE ALL ON FUNCTION public.haven_feed_reconcile(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.haven_feed_reconcile(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
