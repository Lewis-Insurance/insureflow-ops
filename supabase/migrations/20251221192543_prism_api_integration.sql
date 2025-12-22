-- =============================================================================
-- Prism API Integration Schema
-- =============================================================================
-- Tracks Prism AI runs and usage for agents/employees
-- =============================================================================

-- =============================================================================
-- PRISM RUNS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.prism_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Prism API details
  run_id TEXT NOT NULL, -- Prism API run_id
  prompt TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('sequential', 'parallel', 'debate')),
  depth TEXT NOT NULL CHECK (depth IN ('insight', 'synthesis', 'mastery')),
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'complete', 'failed')),
  cycles_completed INTEGER DEFAULT 0,
  final_output TEXT,
  
  -- Usage metrics
  tokens_used BIGINT,
  cost NUMERIC(15, 6),
  
  -- Error tracking
  error_message TEXT,
  
  -- Metadata
  is_favorite BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  
  -- Indexes
  UNIQUE(run_id)
);

CREATE INDEX IF NOT EXISTS idx_prism_runs_user ON public.prism_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prism_runs_status ON public.prism_runs(status);
CREATE INDEX IF NOT EXISTS idx_prism_runs_run_id ON public.prism_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_prism_runs_favorite ON public.prism_runs(user_id, is_favorite) WHERE is_favorite = true;

-- =============================================================================
-- PRISM API KEYS (per-user storage)
-- =============================================================================

-- Add prism_api_key to profiles if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'prism_api_key'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN prism_api_key TEXT;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not add prism_api_key column: %', SQLERRM;
END $$;

-- Create index for API key lookups (if needed)
CREATE INDEX IF NOT EXISTS idx_profiles_prism_key ON public.profiles(prism_api_key) WHERE prism_api_key IS NOT NULL;

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

ALTER TABLE public.prism_runs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "users_can_view_own_runs" ON public.prism_runs;
DROP POLICY IF EXISTS "users_can_create_own_runs" ON public.prism_runs;
DROP POLICY IF EXISTS "users_can_update_own_runs" ON public.prism_runs;
DROP POLICY IF EXISTS "admins_can_view_all_runs" ON public.prism_runs;

-- Users can view their own runs
CREATE POLICY "users_can_view_own_runs"
  ON public.prism_runs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can create their own runs
CREATE POLICY "users_can_create_own_runs"
  ON public.prism_runs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update their own runs (for status updates, favorites)
CREATE POLICY "users_can_update_own_runs"
  ON public.prism_runs FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Admins can view all runs
-- Check if role column exists first
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
  ) THEN
    -- Role column exists, use it
    EXECUTE '
      DROP POLICY IF EXISTS "admins_can_view_all_runs" ON public.prism_runs;
      CREATE POLICY "admins_can_view_all_runs"
        ON public.prism_runs FOR SELECT
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.role::text IN (''admin'', ''owner'')
          )
        )';
  ELSE
    -- No role column, skip admin policy (users can only see their own runs)
    RAISE NOTICE 'Role column not found in profiles table. Skipping admin policy.';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not create admin policy: %', SQLERRM;
END $$;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE public.prism_runs IS 'Tracks all Prism AI runs for usage analytics and history';
COMMENT ON COLUMN public.profiles.prism_api_key IS 'User-specific Prism API key (optional, can use system-wide key)';
COMMENT ON COLUMN public.prism_runs.run_id IS 'Prism API run_id for fetching status and results';
COMMENT ON COLUMN public.prism_runs.cycles_completed IS 'Number of reasoning cycles completed';

