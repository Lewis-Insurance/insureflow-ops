-- Create enums for job statuses and types
CREATE TYPE job_status AS ENUM ('queued', 'running', 'succeeded', 'failed', 'canceled');
CREATE TYPE job_type AS ENUM ('comparison', 'extraction', 'analysis');

-- Workspaces table
CREATE TABLE IF NOT EXISTS public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Jobs table for background processing
CREATE TABLE IF NOT EXISTS public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  job_type job_type NOT NULL DEFAULT 'comparison',
  status job_status NOT NULL DEFAULT 'queued',
  title TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Job-specific data
  input_data JSONB NOT NULL DEFAULT '{}',
  result_data JSONB,
  result_session_id UUID REFERENCES public.comparison_sessions(id) ON DELETE SET NULL,
  
  -- Error handling
  error_message TEXT,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'
);

-- Job events for activity log
CREATE TABLE IF NOT EXISTS public.job_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.jobs(id) ON DELETE CASCADE NOT NULL,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_jobs_workspace_status ON public.jobs(workspace_id, status);
CREATE INDEX idx_jobs_status_created ON public.jobs(status, created_at) WHERE status IN ('queued', 'running');
CREATE INDEX idx_job_events_job_id ON public.job_events(job_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for workspaces
CREATE POLICY "Users can view their workspaces"
  ON public.workspaces FOR SELECT
  USING (created_by = auth.uid());

CREATE POLICY "Users can create workspaces"
  ON public.workspaces FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update their workspaces"
  ON public.workspaces FOR UPDATE
  USING (created_by = auth.uid());

-- RLS Policies for jobs
CREATE POLICY "Users can view jobs in their workspaces"
  ON public.jobs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = jobs.workspace_id AND w.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can create jobs in their workspaces"
  ON public.jobs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = jobs.workspace_id AND w.created_by = auth.uid()
    )
  );

CREATE POLICY "System can update jobs"
  ON public.jobs FOR UPDATE
  USING (true);

-- RLS Policies for job_events
CREATE POLICY "Users can view events for their jobs"
  ON public.job_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      JOIN public.workspaces w ON w.id = j.workspace_id
      WHERE j.id = job_events.job_id AND w.created_by = auth.uid()
    )
  );

CREATE POLICY "System can insert job events"
  ON public.job_events FOR INSERT
  WITH CHECK (true);

-- Function to claim jobs for worker (using FOR UPDATE SKIP LOCKED)
CREATE OR REPLACE FUNCTION public.claim_jobs_for_worker(
  p_batch_size INT DEFAULT 5
)
RETURNS SETOF public.jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.jobs
  SET 
    status = 'running',
    started_at = now(),
    updated_at = now(),
    attempts = attempts + 1
  WHERE id IN (
    SELECT id FROM public.jobs
    WHERE status = 'queued'
      AND attempts < max_attempts
    ORDER BY created_at
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- Enable realtime for jobs and job_events
ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.job_events;