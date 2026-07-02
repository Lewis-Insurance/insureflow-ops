-- Align every DB-side "open renewal" predicate with the frontend's open set.
--
-- RenewalsPage.tsx defines OPEN_STATUSES = (pending, contacted, quoted, upcoming,
-- in_progress) and the renewal editor's "Quoted" working status stores 'quoted' on
-- the row. The sync trigger / reconciler / reopen guard / one-open unique index in
-- 20260702100000 only treated (upcoming, in_progress) as open, so a 'quoted'
-- renewal would be invisible to the policy sync - a policy edit would insert a
-- SECOND open row next to it, and the unique index would not block it.
-- No quoted/pending/contacted rows exist at apply time, so this is a safe predicate
-- widening.

DROP INDEX IF EXISTS public.renewals_one_open_per_policy;
CREATE UNIQUE INDEX renewals_one_open_per_policy
  ON public.renewals (policy_id)
  WHERE status IN ('upcoming', 'in_progress', 'quoted', 'pending', 'contacted');

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

  SELECT id INTO v_open_id
  FROM public.renewals
  WHERE policy_id = NEW.id
    AND status IN ('upcoming', 'in_progress', 'quoted', 'pending', 'contacted')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_open_id IS NOT NULL THEN
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
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

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
      AND r.status IN ('upcoming', 'in_progress', 'quoted', 'pending', 'contacted')
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
        WHERE r.policy_id = p.id
          AND r.status IN ('upcoming', 'in_progress', 'quoted', 'pending', 'contacted')
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
    DELETE FROM public.renewals
    WHERE policy_id = v_policy
      AND id <> p_renewal_id
      AND status IN ('upcoming', 'in_progress', 'quoted', 'pending', 'contacted')
      AND new_effective_date IS NULL
      AND new_expiration_date IS NULL
      AND last_contact_date IS NULL
      AND assigned_to IS NULL;

    IF EXISTS (
      SELECT 1 FROM public.renewals
      WHERE policy_id = v_policy
        AND id <> p_renewal_id
        AND status IN ('upcoming', 'in_progress', 'quoted', 'pending', 'contacted')
    ) THEN
      RAISE EXCEPTION 'This policy already has an open renewal with agent work on it; work that renewal or close it before reopening this one.';
    END IF;
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

  IF v_policy IS NOT NULL AND v_status IN ('lost', 'cancelled', 'non_renewed', 'lapsed') THEN
    UPDATE public.policies
    SET status = 'active', cancelled_at = NULL, cancellation_reason = NULL
    WHERE id = v_policy;
  END IF;

  INSERT INTO public.customer_notes (customer_id, note_text, created_by)
  VALUES (v_acct, 'Renewal reopened (was ' || v_status || ')', v_uid);
END;
$$;
