-- Renewals "Moved" when the replacement policy is ALREADY on the customer's file.
--
-- Before this change renewal_mark_moved could only ever INSERT the moved-to policy. When the
-- office had already added it by hand (Thomas Starling: Southern-Owners GL cancelled, the
-- Nationwide GL already on the account) the insert hit the live-policy-number guard, the RPC
-- raised, and the widget dead-ended on a "Policy already added" modal: the renewal stayed open
-- and the old policy stayed in force. There was no way to finish the move.
--
-- What changes:
--   1. New optional argument p_existing_policy_id. When supplied the RPC LINKS that policy as
--      the moved-to policy instead of inserting a new one: it never edits the linked policy's
--      data (the office typed it off the dec page), it only lifts a 'pending' status to
--      'active', and it records the renewal's moved_* fields FROM that policy so the closed
--      renewal is truthful no matter what the form sent.
--   2. The duplicate-number guard now classifies the collision instead of raising one opaque
--      message, so the client can offer the right next step:
--        SAME_AS_CURRENT_POLICY     - the number was left as the policy being renewed
--        POLICY_ALREADY_ON_ACCOUNT  - a different live policy on THIS customer owns it (linkable)
--        DUPLICATE_POLICY_NUMBER    - it belongs to ANOTHER customer (a real conflict)
--      Every message still contains the words "already added" so an older frontend bundle keeps
--      showing its friendly modal during a deploy.
--   3. Closing a move no longer overwrites a terminal status on the outgoing policy. If the
--      office already recorded it as cancelled / lost / lapsed / non_renewed / expired, that
--      disposition (and its cancelled_at + reason) survives; only a live policy flips to
--      'inactive'.
--
-- The old 10-argument signature is dropped so PostgREST cannot see two overloads; the new
-- argument defaults to NULL, so a client that omits it resolves here and behaves exactly as
-- before. Everything still runs in one transaction and the closed-renewal idempotency guard is
-- unchanged.
--
-- Applied to PROD (lrqajzwcmdwahnjyidgv) via Supabase MCP on 2026-08-26.

DROP FUNCTION IF EXISTS public.renewal_mark_moved(uuid, uuid, uuid, text, text, numeric, text, date, date, text);

CREATE OR REPLACE FUNCTION public.renewal_mark_moved(
  p_renewal_id        uuid,
  p_policy_id         uuid,
  p_account_id        uuid,
  p_carrier           text,
  p_policy_number     text,
  p_premium           numeric,
  p_policy_term       text,
  p_effective_date    date,
  p_expiration_date   date,
  p_notes             text DEFAULT NULL,
  p_existing_policy_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid           uuid := auth.uid();
  v_status        text;
  v_old           public.policies%ROWTYPE;
  v_link          public.policies%ROWTYPE;
  v_dup           public.policies%ROWTYPE;
  v_carrier_id    uuid;
  v_new_policy_id uuid;
  v_term          text;
  v_moved_term    text;
  v_carrier       text;
  v_premium       numeric;
  v_effective     date;
  v_expiration    date;
  v_note          text;
  -- Statuses that already say the policy is off the books; a move must not overwrite them.
  c_dead          text[] := ARRAY['cancelled', 'lost', 'lapsed', 'non_renewed', 'expired'];
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_policy_term NOT IN ('semiannual', 'annual') THEN
    RAISE EXCEPTION 'Invalid policy_term: %', p_policy_term;
  END IF;

  -- Idempotency guard: lock the renewal and refuse to re-run a closed one, so a retry after a
  -- partial failure can never create a second new policy.
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

  IF p_existing_policy_id IS NOT NULL THEN
    -- ---------------------------------------------------------------------
    -- LINK MODE: the replacement policy is already on the file.
    -- ---------------------------------------------------------------------
    SELECT * INTO v_link
    FROM public.policies
    WHERE id = p_existing_policy_id AND deleted_at IS NULL
    FOR UPDATE;

    IF v_link.id IS NULL THEN
      RAISE EXCEPTION 'The policy you selected no longer exists.';
    END IF;
    IF v_link.id = p_policy_id THEN
      RAISE EXCEPTION 'Select the new policy, not the one being renewed.';
    END IF;
    IF v_link.account_id IS DISTINCT FROM p_account_id THEN
      RAISE EXCEPTION 'That policy belongs to a different customer.';
    END IF;
    IF COALESCE(v_link.status, 'active') = ANY (c_dead) THEN
      RAISE EXCEPTION 'That policy is % and cannot be the new policy.', v_link.status;
    END IF;

    -- The linked policy is the source of truth: the office entered it off the dec page. Its
    -- data is never overwritten here, only read into the renewal's outcome fields.
    v_term := CASE
                WHEN v_link.policy_term IN ('semiannual', 'semi_annual', '6_month') THEN 'semiannual'
                WHEN v_link.policy_term = 'annual' THEN 'annual'
                WHEN v_link.effective_date IS NOT NULL
                     AND v_link.expiration_date IS NOT NULL
                     AND (v_link.expiration_date - v_link.effective_date) <= 200 THEN 'semiannual'
                ELSE 'annual'
              END;
    v_carrier    := COALESCE(NULLIF(trim(v_link.carrier), ''), p_carrier);
    v_premium    := COALESCE(v_link.premium, p_premium);
    v_effective  := COALESCE(v_link.effective_date, p_effective_date);
    v_expiration := COALESCE(v_link.expiration_date, p_expiration_date);

    -- A replacement the office staged as 'pending' becomes the in-force policy on commit.
    IF COALESCE(v_link.status, 'active') = 'pending' THEN
      UPDATE public.policies SET status = 'active' WHERE id = v_link.id;
    END IF;

    v_new_policy_id := v_link.id;
    v_note := 'Policy moved to ' || v_carrier || '. Linked the policy already on file ('
              || v_link.policy_number || ').';
  ELSE
    -- ---------------------------------------------------------------------
    -- CREATE MODE: no replacement on file, so the moved-to policy is inserted.
    -- ---------------------------------------------------------------------
    -- Classify a live policy-number collision (the real uniqueness is the partial index
    -- policies_policy_number_active_unique, WHERE deleted_at IS NULL) so the client can offer
    -- the right next step instead of a dead end. Case-insensitive to match what an agent reads.
    SELECT * INTO v_dup
    FROM public.policies
    WHERE lower(policy_number) = lower(p_policy_number)
      AND deleted_at IS NULL
    ORDER BY (status = 'active') DESC, created_at DESC
    LIMIT 1;

    IF v_dup.id = p_policy_id THEN
      RAISE EXCEPTION 'That is the current policy number, already added on this policy. Enter the new carrier''s policy number, or pick the policy that is already on the file.'
        USING DETAIL = 'SAME_AS_CURRENT_POLICY=' || v_dup.id::text;
    ELSIF v_dup.id IS NOT NULL AND v_dup.account_id = p_account_id THEN
      RAISE EXCEPTION 'This policy is already added on this customer. Use it as the new policy to finish the move.'
        USING DETAIL = 'POLICY_ALREADY_ON_ACCOUNT=' || v_dup.id::text
                       || ';OWNER_ACCOUNT=' || v_dup.account_id::text;
    ELSIF v_dup.id IS NOT NULL THEN
      RAISE EXCEPTION 'This policy number is already added on a different customer.'
        USING DETAIL = 'DUPLICATE_POLICY_NUMBER=' || v_dup.account_id::text;
    END IF;

    SELECT id INTO v_carrier_id FROM public.carriers WHERE name ILIKE p_carrier LIMIT 1;

    INSERT INTO public.policies (
      account_id, insured_user_id, policy_number, carrier, carrier_id,
      line_of_business, premium, effective_date, expiration_date,
      billing_frequency, billing_method, policy_term, status, created_by
    ) VALUES (
      p_account_id, v_uid, p_policy_number, p_carrier, v_carrier_id,
      v_old.line_of_business, p_premium, p_effective_date, p_expiration_date,
      v_old.billing_frequency, v_old.billing_method, p_policy_term, 'active', v_uid
    ) RETURNING id INTO v_new_policy_id;

    v_term       := p_policy_term;
    v_carrier    := p_carrier;
    v_premium    := p_premium;
    v_effective  := p_effective_date;
    v_expiration := p_expiration_date;
    v_note       := 'Policy moved to ' || v_carrier || '.';
  END IF;

  v_moved_term := CASE WHEN v_term = 'semiannual' THEN '6_month' ELSE 'annual' END;

  -- Retire the outgoing policy. A disposition the office already recorded (cancelled, lost,
  -- lapsed, non_renewed, expired) is more specific than 'inactive', so it is kept.
  UPDATE public.policies
  SET status = 'inactive'
  WHERE id = p_policy_id
    AND NOT (COALESCE(status, 'active') = ANY (c_dead));

  -- Close the renewal as moved, from the values that actually landed on the new policy.
  UPDATE public.renewals SET
    status                     = 'moved',
    moved_carrier              = v_carrier,
    moved_premium              = v_premium,
    moved_term                 = v_moved_term,
    renewal_premium            = v_premium,
    policy_term                = v_term,
    new_effective_date         = v_effective,
    new_expiration_date        = v_expiration,
    termination_effective_date = v_effective
  WHERE id = p_renewal_id;

  -- Audit note on the shared customer record.
  INSERT INTO public.customer_notes (customer_id, note_text, created_by)
  VALUES (
    p_account_id,
    CASE WHEN p_notes IS NOT NULL AND length(trim(p_notes)) > 0
         THEN v_note || ' ' || trim(p_notes)
         ELSE v_note END,
    v_uid
  );

  RETURN v_new_policy_id;
END;
$$;

REVOKE ALL ON FUNCTION public.renewal_mark_moved(uuid, uuid, uuid, text, text, numeric, text, date, date, text, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.renewal_mark_moved(uuid, uuid, uuid, text, text, numeric, text, date, date, text, uuid) TO authenticated;
