-- Fix trigger function to avoid relying on missing GUCs and to call edge function only when configured
CREATE OR REPLACE FUNCTION public.trigger_lead_scoring()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_url text;
  v_key text;
BEGIN
  -- Read optional settings safely (no error if not set)
  v_url := current_setting('app.settings.supabase_url', true);
  v_key := current_setting('app.settings.supabase_service_role_key', true);

  -- If not configured, skip external scoring call to prevent errors
  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN NEW;
  END IF;

  -- Asynchronous scoring request via pg_net
  PERFORM
    net.http_post(
      url := v_url || '/functions/v1/lead-scoring-engine',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body := jsonb_build_object(
        'leadIds', jsonb_build_array(NEW.id)
      )
    );

  RETURN NEW;
END;
$function$;