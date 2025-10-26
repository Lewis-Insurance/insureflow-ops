-- Fix trigger functions to use correct column names
-- The lead_activities table uses 'title' and 'created_by', not 'subject' and 'performed_by'

CREATE OR REPLACE FUNCTION public.log_lead_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.lead_activities (
      lead_id,
      activity_type,
      title,
      description,
      old_value,
      new_value,
      created_by,
      metadata
    ) VALUES (
      NEW.id,
      'status_change',
      'Status Changed',
      'Status changed from ' || COALESCE(OLD.status, 'none') || ' to ' || NEW.status,
      OLD.status,
      NEW.status,
      NEW.assigned_to,
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'timestamp', timezone('utc'::text, now())
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_lead_score_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.lead_score IS DISTINCT FROM NEW.lead_score THEN
    -- Log to score history
    INSERT INTO public.lead_score_history (
      lead_id,
      old_score,
      new_score,
      score_delta,
      reason
    ) VALUES (
      NEW.id,
      COALESCE(OLD.lead_score, 0),
      NEW.lead_score,
      NEW.lead_score - COALESCE(OLD.lead_score, 0),
      'Score updated'
    );
    
    -- Log activity with correct columns
    INSERT INTO public.lead_activities (
      lead_id,
      activity_type,
      title,
      description,
      old_value,
      new_value,
      created_by,
      metadata
    ) VALUES (
      NEW.id,
      'score_change',
      'Lead Score Changed',
      'Lead score changed from ' || COALESCE(OLD.lead_score::text, '0') || ' to ' || NEW.lead_score::text,
      COALESCE(OLD.lead_score::text, '0'),
      NEW.lead_score::text,
      NEW.assigned_to,
      jsonb_build_object(
        'old_score', COALESCE(OLD.lead_score, 0),
        'new_score', NEW.lead_score,
        'score_delta', NEW.lead_score - COALESCE(OLD.lead_score, 0),
        'timestamp', timezone('utc'::text, now())
      )
    );
  END IF;
  RETURN NEW;
END;
$$;