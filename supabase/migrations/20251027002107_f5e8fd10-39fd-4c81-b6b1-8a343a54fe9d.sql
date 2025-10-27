-- =====================================================
-- AUTOMATIC LEAD SCORING TRIGGER
-- =====================================================

-- Function to trigger lead scoring via edge function
CREATE OR REPLACE FUNCTION public.trigger_lead_scoring()
RETURNS TRIGGER AS $$
DECLARE
  request_id bigint;
  v_url text;
  v_key text;
BEGIN
  -- Read optional settings safely (no error if not set)
  v_url := current_setting('app.settings.supabase_url', true);
  v_key := current_setting('app.settings.supabase_service_role_key', true);

  -- If not configured, skip external scoring call to prevent errors
  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'Lead scoring configuration not set. Skipping automatic scoring.';
    RETURN NEW;
  END IF;

  -- Call the edge function asynchronously using pg_net
  SELECT net.http_post(
    url := v_url || '/functions/v1/lead-scoring-engine',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object(
      'leadIds', ARRAY[NEW.id]
    )
  ) INTO request_id;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the insert/update
    RAISE WARNING 'Failed to trigger lead scoring: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing auto-score triggers to avoid duplicates
DROP TRIGGER IF EXISTS lead_auto_score_trigger ON public.leads;
DROP TRIGGER IF EXISTS auto_score_lead_on_insert ON public.leads;
DROP TRIGGER IF EXISTS auto_score_lead_on_update ON public.leads;

-- Create trigger that fires on INSERT or UPDATE of scoring-relevant fields
CREATE TRIGGER lead_auto_score_trigger
AFTER INSERT OR UPDATE OF 
  insurance_types,
  current_premium,
  decision_timeframe,
  email,
  phone,
  current_carrier,
  source_id
ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.trigger_lead_scoring();

-- =====================================================
-- MANUAL SCORING FUNCTION (for batch operations)
-- =====================================================

-- Function to manually rescore leads (callable from SQL or app)
CREATE OR REPLACE FUNCTION public.rescore_leads(lead_ids UUID[] DEFAULT NULL)
RETURNS jsonb AS $$
DECLARE
  request_id bigint;
  v_url text;
  v_key text;
BEGIN
  -- Read optional settings safely
  v_url := current_setting('app.settings.supabase_url', true);
  v_key := current_setting('app.settings.supabase_service_role_key', true);

  -- If not configured, return error
  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Lead scoring configuration not set'
    );
  END IF;

  -- If no specific leads provided, rescore all
  IF lead_ids IS NULL THEN
    SELECT net.http_post(
      url := v_url || '/functions/v1/lead-scoring-engine',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body := jsonb_build_object(
        'rescore_all', true
      )
    ) INTO request_id;
  ELSE
    SELECT net.http_post(
      url := v_url || '/functions/v1/lead-scoring-engine',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body := jsonb_build_object(
        'leadIds', lead_ids
      )
    ) INTO request_id;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Lead scoring triggered',
    'request_id', request_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.trigger_lead_scoring() IS 'Automatically triggers lead scoring when lead data changes';
COMMENT ON FUNCTION public.rescore_leads(UUID[]) IS 'Manually trigger lead scoring for specific leads or all leads';