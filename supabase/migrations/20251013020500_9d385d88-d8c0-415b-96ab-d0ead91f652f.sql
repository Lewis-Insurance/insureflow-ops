-- Allow anonymous comparison submissions by making workspaces optional
-- and allowing anonymous job creation

-- First, allow INSERT on comparison_sessions without authentication for anonymous comparisons
DROP POLICY IF EXISTS "Staff can create comparison sessions" ON public.comparison_sessions;

CREATE POLICY "Anyone can create comparison sessions"
ON public.comparison_sessions
FOR INSERT
WITH CHECK (true);

-- Allow anonymous users to create jobs
DROP POLICY IF EXISTS "Anyone can create jobs" ON public.jobs;

CREATE POLICY "Anyone can create jobs"
ON public.jobs
FOR INSERT
WITH CHECK (true);

-- Allow anonymous users to view jobs
DROP POLICY IF EXISTS "Users can view jobs by workspace" ON public.jobs;

CREATE POLICY "Users can view jobs by workspace"
ON public.jobs
FOR SELECT
USING (true);