-- Daily cancellation exact-date collector configuration and durable miss alert.

ALTER TABLE public.radar_config
  ADD COLUMN cancel_source_url text,
  ADD COLUMN cancel_requires_session boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.radar_config.cancel_source_url IS
  'Optional allowlisted HTTPS endpoint accepting one county and exact_date per cancellation request.';

DROP FUNCTION public.configure_radar(uuid,text[],smallint,integer,text[],text[],text[],smallint,smallint);
CREATE FUNCTION public.configure_radar(
  p_workspace_id uuid,
  p_class_allowlist text[],
  p_score_threshold smallint DEFAULT 70,
  p_weekly_capacity integer DEFAULT 0,
  p_counties text[] DEFAULT ARRAY['Columbia','Suwannee','Alachua','Union','Hamilton','Lafayette','Gilchrist'],
  p_home_base_counties text[] DEFAULT ARRAY['Columbia','Suwannee'],
  p_xdate_rotation_counties text[] DEFAULT ARRAY['Alachua','Union','Hamilton','Lafayette','Gilchrist'],
  p_xdate_window_start_days smallint DEFAULT 30,
  p_xdate_window_end_days smallint DEFAULT 60,
  p_cancel_source_url text DEFAULT NULL,
  p_cancel_requires_session boolean DEFAULT NULL
)
RETURNS public.radar_config LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result public.radar_config;
BEGIN
  IF NOT public.is_staff()
    OR p_class_allowlist IS DISTINCT FROM ARRAY['5551','5190','5183','5537','5474','0042','5478','5445','5022','5403','5645','5606','9014','0917','8835','8829','8824','8869','9082','9083','9084','9052','8006','8017','8380','8393','9015','8292']::text[]
    OR p_counties IS DISTINCT FROM ARRAY['Columbia','Suwannee','Alachua','Union','Hamilton','Lafayette','Gilchrist']::text[]
    OR p_home_base_counties IS DISTINCT FROM ARRAY['Columbia','Suwannee']::text[]
    OR p_xdate_rotation_counties IS DISTINCT FROM ARRAY['Alachua','Union','Hamilton','Lafayette','Gilchrist']::text[]
    OR p_score_threshold NOT BETWEEN 0 AND 100 OR p_weekly_capacity < 0
    OR p_xdate_window_start_days <> 30 OR p_xdate_window_end_days <> 60
    OR (p_cancel_source_url IS NOT NULL AND (
      p_cancel_source_url !~ '^https://[^/?#@]+(/[^?#]*)?$' OR length(p_cancel_source_url)>2048
    ))
    OR NOT EXISTS (
      SELECT 1 FROM public.agency_workspace_memberships
      WHERE agency_workspace_id=p_workspace_id AND user_id=auth.uid()
        AND status='active' AND role IN ('owner','admin')
    )
  THEN
    RAISE EXCEPTION 'invalid config or admin access required' USING ERRCODE='42501';
  END IF;

  INSERT INTO public.radar_config(
    agency_workspace_id,class_allowlist,score_threshold,producer_weekly_capacity,
    counties,home_base_counties,xdate_rotation_counties,xdate_window_start_days,xdate_window_end_days,
    cancel_source_url,cancel_requires_session
  ) VALUES (
    p_workspace_id,p_class_allowlist,p_score_threshold,p_weekly_capacity,
    p_counties,p_home_base_counties,p_xdate_rotation_counties,p_xdate_window_start_days,p_xdate_window_end_days,
    p_cancel_source_url,coalesce(p_cancel_requires_session,false)
  )
  ON CONFLICT(agency_workspace_id) DO UPDATE SET
    class_allowlist=excluded.class_allowlist,score_threshold=excluded.score_threshold,
    producer_weekly_capacity=excluded.producer_weekly_capacity,counties=excluded.counties,
    home_base_counties=excluded.home_base_counties,xdate_rotation_counties=excluded.xdate_rotation_counties,
    xdate_window_start_days=excluded.xdate_window_start_days,xdate_window_end_days=excluded.xdate_window_end_days,
    -- Four/nine-argument legacy callers retain a URL configured by the collector rollout.
    cancel_source_url=coalesce(excluded.cancel_source_url,radar_config.cancel_source_url),
    cancel_requires_session=coalesce(p_cancel_requires_session,radar_config.cancel_requires_session),updated_at=now()
  RETURNING * INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.configure_radar(uuid,text[],smallint,integer,text[],text[],text[],smallint,smallint,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.configure_radar(uuid,text[],smallint,integer,text[],text[],text[],smallint,smallint,text,boolean) TO authenticated;

ALTER TABLE public.radar_alert_tasks DROP CONSTRAINT radar_alert_tasks_alert_kind_check;
ALTER TABLE public.radar_alert_tasks ADD CONSTRAINT radar_alert_tasks_alert_kind_check
  CHECK (alert_kind IN ('swo_miss','cancel_miss'));

CREATE FUNCTION public.radar_record_cancel_miss(p_workspace_id uuid, p_eastern_date date, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  task_id uuid;
  recipient record;
  alert_title text := 'Cancellation radar pull missed: '||p_eastern_date;
  alert_body text := 'The scheduled cancellation exact-date pull did not produce new staging rows. Staff review is required. Reason: '
    ||left(coalesce(nullif(btrim(p_reason),''),'unknown'),500);
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.radar_config WHERE agency_workspace_id=p_workspace_id) THEN
    RAISE EXCEPTION 'radar_config not found' USING ERRCODE='P0002';
  END IF;
  INSERT INTO public.tasks(title,description,category,source,entity_type,entity_id,account_id,customer_id,
    related_lead_id,assignee_id,created_by,assigned_by,assignee_agent_id,policy_id,quote_id,document_id,parent_task_id,
    details,notes,ai_generated,confidence,dependencies,evidence,idempotency_key,suggested_assignee_role,
    due_at,completed_at,deleted_at,metadata,dedupe_key,priority,status)
  VALUES (alert_title,alert_body,
    'renewal','wc_renewal_radar','radar_cancel_pull',
    NULL,NULL,NULL,
    NULL,NULL,NULL,
    NULL,NULL,NULL,NULL,NULL,NULL,
    NULL,NULL,false,NULL,'{}'::jsonb,'{}'::jsonb,NULL,NULL,
    now(),NULL,NULL,
    jsonb_build_object('agency_workspace_id',p_workspace_id,'radar_kind','cancel','eastern_date',p_eastern_date,
      'reason',left(coalesce(nullif(btrim(p_reason),''),'unknown'),500)),
    'wc_renewal_radar:cancel_miss:'||p_workspace_id||':'||p_eastern_date,'high','pending')
  ON CONFLICT (dedupe_key) DO UPDATE SET
    title=excluded.title,description=excluded.description,category=excluded.category,source=excluded.source,
    entity_type=excluded.entity_type,entity_id=NULL,account_id=NULL,customer_id=NULL,related_lead_id=NULL,
    assignee_id=NULL,created_by=NULL,assigned_by=NULL,assignee_agent_id=NULL,policy_id=NULL,quote_id=NULL,
    document_id=NULL,parent_task_id=NULL,details=NULL,notes=NULL,ai_generated=false,confidence=NULL,
    dependencies='{}'::jsonb,evidence='{}'::jsonb,idempotency_key=NULL,suggested_assignee_role=NULL,
    due_at=excluded.due_at,completed_at=NULL,deleted_at=NULL,
    metadata=excluded.metadata,priority='high',status='pending',updated_at=now()
  RETURNING id INTO task_id;

  INSERT INTO public.radar_alert_tasks(task_id,agency_workspace_id,alert_kind,alert_date)
  VALUES(task_id,p_workspace_id,'cancel_miss',p_eastern_date)
  ON CONFLICT(task_id) DO UPDATE SET agency_workspace_id=excluded.agency_workspace_id,
    alert_kind=excluded.alert_kind,alert_date=excluded.alert_date;

  FOR recipient IN
    SELECT DISTINCT p.id
    FROM public.profiles p
    JOIN public.agency_workspace_memberships m ON m.user_id=p.id
    WHERE m.agency_workspace_id=p_workspace_id AND m.status='active' AND p.is_staff=true
      AND (lower(btrim(p.full_name))='landen lewis' OR lower(btrim(p.full_name))='lewi'
        OR lower(btrim(p.full_name)) LIKE 'lewi %')
      AND NOT EXISTS (SELECT 1 FROM public.notification_history n
        WHERE n.user_id=p.id AND n.source_type='task' AND n.source_id=task_id
          AND n.agency_workspace_id=p_workspace_id)
  LOOP
    PERFORM public.queue_push_notification(recipient.id,alert_title,alert_body,'renewal','high',
      jsonb_build_object('task_id',task_id,'radar_kind','cancel','eastern_date',p_eastern_date),
      'task',task_id,p_workspace_id);
  END LOOP;
  RETURN task_id;
END $$;
REVOKE ALL ON FUNCTION public.radar_record_cancel_miss(uuid,date,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.radar_record_cancel_miss(uuid,date,text) TO service_role;

-- Run at both possible UTC offsets; the edge function executes only at 08 New York local time.
SELECT cron.unschedule('radar-cancel-pull-08-et')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='radar-cancel-pull-08-et');
SELECT cron.schedule('radar-cancel-pull-08-et','0 12,13 * * *',$$
  SELECT net.http_post(
    url := 'https://lrqajzwcmdwahnjyidgv.supabase.co/functions/v1/radar-cancel-pull',
    headers := internal.get_cron_headers(),
    body := '{}'::jsonb
  );
$$);
