-- Auto-sync policies to renewals table on insert/update
-- Ensures new policies with expiration dates automatically create renewal records

-- ============================================================================
-- TRIGGER FUNCTION: auto_sync_policy_to_renewal
-- Creates or updates a renewal record when a policy is inserted or updated
-- with an expiration date within the next 90 days
-- ============================================================================
CREATE OR REPLACE FUNCTION public.auto_sync_policy_to_renewal()
RETURNS TRIGGER AS $$
DECLARE
  v_existing_id UUID;
  v_carrier_name TEXT;
BEGIN
  -- Only process if policy has an expiration date, is active/pending, and has an account
  IF NEW.expiration_date IS NULL
    OR NEW.status NOT IN ('active', 'pending')
    OR NEW.account_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only sync policies expiring within the next 90 days
  IF NEW.expiration_date < CURRENT_DATE
    OR NEW.expiration_date > CURRENT_DATE + INTERVAL '90 days' THEN
    RETURN NEW;
  END IF;

  -- Get carrier name
  SELECT name INTO v_carrier_name
  FROM public.carriers
  WHERE id = NEW.carrier_id;

  -- Check if renewal already exists for this policy
  SELECT id INTO v_existing_id
  FROM public.renewals
  WHERE policy_id = NEW.id;

  IF v_existing_id IS NOT NULL THEN
    -- Update existing renewal
    UPDATE public.renewals
    SET
      policy_number = NEW.policy_number,
      policy_type = COALESCE(NEW.line_of_business, NEW.policy_type),
      carrier = COALESCE(v_carrier_name, NEW.carrier),
      renewal_date = NEW.expiration_date,
      expiration_date = NEW.expiration_date,
      current_premium = NEW.premium,
      updated_at = NOW()
    WHERE id = v_existing_id;
  ELSE
    -- Insert new renewal
    INSERT INTO public.renewals (
      account_id,
      policy_id,
      policy_number,
      policy_type,
      carrier,
      renewal_date,
      expiration_date,
      current_premium,
      renewal_premium,
      status,
      risk_level,
      created_at,
      updated_at
    ) VALUES (
      NEW.account_id,
      NEW.id,
      NEW.policy_number,
      COALESCE(NEW.line_of_business, NEW.policy_type),
      COALESCE(v_carrier_name, NEW.carrier),
      NEW.expiration_date,
      NEW.expiration_date,
      NEW.premium,
      NEW.premium,
      'upcoming',
      'low',
      NOW(),
      NOW()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- DROP existing trigger if any, then create
-- ============================================================================
DROP TRIGGER IF EXISTS trg_auto_sync_policy_to_renewal ON public.policies;

CREATE TRIGGER trg_auto_sync_policy_to_renewal
  AFTER INSERT OR UPDATE OF expiration_date, status, premium, policy_number, line_of_business, carrier_id, account_id
  ON public.policies
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_sync_policy_to_renewal();

-- Add comment
COMMENT ON FUNCTION public.auto_sync_policy_to_renewal IS
'Trigger function that automatically creates or updates a renewal record when a policy is inserted or updated with an expiration date within 90 days. Ensures the renewals table stays in sync with policies.';
