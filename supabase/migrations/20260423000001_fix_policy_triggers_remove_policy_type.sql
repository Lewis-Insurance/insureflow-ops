-- Fix trigger functions that reference policies.policy_type (column does not exist)
-- policies table uses line_of_business; policy_type only exists on renewals (destination)

-- ============================================================================
-- FIX 1: auto_sync_policy_to_renewal
-- Remove COALESCE(NEW.line_of_business, NEW.policy_type) references.
-- The policies table has no policy_type column; use NEW.line_of_business directly.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.auto_sync_policy_to_renewal()
RETURNS TRIGGER AS $$
DECLARE
  v_existing_id UUID;
  v_carrier_name TEXT;
BEGIN
  IF NEW.expiration_date IS NULL
    OR NEW.status NOT IN ('active', 'pending')
    OR NEW.account_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.expiration_date < CURRENT_DATE
    OR NEW.expiration_date > CURRENT_DATE + INTERVAL '90 days' THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_carrier_name
  FROM public.carriers
  WHERE id = NEW.carrier_id;

  SELECT id INTO v_existing_id
  FROM public.renewals
  WHERE policy_id = NEW.id;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.renewals
    SET
      policy_number   = NEW.policy_number,
      policy_type     = COALESCE(NEW.line_of_business, policy_type),
      carrier         = COALESCE(v_carrier_name, NEW.carrier),
      renewal_date    = NEW.expiration_date,
      expiration_date = NEW.expiration_date,
      current_premium = NEW.premium,
      updated_at      = NOW()
    WHERE id = v_existing_id;
  ELSE
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
      COALESCE(NEW.line_of_business, ''),
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
-- FIX 2: trigger_automation_on_policy_change
-- Replace OLD.policy_type / NEW.policy_type with line_of_business.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.trigger_automation_on_policy_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trigger_type TEXT;
  v_trigger_data JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_trigger_type := 'policy_created';
    v_trigger_data := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.line_of_business IS DISTINCT FROM NEW.line_of_business THEN
      v_trigger_type := 'policy_type_changed';
      v_trigger_data := jsonb_build_object(
        'old_type', OLD.line_of_business,
        'new_type', NEW.line_of_business,
        'policy',   to_jsonb(NEW)
      );
    ELSIF OLD.status != NEW.status THEN
      v_trigger_type := 'policy_status_changed';
      v_trigger_data := jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'policy',     to_jsonb(NEW)
      );
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  PERFORM public.process_automation_rules(
    v_trigger_type,
    'policy',
    NEW.id,
    v_trigger_data
  );

  RETURN NEW;
END;
$$;
