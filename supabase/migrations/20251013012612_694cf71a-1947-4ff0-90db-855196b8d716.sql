-- Create required tables for background comparison jobs
-- 1) workspaces, 2) jobs queue, 3) job_events, 4) claim_jobs_for_worker RPC, 5) helper trigger, 6) storage bucket for documents

-- Helper: updated_at trigger function (idempotent)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 1) Workspaces table
CREATE TABLE IF NOT EXISTS public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- Workspace policies (owner-only)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='workspaces' AND policyname='workspaces_owner_select'
  ) THEN
    CREATE POLICY "workspaces_owner_select" ON public.workspaces
      FOR SELECT USING (created_by = auth.uid());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='workspaces' AND policyname='workspaces_owner_insert'
  ) THEN
    CREATE POLICY "workspaces_owner_insert" ON public.workspaces
      FOR INSERT WITH CHECK (created_by = auth.uid());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='workspaces' AND policyname='workspaces_owner_update'
  ) THEN
    CREATE POLICY "workspaces_owner_update" ON public.workspaces
      FOR UPDATE USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
  END IF;
END $$;

-- Trigger for workspaces.updated_at
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_workspaces_updated_at'
  ) THEN
    CREATE TRIGGER trg_workspaces_updated_at
    BEFORE UPDATE ON public.workspaces
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- 2) Jobs table (generic queue)
CREATE TABLE IF NOT EXISTS public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  account_id UUID NULL,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  title TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  result_session_id UUID NULL,
  error_message TEXT NULL,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  input_data JSONB NULL,
  result_data JSONB NULL,
  metadata JSONB NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_workspace ON public.jobs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON public.jobs(created_at DESC);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- Jobs policies (owner-only via created_by)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='jobs' AND policyname='jobs_owner_select'
  ) THEN
    CREATE POLICY "jobs_owner_select" ON public.jobs
      FOR SELECT USING (created_by = auth.uid());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='jobs' AND policyname='jobs_owner_insert'
  ) THEN
    CREATE POLICY "jobs_owner_insert" ON public.jobs
      FOR INSERT WITH CHECK (created_by = auth.uid());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='jobs' AND policyname='jobs_owner_update'
  ) THEN
    CREATE POLICY "jobs_owner_update" ON public.jobs
      FOR UPDATE USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
  END IF;
END $$;

-- Trigger for jobs.updated_at
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_jobs_updated_at'
  ) THEN
    CREATE TRIGGER trg_jobs_updated_at
    BEFORE UPDATE ON public.jobs
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- 3) Job events
CREATE TABLE IF NOT EXISTS public.job_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  message TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_events_job ON public.job_events(job_id);
CREATE INDEX IF NOT EXISTS idx_job_events_created ON public.job_events(created_at);

ALTER TABLE public.job_events ENABLE ROW LEVEL SECURITY;

-- Job events policies (read events for own jobs)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='job_events' AND policyname='job_events_owner_select'
  ) THEN
    CREATE POLICY "job_events_owner_select" ON public.job_events
      FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.jobs j
        WHERE j.id = job_events.job_id AND j.created_by = auth.uid()
      ));
  END IF;
  -- Inserts are done by service role; no need for user insert policy
END $$;

-- 4) RPC to claim jobs for worker (atomic claim + return rows)
CREATE OR REPLACE FUNCTION public.claim_jobs_for_worker(p_batch_size integer DEFAULT 5)
RETURNS SETOF public.jobs
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH cte AS (
    SELECT id
    FROM public.jobs
    WHERE status = 'queued'
    ORDER BY created_at
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.jobs j
  SET status = 'running', started_at = now(), attempts = j.attempts + 1, updated_at = now()
  FROM cte
  WHERE j.id = cte.id
  RETURNING j.*;
END;
$$;

-- 5) Ensure storage bucket for document uploads exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies for 'documents' bucket
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='documents_insert_authenticated'
  ) THEN
    CREATE POLICY "documents_insert_authenticated" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'documents');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='documents_select_authenticated'
  ) THEN
    CREATE POLICY "documents_select_authenticated" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'documents');
  END IF;
END $$;