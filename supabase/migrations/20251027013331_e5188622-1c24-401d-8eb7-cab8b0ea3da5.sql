-- ============================================================================
-- NURTURE CAMPAIGN AUTO-ENROLLMENT SYSTEM
-- ============================================================================

-- Function to check if a lead matches campaign trigger conditions
CREATE OR REPLACE FUNCTION public.check_campaign_trigger_match(
  p_lead_id UUID,
  p_campaign_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead RECORD;
  v_campaign RECORD;
  v_conditions JSONB;
  v_lead_tags TEXT[];
BEGIN
  -- Fetch lead data
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Fetch campaign and conditions
  SELECT * INTO v_campaign FROM public.nurture_campaigns 
  WHERE id = p_campaign_id AND status = 'active';
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  v_conditions := v_campaign.trigger_conditions;

  -- Check lead status
  IF v_conditions ? 'lead_status' THEN
    IF NOT (v_lead.status = ANY(
      ARRAY(SELECT jsonb_array_elements_text(v_conditions->'lead_status'))
    )) THEN
      RETURN FALSE;
    END IF;
  END IF;

  -- Check lead score range
  IF v_conditions ? 'lead_score_min' THEN
    IF COALESCE(v_lead.lead_score, 0) < (v_conditions->>'lead_score_min')::INTEGER THEN
      RETURN FALSE;
    END IF;
  END IF;

  IF v_conditions ? 'lead_score_max' THEN
    IF COALESCE(v_lead.lead_score, 0) > (v_conditions->>'lead_score_max')::INTEGER THEN
      RETURN FALSE;
    END IF;
  END IF;

  -- Check insurance types
  IF v_conditions ? 'insurance_types' AND jsonb_array_length(v_conditions->'insurance_types') > 0 THEN
    IF NOT (
      SELECT bool_or(type = ANY(v_lead.insurance_types))
      FROM jsonb_array_elements_text(v_conditions->'insurance_types') AS type
    ) THEN
      RETURN FALSE;
    END IF;
  END IF;

  -- Check tags (if lead has matching tags)
  IF v_conditions ? 'tags' AND jsonb_array_length(v_conditions->'tags') > 0 THEN
    SELECT ARRAY_AGG(t.name) INTO v_lead_tags
    FROM public.lead_tags lt
    JOIN public.tags t ON t.id = lt.tag_id
    WHERE lt.lead_id = p_lead_id;

    IF v_lead_tags IS NULL OR NOT (
      SELECT bool_or(tag = ANY(v_lead_tags))
      FROM jsonb_array_elements_text(v_conditions->'tags') AS tag
    ) THEN
      RETURN FALSE;
    END IF;
  END IF;

  -- All conditions passed
  RETURN TRUE;
END;
$$;

-- Function to auto-enroll lead in matching campaigns
CREATE OR REPLACE FUNCTION public.auto_enroll_lead_in_campaigns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign RECORD;
  v_first_step JSONB;
  v_next_execution TIMESTAMP WITH TIME ZONE;
  v_delay_ms BIGINT;
  v_already_enrolled BOOLEAN;
BEGIN
  -- Only process on INSERT or when relevant fields change on UPDATE
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = NEW.status 
      AND OLD.lead_score = NEW.lead_score 
      AND OLD.insurance_types = NEW.insurance_types THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Find all active campaigns for this account
  FOR v_campaign IN 
    SELECT * FROM public.nurture_campaigns 
    WHERE account_id = NEW.account_id 
      AND status = 'active'
  LOOP
    -- Check if lead matches campaign conditions
    IF public.check_campaign_trigger_match(NEW.id, v_campaign.id) THEN
      
      -- Check if already enrolled
      SELECT EXISTS(
        SELECT 1 FROM public.campaign_enrollments
        WHERE lead_id = NEW.id 
          AND campaign_id = v_campaign.id
          AND status IN ('active', 'paused')
      ) INTO v_already_enrolled;

      IF NOT v_already_enrolled THEN
        -- Calculate next execution time based on first step
        v_first_step := v_campaign.steps->0;
        v_next_execution := NOW();
        
        IF v_first_step IS NOT NULL THEN
          v_delay_ms := (v_first_step->>'delay_value')::INTEGER * 
            CASE v_first_step->>'delay_unit'
              WHEN 'minutes' THEN 60000
              WHEN 'hours' THEN 3600000
              WHEN 'days' THEN 86400000
              WHEN 'weeks' THEN 604800000
              ELSE 0
            END;
          v_next_execution := NOW() + (v_delay_ms || ' milliseconds')::INTERVAL;
        END IF;

        -- Enroll the lead
        INSERT INTO public.campaign_enrollments (
          campaign_id,
          lead_id,
          account_id,
          status,
          current_step,
          next_execution_at
        ) VALUES (
          v_campaign.id,
          NEW.id,
          NEW.account_id,
          'active',
          0,
          v_next_execution
        );

        -- Update campaign enrollment count
        UPDATE public.nurture_campaigns
        SET enrollment_count = COALESCE(enrollment_count, 0) + 1
        WHERE id = v_campaign.id;

        RAISE NOTICE 'Auto-enrolled lead % into campaign %', NEW.id, v_campaign.name;
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Create trigger on leads table
DROP TRIGGER IF EXISTS trigger_auto_enroll_campaigns ON public.leads;
CREATE TRIGGER trigger_auto_enroll_campaigns
  AFTER INSERT OR UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_enroll_lead_in_campaigns();

-- ============================================================================
-- SCHEDULED PROCESSOR CRON JOB
-- ============================================================================

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the nurture campaign processor to run every 15 minutes
SELECT cron.schedule(
  'nurture-campaign-auto-enrollment',
  '*/15 * * * *', -- Every 15 minutes
  $$
  SELECT net.http_post(
    url:='https://lrqajzwcmdwahnjyidgv.supabase.co/functions/v1/nurture-campaign-processor',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxycWFqendjbWR3YWhuanlpZGd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcyODk5OTksImV4cCI6MjA3Mjg2NTk5OX0.Pyob4fMYhHjHhVCxhP2UdSSMAv6i9eqmLD-lxavfV5s"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);

-- View scheduled jobs
COMMENT ON EXTENSION pg_cron IS 'Nurture campaign processor runs every 15 minutes to auto-enroll matching leads';
