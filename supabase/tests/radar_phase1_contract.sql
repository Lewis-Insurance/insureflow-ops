-- Execute after migrations with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/radar_phase1_contract.sql
BEGIN;

DO $$
BEGIN
  IF public.normalize_radar_employer_name('Smith & Sons, LLC') <> 'smithandsonsllc' THEN
    RAISE EXCEPTION 'radar employer normalization contract failed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='renewal_opportunities_handoff_terminal' AND tgenabled<>'D') THEN
    RAISE EXCEPTION 'terminal handoff trigger is absent';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tasks' AND column_name='task_type') THEN
    RAISE EXCEPTION 'tasks.task_type must not exist';
  END IF;
  IF NOT has_function_privilege('service_role','public.radar_create_task_if_capacity(uuid,uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.radar_create_task_if_capacity(uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'atomic task RPC privilege contract failed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='public.handoff_radar_opportunity(uuid,uuid,text,text,text,text,uuid)'::regprocedure) THEN
    RAISE EXCEPTION 'account-bound handoff RPC is absent';
  END IF;
END $$;

ROLLBACK;
