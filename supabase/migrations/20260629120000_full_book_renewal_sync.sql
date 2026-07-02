-- Full-book renewal sync
-- ============================================================================
-- Every active/pending policy is tracked as an OPEN "upcoming" renewal from the
-- moment it is written or renewed, keyed to its expiration date. This replaces
-- the prior behavior that only synced policies expiring within the next 90 days.
--
-- Three fixes vs. the prior behavior:
--   1. No expiration-date window. Active policies are tracked regardless of how
--      far out -- or how far past -- their expiration date is.
--   2. Matching is by OPEN renewal (status in upcoming/in_progress), not by any
--      renewal for the policy. A policy whose only renewal is a closed outcome
--      (renewed/moved/lost) gets a fresh "upcoming" renewal for its current term.
--   3. sync_policies_to_renewals() previously omitted expiration_date (a NOT NULL
--      column) from its INSERT and failed on every new row -- fixed here.
--
-- Policies with a NULL expiration_date cannot be tracked (a renewal requires a
-- date) and are intentionally left out; they are a data-quality gap to resolve
-- separately.

-- ----------------------------------------------------------------------------
-- 1) Trigger function: keep one open renewal per active policy, in real time
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_sync_policy_to_renewal()
RETURNS TRIGGER AS $$
DECLARE
  v_open_id UUID;
  v_carrier_name TEXT;
BEGIN
  -- Only active/pending policies with an account and an expiration date are
  -- tracked. Terminal policies (cancelled/lost/...) are left untouched.
  IF NEW.expiration_date IS NULL
    OR NEW.status NOT IN ('active', 'pending')
    OR NEW.account_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_carrier_name FROM public.carriers WHERE id = NEW.carrier_id;

  -- Find an OPEN renewal for this policy (ignore closed outcomes).
  SELECT id INTO v_open_id
  FROM public.renewals
  WHERE policy_id = NEW.id AND status IN ('upcoming', 'in_progress')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_open_id IS NOT NULL THEN
    UPDATE public.renewals SET
      policy_number   = NEW.policy_number,
      policy_type     = COALESCE(NULLIF(NEW.line_of_business, ''), 'other'),
      carrier         = COALESCE(v_carrier_name, NEW.carrier),
      renewal_date    = NEW.expiration_date,
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
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_sync_policy_to_renewal ON public.policies;
CREATE TRIGGER trg_auto_sync_policy_to_renewal
  AFTER INSERT OR UPDATE OF expiration_date, status, premium, policy_number, line_of_business, carrier_id, account_id
  ON public.policies
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_sync_policy_to_renewal();

COMMENT ON FUNCTION public.auto_sync_policy_to_renewal IS
'Keeps exactly one OPEN (upcoming/in_progress) renewal per active/pending policy, keyed to its expiration date. Full book, no date window. Closed renewals are left as history.';

-- ----------------------------------------------------------------------------
-- 2) Maintenance / manual sync: set-based, full book, idempotent, change-only
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_policies_to_renewals(days_ahead INTEGER DEFAULT 90)
RETURNS TABLE (synced_count INTEGER, updated_count INTEGER, new_count INTEGER) AS $$
DECLARE
  v_updated INTEGER := 0;
  v_new INTEGER := 0;
BEGIN
  -- days_ahead is retained for call-signature compatibility but no longer
  -- limits the book: every active/pending policy with an expiration date is
  -- tracked.

  -- Refresh existing OPEN renewals whose policy fields have drifted. The
  -- change-only guard keeps this a no-op write at steady state.
  WITH upd AS (
    UPDATE public.renewals r SET
      policy_number   = p.policy_number,
      policy_type     = COALESCE(NULLIF(p.line_of_business, ''), 'other'),
      carrier         = COALESCE(c.name, p.carrier),
      renewal_date    = p.expiration_date,
      expiration_date = p.expiration_date,
      current_premium = p.premium,
      updated_at      = NOW()
    FROM public.policies p
    LEFT JOIN public.carriers c ON c.id = p.carrier_id
    WHERE r.policy_id = p.id
      AND r.status IN ('upcoming', 'in_progress')
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

  -- Create an OPEN renewal for any active/pending policy that lacks one.
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
    WHERE p.status IN ('active', 'pending')
      AND p.account_id IS NOT NULL
      AND p.expiration_date IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.renewals r
        WHERE r.policy_id = p.id AND r.status IN ('upcoming', 'in_progress')
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_new FROM ins;

  RETURN QUERY SELECT (v_updated + v_new), v_updated, v_new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.sync_policies_to_renewals IS
'Idempotent full-book reconciler: ensures every active/pending policy with an expiration date has one OPEN renewal, and refreshes drifted ones. Self-heals the renew-cycle gap. days_ahead is ignored (kept for signature compatibility).';

GRANT EXECUTE ON FUNCTION public.sync_policies_to_renewals(INTEGER) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3) One-time backfill: place every currently-untracked active policy
-- ----------------------------------------------------------------------------
SELECT public.sync_policies_to_renewals();
