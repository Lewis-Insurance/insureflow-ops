-- Add a friendly duplicate guard to the "Moved" commit. When the agent tries to move a policy
-- to a new carrier but the entered policy number already exists (policy_number is globally
-- unique -- most often because the pre-seeded current number was left unchanged), the raw INSERT
-- raised an opaque unique-violation. Instead, detect it up front and raise a typed error the
-- client turns into a plain-English "already added for this customer" prompt with a deep link.
-- The existing owner account id is encoded in the message so the UI can link straight to it.
--
-- Everything else is identical to 20260630130000_renewal_mark_moved_rpc.sql (still atomic +
-- idempotent). Applied to PROD (lrqajzwcmdwahnjyidgv) via Supabase MCP on 2026-07-01.
CREATE OR REPLACE FUNCTION public.renewal_mark_moved(
  p_renewal_id      uuid,
  p_policy_id       uuid,
  p_account_id      uuid,
  p_carrier         text,
  p_policy_number   text,
  p_premium         numeric,
  p_policy_term     text,
  p_effective_date  date,
  p_expiration_date date,
  p_notes           text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Friendly duplicate guard: a policy with this number already exists. Surface a typed error
  -- ('DUPLICATE_POLICY_NUMBER=<owner account id>') so the client shows a friendly prompt with a
  -- link instead of a raw 23505. Case-insensitive to match the number the agent would recognize.
  SELECT account_id INTO v_existing_account
  FROM public.policies
  WHERE lower(policy_number) = lower(p_policy_number)
  LIMIT 1;
  IF v_existing_account IS NOT NULL THEN
    -- Human-readable MESSAGE (shown as-is by any client) + machine-readable DETAIL the UI parses
    -- for the owner account to deep-link. Robust even before the matching frontend ships.
    RAISE EXCEPTION 'This policy number is already added for this customer.'
      USING DETAIL = 'DUPLICATE_POLICY_NUMBER=' || v_existing_account::text;
  END IF;

  SELECT id INTO v_carrier_id FROM public.carriers WHERE name ILIKE p_carrier LIMIT 1;
  v_moved_term := CASE WHEN p_policy_term = 'semiannual' THEN '6_month' ELSE 'annual' END;

  -- 1. New (moved-to) policy, copying durable fields from the old one.
  INSERT INTO public.policies (
    account_id, insured_user_id, policy_number, carrier, carrier_id,
    line_of_business, premium, effective_date, expiration_date,
    billing_frequency, billing_method, policy_term, status, created_by
  ) VALUES (
    p_account_id, v_uid, p_policy_number, p_carrier, v_carrier_id,
    v_old.line_of_business, p_premium, p_effective_date, p_expiration_date,
    v_old.billing_frequency, v_old.billing_method, p_policy_term, 'active', v_uid
  ) RETURNING id INTO v_new_policy_id;

  -- 2. Deactivate the old policy (status only; its data is preserved).
  UPDATE public.policies SET status = 'inactive' WHERE id = p_policy_id;

  -- 3. Close the renewal as moved.
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

  -- 4. Audit note on the shared customer record.
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
$$;

REVOKE ALL ON FUNCTION public.renewal_mark_moved(uuid, uuid, uuid, text, text, numeric, text, date, date, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.renewal_mark_moved(uuid, uuid, uuid, text, text, numeric, text, date, date, text) TO authenticated;
