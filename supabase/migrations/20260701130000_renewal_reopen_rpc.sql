-- Reopen a closed renewal from the main Renewals page (Closed view). Atomic + staff-gated.
--
-- Returns the renewal to the working queue ('upcoming') and clears its terminal fields. Policy
-- handling is deliberately scoped:
--   * did-not-renew family (lost / cancelled / non_renewed / lapsed): the terminal action set the
--     policy to that dead status in place with nothing replacing it, so reactivate it to 'active'
--     and clear the cancellation fields.
--   * moved: a NEW policy already replaced the old one (old -> inactive). Reopening only reopens
--     the renewal; policy records are left as-is for manual adjustment (not auto-reversed).
--   * renewed / completed: the policy is already active in place; leave it untouched.
--
-- Applied to PROD (lrqajzwcmdwahnjyidgv) via Supabase MCP on 2026-07-01.
CREATE OR REPLACE FUNCTION public.renewal_reopen(p_renewal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_status text;
  v_policy uuid;
  v_acct   uuid;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT status, policy_id, account_id INTO v_status, v_policy, v_acct
  FROM public.renewals WHERE id = p_renewal_id FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Renewal % not found', p_renewal_id;
  END IF;
  IF v_status NOT IN ('moved', 'renewed', 'lost', 'cancelled', 'non_renewed', 'lapsed', 'completed') THEN
    RAISE EXCEPTION 'Renewal % is not closed (status %)', p_renewal_id, v_status;
  END IF;

  IF v_policy IS NOT NULL AND v_status IN ('lost', 'cancelled', 'non_renewed', 'lapsed') THEN
    UPDATE public.policies
    SET status = 'active', cancelled_at = NULL, cancellation_reason = NULL
    WHERE id = v_policy;
  END IF;

  UPDATE public.renewals SET
    status                     = 'upcoming',
    completed_at               = NULL,
    completed_by               = NULL,
    termination_effective_date = NULL,
    lost_reason                = NULL,
    cancelled_reason           = NULL,
    non_renewal_reason         = NULL,
    lapsed_reason              = NULL,
    moved_carrier              = NULL,
    moved_premium              = NULL,
    moved_term                 = NULL
  WHERE id = p_renewal_id;

  INSERT INTO public.customer_notes (customer_id, note_text, created_by)
  VALUES (v_acct, 'Renewal reopened (was ' || v_status || ')', v_uid);
END;
$$;

REVOKE ALL ON FUNCTION public.renewal_reopen(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.renewal_reopen(uuid) TO authenticated;
