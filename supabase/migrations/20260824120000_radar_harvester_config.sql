-- Harvester-owned county/date pull policy and durable SWO miss alerts.

ALTER TABLE public.radar_config
  ADD COLUMN counties text[] NOT NULL DEFAULT ARRAY['Columbia','Suwannee','Alachua','Union','Hamilton','Lafayette','Gilchrist'],
  ADD COLUMN home_base_counties text[] NOT NULL DEFAULT ARRAY['Columbia','Suwannee'],
  ADD COLUMN xdate_rotation_counties text[] NOT NULL DEFAULT ARRAY['Alachua','Union','Hamilton','Lafayette','Gilchrist'],
  ADD COLUMN xdate_window_start_days smallint NOT NULL DEFAULT 30,
  ADD COLUMN xdate_window_end_days smallint NOT NULL DEFAULT 60;

COMMENT ON COLUMN public.radar_config.counties IS 'All counties pulled for the daily exact-date cancellation search.';
COMMENT ON COLUMN public.radar_config.home_base_counties IS 'Monday 30-60 day X-date counties.';
COMMENT ON COLUMN public.radar_config.xdate_rotation_counties IS 'Tue-Fri 30-60 day X-date rotation, selected by week-indexed weekday slot.';

-- Update configured workspaces only. This migration never creates a workspace or config row.
UPDATE public.radar_config
SET class_allowlist = ARRAY['5551','5190','5183','5537','5474','0042','5478','5445','5022','5403','5645','5606','9014','0917','8835','8829','8824','8869','9082','9083','9084','9052','8006','8017','8380','8393','9015','8292'],
    counties = ARRAY['Columbia','Suwannee','Alachua','Union','Hamilton','Lafayette','Gilchrist'],
    home_base_counties = ARRAY['Columbia','Suwannee'],
    xdate_rotation_counties = ARRAY['Alachua','Union','Hamilton','Lafayette','Gilchrist'],
    xdate_window_start_days = 30,
    xdate_window_end_days = 60,
    updated_at = now();

ALTER TABLE public.radar_config
  ADD CONSTRAINT radar_config_locked_class_allowlist CHECK (
    class_allowlist = ARRAY['5551','5190','5183','5537','5474','0042','5478','5445','5022','5403','5645','5606','9014','0917','8835','8829','8824','8869','9082','9083','9084','9052','8006','8017','8380','8393','9015','8292']::text[]
  ),
  ADD CONSTRAINT radar_config_locked_counties CHECK (
    counties = ARRAY['Columbia','Suwannee','Alachua','Union','Hamilton','Lafayette','Gilchrist']::text[]
    AND home_base_counties = ARRAY['Columbia','Suwannee']::text[]
    AND xdate_rotation_counties = ARRAY['Alachua','Union','Hamilton','Lafayette','Gilchrist']::text[]
  ),
  ADD CONSTRAINT radar_config_xdate_window CHECK (
    xdate_window_start_days = 30 AND xdate_window_end_days = 60
  );

DROP FUNCTION public.configure_radar(uuid,text[],smallint,integer);
CREATE FUNCTION public.configure_radar(
  p_workspace_id uuid,
  p_class_allowlist text[],
  p_score_threshold smallint DEFAULT 70,
  p_weekly_capacity integer DEFAULT 0,
  p_counties text[] DEFAULT ARRAY['Columbia','Suwannee','Alachua','Union','Hamilton','Lafayette','Gilchrist'],
  p_home_base_counties text[] DEFAULT ARRAY['Columbia','Suwannee'],
  p_xdate_rotation_counties text[] DEFAULT ARRAY['Alachua','Union','Hamilton','Lafayette','Gilchrist'],
  p_xdate_window_start_days smallint DEFAULT 30,
  p_xdate_window_end_days smallint DEFAULT 60
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
    counties,home_base_counties,xdate_rotation_counties,xdate_window_start_days,xdate_window_end_days
  ) VALUES (
    p_workspace_id,p_class_allowlist,p_score_threshold,p_weekly_capacity,
    p_counties,p_home_base_counties,p_xdate_rotation_counties,p_xdate_window_start_days,p_xdate_window_end_days
  )
  ON CONFLICT(agency_workspace_id) DO UPDATE SET
    class_allowlist=excluded.class_allowlist,score_threshold=excluded.score_threshold,
    producer_weekly_capacity=excluded.producer_weekly_capacity,counties=excluded.counties,
    home_base_counties=excluded.home_base_counties,xdate_rotation_counties=excluded.xdate_rotation_counties,
    xdate_window_start_days=excluded.xdate_window_start_days,xdate_window_end_days=excluded.xdate_window_end_days,
    updated_at=now()
  RETURNING * INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.configure_radar(uuid,text[],smallint,integer,text[],text[],text[],smallint,smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.configure_radar(uuid,text[],smallint,integer,text[],text[],text[],smallint,smallint) TO authenticated;

CREATE FUNCTION public.radar_harvest_plan(p_workspace_id uuid, p_eastern_date date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  c public.radar_config%ROWTYPE;
  weekday integer := extract(isodow FROM p_eastern_date);
  rotation_index integer;
  xdate_counties text[] := '{}';
  cancel_requests jsonb;
  xdate_requests jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO c FROM public.radar_config WHERE agency_workspace_id=p_workspace_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'radar_config not found' USING ERRCODE='P0002'; END IF;

  IF weekday = 1 THEN
    xdate_counties := c.home_base_counties;
  ELSIF weekday BETWEEN 2 AND 5 THEN
    -- Four weekday slots advance through five counties across ISO weeks; every county appears.
    rotation_index := mod(((p_eastern_date - DATE '2024-01-01') / 7) * 4 + (weekday - 2), cardinality(c.xdate_rotation_counties));
    xdate_counties := ARRAY[c.xdate_rotation_counties[rotation_index + 1]];
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('county',county,'exact_date',p_eastern_date) ORDER BY ordinal),'[]'::jsonb)
    INTO cancel_requests FROM unnest(c.counties) WITH ORDINALITY AS daily(county,ordinal);
  IF cardinality(xdate_counties) > 0 THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('county',county,'exact_date',p_eastern_date+day_offset)
      ORDER BY county_ordinal,day_offset),'[]'::jsonb)
      INTO xdate_requests
      FROM unnest(xdate_counties) WITH ORDINALITY AS selected(county,county_ordinal)
      CROSS JOIN generate_series(c.xdate_window_start_days,c.xdate_window_end_days) AS dates(day_offset);
  END IF;

  RETURN jsonb_build_object(
    'agency_workspace_id',p_workspace_id,'eastern_date',p_eastern_date,
    'swo',jsonb_build_object('pull_once',true,'source_url',c.swo_source_url),
    'cancel',jsonb_build_object('exact_date',p_eastern_date,'counties',c.counties,'requests',cancel_requests),
    'xdate',jsonb_build_object('window_start_date',p_eastern_date+c.xdate_window_start_days,
      'window_end_date',p_eastern_date+c.xdate_window_end_days,'counties',xdate_counties,'requests',xdate_requests),
    'class_allowlist',c.class_allowlist
  );
END $$;
REVOKE ALL ON FUNCTION public.radar_harvest_plan(uuid,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.radar_harvest_plan(uuid,date) TO service_role;

CREATE TABLE public.radar_alert_tasks (
  task_id uuid PRIMARY KEY REFERENCES public.tasks(id) ON DELETE CASCADE,
  agency_workspace_id uuid NOT NULL REFERENCES public.radar_config(agency_workspace_id) ON DELETE CASCADE,
  alert_kind text NOT NULL CHECK (alert_kind='swo_miss'),
  alert_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_workspace_id,alert_kind,alert_date)
);
ALTER TABLE public.radar_alert_tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.radar_alert_tasks FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.radar_alert_tasks TO service_role;

CREATE FUNCTION public.radar_record_swo_miss(p_workspace_id uuid, p_eastern_date date, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  task_id uuid;
  recipient record;
  alert_title text := 'SWO radar pull missed: '||p_eastern_date;
  alert_body text := 'The scheduled SWO pull did not produce new staging rows. Staff review is required. Reason: '
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
    'renewal','wc_renewal_radar','radar_swo_pull',
    NULL,NULL,NULL,
    NULL,NULL,NULL,
    NULL,NULL,NULL,NULL,NULL,NULL,
    NULL,NULL,false,NULL,'{}'::jsonb,'{}'::jsonb,NULL,NULL,
    now(),NULL,NULL,
    jsonb_build_object('agency_workspace_id',p_workspace_id,'radar_kind','swo','eastern_date',p_eastern_date,
      'reason',left(coalesce(nullif(btrim(p_reason),''),'unknown'),500)),
    'wc_renewal_radar:swo_miss:'||p_workspace_id||':'||p_eastern_date,'high','pending')
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
  VALUES(task_id,p_workspace_id,'swo_miss',p_eastern_date)
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
      jsonb_build_object('task_id',task_id,'radar_kind','swo','eastern_date',p_eastern_date),
      'task',task_id,p_workspace_id);
  END LOOP;
  RETURN task_id;
END $$;
REVOKE ALL ON FUNCTION public.radar_record_swo_miss(uuid,date,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.radar_record_swo_miss(uuid,date,text) TO service_role;

-- Make the unassigned alert visible in the existing tenant-scoped staff queue.
-- The join is restricted to this system entity type and a real radar_config row.
CREATE OR REPLACE FUNCTION public.search_tasks(p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 250, p_offset integer DEFAULT 0, p_sort text DEFAULT 'due_asc'::text)
RETURNS TABLE(id uuid, title text, status text, priority text, due_at timestamptz, entity_type text, account_id uuid, account_name text, created_at timestamptz, completed_at timestamptz, assignee_id uuid, assignee_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  filter_q text := p_filters->>'q';
  filter_cohort text := p_filters->>'cohort';
  filter_scope text := p_filters->>'scope';
  filter_radar boolean := COALESCE((p_filters->>'radar')::boolean, false);
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'permission denied: staff only' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT t.id,t.title,t.status::text,t.priority::text,t.due_at,t.entity_type,
    COALESCE(t.account_id,c.account_id),COALESCE(a.name,ca.name),t.created_at,t.completed_at,
    t.assignee_id,NULLIF(trim(p.full_name),'')
  FROM public.tasks t
  LEFT JOIN public.accounts a ON a.id=t.account_id
  LEFT JOIN public.customers c ON c.id=t.customer_id
  LEFT JOIN public.accounts ca ON ca.id=c.account_id
  LEFT JOIN public.profiles p ON p.id=t.assignee_id
  LEFT JOIN public.renewal_opportunities ro ON t.entity_type='renewal_opportunity' AND ro.id=t.entity_id
  LEFT JOIN public.radar_alert_tasks rat ON rat.task_id=t.id
  WHERE t.deleted_at IS NULL
    AND (
      EXISTS (SELECT 1 FROM public.agency_workspace_memberships awm
        WHERE awm.user_id=auth.uid() AND awm.status='active'
          AND awm.agency_workspace_id=COALESCE(a.agency_workspace_id,ca.agency_workspace_id,ro.agency_workspace_id,rat.agency_workspace_id))
      OR (a.id IS NULL AND ca.id IS NULL AND ro.id IS NULL AND rat.agency_workspace_id IS NULL
        AND (t.assignee_id=auth.uid() OR t.created_by=auth.uid()))
    )
    AND (filter_q IS NULL OR filter_q='' OR t.title ILIKE '%'||filter_q||'%')
    AND (filter_cohort IS NULL OR filter_cohort='' OR filter_cohort='all'
      OR (filter_cohort='overdue' AND t.status::text IN ('pending','in_progress') AND t.due_at IS NOT NULL AND t.due_at<now())
      OR (filter_cohort='due_this_week' AND t.status::text IN ('pending','in_progress') AND t.due_at>=now() AND t.due_at<now()+interval '7 days')
      OR (filter_cohort='high_priority' AND t.status::text IN ('pending','in_progress') AND t.priority::text IN ('high','urgent'))
      OR (filter_cohort='completed' AND t.status::text='completed'))
    AND (filter_scope IS NULL OR filter_scope='' OR filter_scope='office'
      OR (filter_scope='mine' AND (t.assignee_id=auth.uid() OR t.assignee_id IS NULL))
      OR (filter_scope='unclaimed' AND t.assignee_id IS NULL))
    AND (NOT filter_radar OR (t.category::text='renewal' AND t.source='wc_renewal_radar'))
  ORDER BY CASE WHEN p_sort='due_asc' THEN t.due_at END ASC NULLS LAST,
    CASE WHEN p_sort='created_desc' THEN t.created_at END DESC NULLS LAST,t.id
  LIMIT p_limit OFFSET p_offset;
END $$;
REVOKE ALL ON FUNCTION public.search_tasks(jsonb,integer,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_tasks(jsonb,integer,integer,text) TO authenticated, service_role;
