-- Execute after migrations:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/radar_harvester_config_contract.sql
BEGIN;

INSERT INTO auth.users(id,email) VALUES
  ('10000000-0000-0000-0000-000000000001','radar-owner-contract@example.invalid'),
  ('10000000-0000-0000-0000-000000000002','landen-contract@example.invalid'),
  ('10000000-0000-0000-0000-000000000003','lewi-contract@example.invalid'),
  ('10000000-0000-0000-0000-000000000004','producer-contract@example.invalid'),
  ('10000000-0000-0000-0000-000000000005','nonstaff-admin-contract@example.invalid');
INSERT INTO public.profiles(id,full_name,is_staff) VALUES
  ('10000000-0000-0000-0000-000000000001','Radar Owner Contract',true),
  ('10000000-0000-0000-0000-000000000002','Landen Lewis',true),
  ('10000000-0000-0000-0000-000000000003','Lewi',true),
  ('10000000-0000-0000-0000-000000000004','Staff Producer Contract',true),
  ('10000000-0000-0000-0000-000000000005','Nonstaff Admin Contract',false);
INSERT INTO public.agency_workspaces(id,name,slug,owner_id) VALUES
  ('20000000-0000-0000-0000-000000000001','Radar Contract','radar-contract-test','10000000-0000-0000-0000-000000000001');
INSERT INTO public.agency_workspace_memberships(agency_workspace_id,user_id,role,status) VALUES
  ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','owner','active'),
  ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','admin','active'),
  ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','admin','active'),
  ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','producer','active'),
  ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000005','admin','active');
INSERT INTO public.radar_config(agency_workspace_id,class_allowlist) VALUES
  ('20000000-0000-0000-0000-000000000001',ARRAY['5551','5190','5183','5537','5474','0042','5478','5445','5022','5403','5645','5606','9014','0917','8835','8829','8824','8869','9082','9083','9084','9052','8006','8017','8380','8393','9015','8292']);

DO $$
DECLARE mon jsonb; tue jsonb; weekend jsonb;
BEGIN
  mon := public.radar_harvest_plan('20000000-0000-0000-0000-000000000001','2024-01-01');
  tue := public.radar_harvest_plan('20000000-0000-0000-0000-000000000001','2024-01-02');
  weekend := public.radar_harvest_plan('20000000-0000-0000-0000-000000000001','2024-01-06');
  IF jsonb_array_length(mon#>'{cancel,requests}')<>7 OR mon#>'{xdate,counties}'<>'["Columbia","Suwannee"]'::jsonb
    OR jsonb_array_length(mon#>'{xdate,requests}')<>62 THEN RAISE EXCEPTION 'Monday plan contract failed'; END IF;
  IF jsonb_array_length(tue#>'{cancel,requests}')<>7 OR jsonb_array_length(tue#>'{xdate,counties}')<>1
    OR jsonb_array_length(tue#>'{xdate,requests}')<>31 THEN RAISE EXCEPTION 'Tuesday plan contract failed'; END IF;
  IF jsonb_array_length(weekend#>'{cancel,requests}')<>7 OR jsonb_array_length(weekend#>'{xdate,requests}')<>0
    OR weekend#>>'{swo,pull_once}'<>'true' THEN RAISE EXCEPTION 'Weekend/SWO plan contract failed'; END IF;
END $$;

SET LOCAL ROLE anon;
DO $$ BEGIN
  PERFORM public.configure_radar('20000000-0000-0000-0000-000000000001',ARRAY['8810']);
  RAISE EXCEPTION 'anonymous configure unexpectedly allowed';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
DO $$ BEGIN
  PERFORM public.configure_radar('20000000-0000-0000-0000-000000000001',
    ARRAY['5551','5190','5183','5537','5474','0042','5478','5445','5022','5403','5645','5606','9014','0917','8835','8829','8824','8869','9082','9083','9084','9052','8006','8017','8380','8393','9015','8292']);
  RAISE EXCEPTION 'staff producer configure unexpectedly allowed';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',true);
DO $$ BEGIN
  PERFORM public.configure_radar('20000000-0000-0000-0000-000000000001',
    ARRAY['5551','5190','5183','5537','5474','0042','5478','5445','5022','5403','5645','5606','9014','0917','8835','8829','8824','8869','9082','9083','9084','9052','8006','8017','8380','8393','9015','8292']);
  RAISE EXCEPTION 'nonstaff admin configure unexpectedly allowed';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
DO $$ BEGIN
  PERFORM public.configure_radar('20000000-0000-0000-0000-000000000001',ARRAY['8810']);
  RAISE EXCEPTION 'invalid class unexpectedly allowed';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DO $$ BEGIN
  PERFORM public.configure_radar('20000000-0000-0000-0000-000000000001',ARRAY['8742','9999']);
  RAISE EXCEPTION 'outsider classes unexpectedly allowed';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
SELECT public.configure_radar('20000000-0000-0000-0000-000000000001',
  ARRAY['5551','5190','5183','5537','5474','0042','5478','5445','5022','5403','5645','5606','9014','0917','8835','8829','8824','8869','9082','9083','9084','9052','8006','8017','8380','8393','9015','8292']);
RESET ROLE;

INSERT INTO public.tasks(title,description,category,source,entity_type,metadata,dedupe_key,priority,status,completed_at,deleted_at)
VALUES('forged','forged','general','manual','account','{"agency_workspace_id":"30000000-0000-0000-0000-000000000001"}',
  'wc_renewal_radar:swo_miss:20000000-0000-0000-0000-000000000001:2024-01-02','low','completed',now(),now());

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT public.radar_record_swo_miss('20000000-0000-0000-0000-000000000001','2024-01-02','contract miss');
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tasks t JOIN public.radar_alert_tasks rat ON rat.task_id=t.id
    WHERE rat.agency_workspace_id='20000000-0000-0000-0000-000000000001' AND rat.alert_date='2024-01-02'
      AND t.title='SWO radar pull missed: 2024-01-02' AND t.source='wc_renewal_radar' AND t.category::text='renewal'
      AND t.priority::text='high' AND t.status::text='pending' AND t.completed_at IS NULL AND t.deleted_at IS NULL
      AND t.account_id IS NULL AND t.customer_id IS NULL AND t.assignee_id IS NULL) THEN
    RAISE EXCEPTION 'adversarial preseed was not safely canonicalized/mapped';
  END IF;
  IF (SELECT count(*) FROM public.push_notification_queue q
      WHERE q.agency_workspace_id='20000000-0000-0000-0000-000000000001' AND q.source_type='task')<>2 THEN
    RAISE EXCEPTION 'Landen and Lewi push notifications were not queued';
  END IF;
  IF has_table_privilege('authenticated','public.radar_alert_tasks','INSERT')
    OR has_table_privilege('authenticated','public.radar_alert_tasks','UPDATE') THEN
    RAISE EXCEPTION 'authenticated can forge radar alert tenant mapping';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tasks' AND column_name='task_type') THEN
    RAISE EXCEPTION 'tasks.task_type must not exist';
  END IF;
END $$;

ROLLBACK;
