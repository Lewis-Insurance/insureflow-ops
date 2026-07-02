-- Renewals sync + terminal-commit hardening (code review 2026-07-01, findings P0-2/3/4, P1 renewals).
--
-- Grounded against LIVE prod (which had drifted from the repo migration files):
--   * prod already has renewals_policy_term_uniq (policy_id, renewal_date) and a
--     date-matched trigger with ON CONFLICT, so the reviewed "reopen duplicates a
--     renewal" / "mark-renewed clobbers history" scenarios were partially mitigated;
--     the structural gaps below remained.
--
-- What this fixes:
--   1. auto_sync_policy_to_renewal / sync_policies_to_renewals ignored
--      policies.deleted_at, minting open renewals for merge-soft-deleted policies
--      (2 artifact rows existed in prod; removed below).
--   2. The trigger matched open renewals by (policy_id, renewal_date) equality, so a
--      policy expiration edit (endorsement) spawned a SECOND open renewal instead of
--      moving the existing one. Now matches any open renewal per policy.
--   3. Mark-Renewed / Mark-Lost were two sequential client writes (non-atomic, and
--      Renewed relied on trigger timing). New renewal_mark_renewed /
--      renewal_mark_lost RPCs close the renewal FIRST, then write the policy, in one
--      transaction - mirroring renewal_mark_moved.
--   4. renewal_reopen reactivated the policy BEFORE reopening the renewal and never
--      checked for an existing open renewal on the same policy (reopening a
--      'renewed' renewal left two open rows). Reordered + pristine-sibling cleanup.
--   5. renewal_mark_moved's duplicate-number guard matched soft-deleted policies
--      (falsely blocking legitimate moves); now scoped to live rows like the
--      policies_policy_number_active_unique index it fronts.
--   6. New partial unique index: at most ONE open renewal per policy, making the
--      whole duplicate class structurally impossible (0 violations at apply time).

-- ---------------------------------------------------------------------------
-- 1. Row trigger: skip soft-deleted policies; follow the open renewal by policy
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auto_sync_policy_to_renewal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_open_id UUID;
  v_carrier_name TEXT;
  v_date_taken BOOLEAN;
BEGIN
  IF NEW.expiration_date IS NULL
    OR NEW.status NOT IN ('active', 'pending')
    OR NEW.account_id IS NULL
    OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_carrier_name FROM public.carriers WHERE id = NEW.carrier_id;

  -- Any open renewal for this policy, not just a date-matched one: an expiration
  -- edit (endorsement) must MOVE the open renewal, not spawn a second one.
  SELECT id INTO v_open_id
  FROM public.renewals
  WHERE policy_id = NEW.id AND status IN ('upcoming', 'in_progress')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_open_id IS NOT NULL THEN
    -- Move renewal_date with the policy unless a (closed) row already occupies the
    -- target (policy_id, renewal_date) slot - renewals_policy_term_uniq.
    SELECT EXISTS (
      SELECT 1 FROM public.renewals r2
      WHERE r2.policy_id = NEW.id
        AND r2.renewal_date = NEW.expiration_date
        AND r2.id <> v_open_id
    ) INTO v_date_taken;

    UPDATE public.renewals SET
      policy_number   = NEW.policy_number,
      policy_type     = COALESCE(NULLIF(NEW.line_of_business, ''), 'other'),
      carrier         = COALESCE(v_carrier_name, NEW.carrier),
      renewal_date    = CASE WHEN v_date_taken THEN renewal_date ELSE NEW.expiration_date END,
      expiration_date = NEW.expiration_date,
      current_premium = NEW.premium,
      updated_at      = NOW()
    WHERE id = v_open_id;
  ELSE
    INSERT INTO public.renewals (
      account_id, policy_id, policy_number, policy_type, carrier,
      renewal_date, expiration_date, current_premium, renewal_premium,
      status, risk_level, created_at, updated_at
    ) VALUES (
      NEW.account_id, NEW.id, NEW.policy_number,
      COALESCE(NULLIF(NEW.line_of_business, ''), 'other'),
      COALESCE(v_carrier_name, NEW.carrier),
      NEW.expiration_date, NEW.expiration_date, NEW.premium, NEW.premium,
      'upcoming', 'low', NOW(), NOW()
    )
    ON CONFLICT DO NOTHING; -- absorbs both the term-pair and one-open unique indexes under concurrency
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Full-book reconciler: skip soft-deleted policies; open-row-per-policy aware
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_policies_to_renewals(days_ahead integer DEFAULT 90)
 RETURNS TABLE(synced_count integer, updated_count integer, new_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_updated INTEGER := 0;
  v_new INTEGER := 0;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'permission denied: staff only' USING ERRCODE = '42501';
  END IF;

  WITH upd AS (
    UPDATE public.renewals r SET
      policy_number   = p.policy_number,
      policy_type     = COALESCE(NULLIF(p.line_of_business, ''), 'other'),
      carrier         = COALESCE(c.name, p.carrier),
      renewal_date    = CASE WHEN EXISTS (
                          SELECT 1 FROM public.renewals r2
                          WHERE r2.policy_id = p.id
                            AND r2.renewal_date = p.expiration_date
                            AND r2.id <> r.id
                        ) THEN r.renewal_date ELSE p.expiration_date END,
      expiration_date = p.expiration_date,
      current_premium = p.premium,
      updated_at      = NOW()
    FROM public.policies p
    LEFT JOIN public.carriers c ON c.id = p.carrier_id
    WHERE r.policy_id = p.id
      AND r.status IN ('upcoming', 'in_progress')
      AND p.deleted_at IS NULL
      AND p.status IN ('active', 'pending')
      AND p.expiration_date IS NOT NULL
      AND (
        r.renewal_date    IS DISTINCT FROM p.expiration_date
        OR r.expiration_date IS DISTINCT FROM p.expiration_date
        OR r.current_premium IS DISTINCT FROM p.premium
        OR r.policy_number   IS DISTINCT FROM p.policy_number
        OR r.policy_type     IS DISTINCT FROM COALESCE(NULLIF(p.line_of_business, ''), 'other')
        OR r.carrier         IS DISTINCT FROM COALESCE(c.name, p.carrier)
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_updated FROM upd;

  WITH ins AS (
    INSERT INTO public.renewals (
      account_id, policy_id, policy_number, policy_type, carrier,
      renewal_date, expiration_date, current_premium, renewal_premium,
      status, risk_level, created_at, updated_at
    )
    SELECT
      p.account_id, p.id, p.policy_number,
      COALESCE(NULLIF(p.line_of_business, ''), 'other'),
      COALESCE(c.name, p.carrier),
      p.expiration_date, p.expiration_date, p.premium, p.premium,
      'upcoming', 'low', NOW(), NOW()
    FROM public.policies p
    LEFT JOIN public.carriers c ON c.id = p.carrier_id
    WHERE p.deleted_at IS NULL
      AND p.status IN ('active', 'pending')
      AND p.account_id IS NOT NULL
      AND p.expiration_date IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.renewals r
        WHERE r.policy_id = p.id AND r.status IN ('upcoming', 'in_progress')
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.renewals r
        WHERE r.policy_id = p.id AND r.renewal_date = p.expiration_date
      )
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_new FROM ins;

  RETURN QUERY SELECT (v_updated + v_new), v_updated, v_new;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Remove the artifact open renewals minted for merge-soft-deleted policies
--    (pristine rows only: no draft data, no contact, unassigned)
-- ---------------------------------------------------------------------------

DELETE FROM public.renewals r
USING public.policies p
WHERE p.id = r.policy_id
  AND p.deleted_at IS NOT NULL
  AND r.status IN ('upcoming', 'in_progress')
  AND r.new_effective_date IS NULL
  AND r.new_expiration_date IS NULL
  AND r.last_contact_date IS NULL
  AND r.assigned_to IS NULL;

-- ---------------------------------------------------------------------------
-- 4. Structural backstop: at most one open renewal per policy
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS renewals_one_open_per_policy
  ON public.renewals (policy_id)
  WHERE status IN ('upcoming', 'in_progress');

-- ---------------------------------------------------------------------------
-- 5. renewal_mark_renewed: atomic terminal commit (close renewal FIRST, then
--    write the policy - the sync trigger then spawns the next-term row cleanly)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.renewal_mark_renewed(
  p_renewal_id uuid,
  p_policy_id uuid,
  p_account_id uuid,
  p_policy_number text,
  p_premium numeric,
  p_policy_term text,
  p_effective_date date,
  p_expiration_date date,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_status text;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_policy_term NOT IN ('semiannual', 'annual') THEN
    RAISE EXCEPTION 'Invalid policy_term: %', p_policy_term;
  END IF;

  SELECT status INTO v_status FROM public.renewals WHERE id = p_renewal_id FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Renewal % not found', p_renewal_id;
  END IF;
  IF v_status IN ('moved', 'renewed', 'lost', 'cancelled', 'non_renewed', 'lapsed', 'completed') THEN
    RAISE EXCEPTION 'Renewal % is already closed (status %)', p_renewal_id, v_status;
  END IF;

  -- Close first: the policy update below fires auto_sync_policy_to_renewal, which
  -- must find no open renewal so it inserts a fresh next-term row instead of
  -- rewriting this one's dates/premium (history would be destroyed).
  UPDATE public.renewals SET
    status              = 'renewed',
    renewal_premium     = p_premium,
    policy_number       = p_policy_number,
    policy_term         = p_policy_term,
    new_effective_date  = p_effective_date,
    new_expiration_date = p_expiration_date
  WHERE id = p_renewal_id;

  UPDATE public.policies SET
    policy_number   = p_policy_number,
    premium         = p_premium,
    effective_date  = p_effective_date,
    expiration_date = p_expiration_date,
    policy_term     = p_policy_term,
    status          = 'active'
  WHERE id = p_policy_id;

  INSERT INTO public.customer_notes (customer_id, note_text, created_by)
  VALUES (
    p_account_id,
    CASE WHEN p_notes IS NOT NULL AND length(trim(p_notes)) > 0
         THEN 'Renewal completed: ' || p_notes
         ELSE 'Policy renewed' END,
    v_uid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.renewal_mark_renewed(uuid, uuid, uuid, text, numeric, text, date, date, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.renewal_mark_renewed(uuid, uuid, uuid, text, numeric, text, date, date, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. renewal_mark_lost: atomic terminal commit for the did-not-renew family
--    (mirrors src/lib/renewals/renewalTerm.ts mapLostReason)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.renewal_mark_lost(
  p_renewal_id uuid,
  p_policy_id uuid,
  p_account_id uuid,
  p_category text,
  p_reason text,
  p_termination_date date DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid            uuid := auth.uid();
  v_status         text;
  v_renewal_status text;
  v_policy_status  text;
  v_reason         text;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_category NOT IN ('cancelled', 'non_renewed', 'lost', 'lapsed', 'other') THEN
    RAISE EXCEPTION 'Invalid lost-reason category: %', p_category;
  END IF;

  SELECT status INTO v_status FROM public.renewals WHERE id = p_renewal_id FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Renewal % not found', p_renewal_id;
  END IF;
  IF v_status IN ('moved', 'renewed', 'lost', 'cancelled', 'non_renewed', 'lapsed', 'completed') THEN
    RAISE EXCEPTION 'Renewal % is already closed (status %)', p_renewal_id, v_status;
  END IF;

  v_renewal_status := CASE p_category
    WHEN 'cancelled'   THEN 'cancelled'
    WHEN 'non_renewed' THEN 'non_renewed'
    WHEN 'lapsed'      THEN 'lapsed'
    ELSE 'lost'
  END;
  v_policy_status := CASE p_category
    WHEN 'cancelled'   THEN 'cancelled'
    WHEN 'non_renewed' THEN 'non_renewed'
    WHEN 'lapsed'      THEN 'lapsed'
    WHEN 'other'       THEN 'cancelled'
    ELSE 'lost'
  END;
  v_reason := CASE WHEN p_category = 'other' THEN 'Other: ' || p_reason ELSE p_reason END;

  UPDATE public.renewals SET
    status                     = v_renewal_status,
    cancelled_reason           = CASE WHEN v_renewal_status = 'cancelled'   THEN v_reason ELSE cancelled_reason END,
    non_renewal_reason         = CASE WHEN v_renewal_status = 'non_renewed' THEN v_reason ELSE non_renewal_reason END,
    lost_reason                = CASE WHEN v_renewal_status = 'lost'        THEN v_reason ELSE lost_reason END,
    lapsed_reason              = CASE WHEN v_renewal_status = 'lapsed'      THEN v_reason ELSE lapsed_reason END,
    termination_effective_date = COALESCE(p_termination_date, termination_effective_date),
    -- 'lapsed' is not in the status-change trigger's terminal completed_at set
    completed_at               = CASE WHEN v_renewal_status = 'lapsed' THEN NOW() ELSE completed_at END
  WHERE id = p_renewal_id;

  UPDATE public.policies SET
    status              = v_policy_status,
    cancelled_at        = CASE WHEN v_policy_status = 'cancelled' AND p_termination_date IS NOT NULL
                               THEN p_termination_date ELSE cancelled_at END,
    cancellation_reason = CASE WHEN v_policy_status = 'cancelled' THEN v_reason ELSE cancellation_reason END
  WHERE id = p_policy_id;

  INSERT INTO public.customer_notes (customer_id, note_text, created_by)
  VALUES (
    p_account_id,
    CASE WHEN p_notes IS NOT NULL AND length(trim(p_notes)) > 0
         THEN 'Not renewed (' || p_category || '): ' || p_reason || '. ' || p_notes
         ELSE 'Not renewed (' || p_category || '): ' || p_reason END,
    v_uid
  );

  RETURN v_renewal_status;
END;
$$;

REVOKE ALL ON FUNCTION public.renewal_mark_lost(uuid, uuid, uuid, text, text, date, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.renewal_mark_lost(uuid, uuid, uuid, text, text, date, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. renewal_reopen: reopen the renewal BEFORE reactivating the policy, and
--    clear/refuse open siblings so a policy never ends up with two open rows
-- ---------------------------------------------------------------------------

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

  IF v_policy IS NOT NULL THEN
    -- Reopening a 'renewed' renewal: the sync trigger already spawned a next-term
    -- row. If it is pristine (system-minted, untouched), remove it so the reopen
    -- does not leave two open renewals; if an agent has worked it, refuse.
    DELETE FROM public.renewals
    WHERE policy_id = v_policy
      AND id <> p_renewal_id
      AND status IN ('upcoming', 'in_progress')
      AND new_effective_date IS NULL
      AND new_expiration_date IS NULL
      AND last_contact_date IS NULL
      AND assigned_to IS NULL;

    IF EXISTS (
      SELECT 1 FROM public.renewals
      WHERE policy_id = v_policy
        AND id <> p_renewal_id
        AND status IN ('upcoming', 'in_progress')
    ) THEN
      RAISE EXCEPTION 'This policy already has an open renewal with agent work on it; work that renewal or close it before reopening this one.';
    END IF;
  END IF;

  -- Reopen the renewal FIRST: the policy reactivation below fires the sync
  -- trigger, which must find this row open (and update it) rather than insert
  -- a duplicate.
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

  IF v_policy IS NOT NULL AND v_status IN ('lost', 'cancelled', 'non_renewed', 'lapsed') THEN
    UPDATE public.policies
    SET status = 'active', cancelled_at = NULL, cancellation_reason = NULL
    WHERE id = v_policy;
  END IF;

  INSERT INTO public.customer_notes (customer_id, note_text, created_by)
  VALUES (v_acct, 'Renewal reopened (was ' || v_status || ')', v_uid);
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. renewal_mark_moved: scope the duplicate-number guard to LIVE policies
--    (the real uniqueness is policies_policy_number_active_unique, a partial
--     index WHERE deleted_at IS NULL; matching tombstoned rows falsely blocked
--     legitimate moves to a number that only exists on a merged-away policy)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.renewal_mark_moved(p_renewal_id uuid, p_policy_id uuid, p_account_id uuid, p_carrier text, p_policy_number text, p_premium numeric, p_policy_term text, p_effective_date date, p_expiration_date date, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid              uuid := auth.uid();
  v_status           text;
  v_old              public.policies%ROWTYPE;
  v_carrier_id       uuid;
  v_new_policy_id    uuid;
  v_moved_term       text;
  v_existing_account uuid;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_policy_term NOT IN ('semiannual', 'annual') THEN
    RAISE EXCEPTION 'Invalid policy_term: %', p_policy_term;
  END IF;

  SELECT status INTO v_status FROM public.renewals WHERE id = p_renewal_id FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Renewal % not found', p_renewal_id;
  END IF;
  IF v_status IN ('moved', 'renewed', 'lost', 'cancelled', 'non_renewed', 'lapsed', 'completed') THEN
    RAISE EXCEPTION 'Renewal % is already closed (status %)', p_renewal_id, v_status;
  END IF;

  SELECT * INTO v_old FROM public.policies WHERE id = p_policy_id;
  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Policy % not found', p_policy_id;
  END IF;

  SELECT account_id INTO v_existing_account
  FROM public.policies
  WHERE lower(policy_number) = lower(p_policy_number)
    AND deleted_at IS NULL
  ORDER BY (status::text = 'active') DESC, created_at DESC
  LIMIT 1;
  IF v_existing_account IS NOT NULL THEN
    RAISE EXCEPTION 'This policy number is already added for this customer.'
      USING DETAIL = 'DUPLICATE_POLICY_NUMBER=' || v_existing_account::text;
  END IF;

  SELECT id INTO v_carrier_id FROM public.carriers WHERE name ILIKE p_carrier LIMIT 1;
  v_moved_term := CASE WHEN p_policy_term = 'semiannual' THEN '6_month' ELSE 'annual' END;

  INSERT INTO public.policies (
    account_id, insured_user_id, policy_number, carrier, carrier_id,
    line_of_business, premium, effective_date, expiration_date,
    billing_frequency, billing_method, policy_term, status, created_by
  ) VALUES (
    p_account_id, v_uid, p_policy_number, p_carrier, v_carrier_id,
    v_old.line_of_business, p_premium, p_effective_date, p_expiration_date,
    v_old.billing_frequency, v_old.billing_method, p_policy_term, 'active', v_uid
  ) RETURNING id INTO v_new_policy_id;

  UPDATE public.policies SET status = 'inactive' WHERE id = p_policy_id;

  UPDATE public.renewals SET
    status                     = 'moved',
    moved_carrier              = p_carrier,
    moved_premium              = p_premium,
    moved_term                 = v_moved_term,
    renewal_premium            = p_premium,
    policy_term                = p_policy_term,
    new_effective_date         = p_effective_date,
    new_expiration_date        = p_expiration_date,
    termination_effective_date = p_effective_date
  WHERE id = p_renewal_id;

  INSERT INTO public.customer_notes (customer_id, note_text, created_by)
  VALUES (
    p_account_id,
    CASE WHEN p_notes IS NOT NULL AND length(trim(p_notes)) > 0
         THEN 'Moved to ' || p_carrier || ': ' || p_notes
         ELSE 'Policy moved to ' || p_carrier END,
    v_uid
  );

  RETURN v_new_policy_id;
END;
$function$;
