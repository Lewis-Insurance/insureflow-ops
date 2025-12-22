-- =============================================================================
-- Enhanced Admin System Migration
-- =============================================================================
-- Adds comprehensive admin controls, RBAC, user tracking, and audit capabilities
-- =============================================================================

-- =============================================================================
-- 1. ENHANCED USER STATUS & TRACKING
-- =============================================================================

-- Add status and tracking columns to profiles if they don't exist
-- Using separate statements to avoid trigger issues
DO $$
BEGIN
  -- User status (active, disabled, banned)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN status TEXT DEFAULT 'active';
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_status_check CHECK (status IN ('active', 'disabled', 'banned'));
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not add status column: %', SQLERRM;
    -- Continue migration even if this fails
END $$;

DO $$
BEGIN
  -- Last seen timestamp
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'last_seen_at'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN last_seen_at TIMESTAMPTZ;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not add last_seen_at column: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Admin notes (internal)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'admin_notes'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN admin_notes TEXT;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not add admin_notes column: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Soft delete tracking
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not add deleted_at column: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Deleted by (who soft-deleted this user)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'deleted_by'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN deleted_by UUID REFERENCES public.profiles(id);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not add deleted_by column: %', SQLERRM;
END $$;

-- Create index for status filtering
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status) WHERE status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON public.profiles(last_seen_at) WHERE last_seen_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_deleted ON public.profiles(deleted_at) WHERE deleted_at IS NOT NULL;

-- =============================================================================
-- 2. RBAC SYSTEM - GRANULAR PERMISSIONS
-- =============================================================================

-- Create RBAC roles enum (extends existing user_role)
-- Note: We use TEXT for roles in admin_permissions table instead of extending the enum
-- This avoids transaction issues with ALTER TYPE ADD VALUE
-- The enum values can be added manually if needed, or we can use TEXT and validate in application code

-- Create permissions table
CREATE TABLE IF NOT EXISTS public.admin_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL, -- 'owner', 'admin', 'analyst', 'support', 'staff', 'customer'
  permission_key TEXT NOT NULL, -- e.g., 'view_analytics', 'manage_users', 'billing', 'feature_flags'
  granted BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(role, permission_key)
);

-- Insert default permissions
INSERT INTO public.admin_permissions (role, permission_key, granted) VALUES
  -- Owner: All permissions
  ('owner', 'view_analytics', true),
  ('owner', 'manage_users', true),
  ('owner', 'billing', true),
  ('owner', 'feature_flags', true),
  ('owner', 'audit_logs', true),
  ('owner', 'system_settings', true),
  ('owner', 'impersonate', true),
  ('owner', 'export_data', true),
  
  -- Admin: Most permissions except ownership
  ('admin', 'view_analytics', true),
  ('admin', 'manage_users', true),
  ('admin', 'billing', true),
  ('admin', 'feature_flags', true),
  ('admin', 'audit_logs', true),
  ('admin', 'system_settings', false),
  ('admin', 'impersonate', true),
  ('admin', 'export_data', true),
  
  -- Analyst: View-only analytics
  ('analyst', 'view_analytics', true),
  ('analyst', 'manage_users', false),
  ('analyst', 'billing', false),
  ('analyst', 'feature_flags', false),
  ('analyst', 'audit_logs', true),
  ('analyst', 'system_settings', false),
  ('analyst', 'impersonate', false),
  ('analyst', 'export_data', true),
  
  -- Support: Limited access
  ('support', 'view_analytics', false),
  ('support', 'manage_users', false),
  ('support', 'billing', false),
  ('support', 'feature_flags', false),
  ('support', 'audit_logs', true),
  ('support', 'system_settings', false),
  ('support', 'impersonate', true),
  ('support', 'export_data', false)
ON CONFLICT (role, permission_key) DO NOTHING;

-- =============================================================================
-- 3. USER USAGE TRACKING
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_usage_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Period tracking
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  period_type TEXT NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),
  
  -- Usage metrics
  api_calls INTEGER DEFAULT 0,
  document_extractions INTEGER DEFAULT 0,
  ai_queries INTEGER DEFAULT 0,
  tokens_used BIGINT DEFAULT 0,
  cost_spent NUMERIC(15, 4) DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(user_id, period_start, period_type)
);

CREATE INDEX IF NOT EXISTS idx_usage_user_period ON public.user_usage_metrics(user_id, period_start, period_type);
CREATE INDEX IF NOT EXISTS idx_usage_period ON public.user_usage_metrics(period_start, period_type);

-- =============================================================================
-- 4. ADMIN IMPERSONATION LOGGING
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.admin_impersonations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  ip_address INET,
  user_agent TEXT,
  reason TEXT,
  actions_performed JSONB DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_impersonations_admin ON public.admin_impersonations(admin_user_id, started_at);
CREATE INDEX IF NOT EXISTS idx_impersonations_target ON public.admin_impersonations(target_user_id, started_at);
CREATE INDEX IF NOT EXISTS idx_impersonations_active ON public.admin_impersonations(ended_at) WHERE ended_at IS NULL;

-- =============================================================================
-- 5. ENHANCED AUDIT LOG
-- =============================================================================

-- Extend existing audit_logs table if it exists, or create new structure
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Who
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role TEXT,
  actor_email TEXT,
  
  -- What
  action_type TEXT NOT NULL, -- 'user_disabled', 'role_changed', 'feature_flag_toggled', 'budget_set', etc.
  resource_type TEXT, -- 'user', 'policy', 'feature_flag', 'budget', etc.
  resource_id UUID,
  
  -- Details
  action_details JSONB DEFAULT '{}',
  before_state JSONB,
  after_state JSONB,
  
  -- Context
  ip_address INET,
  user_agent TEXT,
  impersonation_id UUID REFERENCES public.admin_impersonations(id),
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.admin_audit_log(actor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_action ON public.admin_audit_log(action_type, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON public.admin_audit_log(resource_type, resource_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_date ON public.admin_audit_log(created_at DESC);

-- =============================================================================
-- 6. COST CONTROLS & BUDGETING
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.admin_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Scope
  scope_type TEXT NOT NULL CHECK (scope_type IN ('global', 'user', 'workspace')),
  scope_id UUID, -- user_id or workspace_id if not global
  
  -- Budget settings
  period_type TEXT NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),
  budget_amount NUMERIC(15, 4) NOT NULL,
  alert_threshold NUMERIC(5, 2) DEFAULT 80.0, -- Alert at 80% of budget
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Metadata
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_budgets_scope ON public.admin_budgets(scope_type, scope_id, is_active);

-- Budget alerts
CREATE TABLE IF NOT EXISTS public.admin_budget_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES public.admin_budgets(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('spend_spike', 'token_spike', 'error_spike', 'threshold_reached')),
  current_value NUMERIC(15, 4),
  threshold_value NUMERIC(15, 4),
  notified_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- =============================================================================
-- 7. HELPER FUNCTIONS
-- =============================================================================

-- Function to check if user has permission
CREATE OR REPLACE FUNCTION public.has_permission(
  user_id UUID,
  permission_key TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role_val TEXT;
BEGIN
  -- Get user's role
  SELECT role::TEXT INTO user_role_val
  FROM public.profiles
  WHERE id = user_id;
  
  -- Check permission
  RETURN EXISTS (
    SELECT 1
    FROM public.admin_permissions
    WHERE role = user_role_val
      AND permission_key = has_permission.permission_key
      AND granted = true
  );
END;
$$;

-- Function to update last_seen_at
CREATE OR REPLACE FUNCTION public.update_user_last_seen()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.profiles
  SET last_seen_at = now()
  WHERE id = auth.uid();
  RETURN NEW;
END;
$$;

-- Trigger to update last_seen on activity (if audit_logs table exists)
-- This would be set up based on your existing audit system

-- =============================================================================
-- 8. RLS POLICIES
-- =============================================================================

-- Admin permissions: Only admins can view
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;

-- Create RLS policy - use direct role check to avoid function dependencies
DROP POLICY IF EXISTS "admins_can_view_permissions" ON public.admin_permissions;
CREATE POLICY "admins_can_view_permissions"
  ON public.admin_permissions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'owner', 'analyst')
    )
  );

-- User usage metrics: Admins and the user themselves
ALTER TABLE public.user_usage_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_can_view_own_metrics" ON public.user_usage_metrics;
CREATE POLICY "users_can_view_own_metrics"
  ON public.user_usage_metrics FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() 
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'owner')
    )
  );

-- Impersonations: Only admins
ALTER TABLE public.admin_impersonations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_can_view_impersonations" ON public.admin_impersonations;
CREATE POLICY "admins_can_view_impersonations"
  ON public.admin_impersonations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'owner', 'support')
    )
  );

-- Audit log: Admins and analysts
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_can_view_audit_log" ON public.admin_audit_log;
CREATE POLICY "admins_can_view_audit_log"
  ON public.admin_audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'owner', 'analyst', 'support')
    )
  );

-- Budgets: Admins only
ALTER TABLE public.admin_budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_can_manage_budgets" ON public.admin_budgets;
CREATE POLICY "admins_can_manage_budgets"
  ON public.admin_budgets FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'owner')
    )
  );

-- =============================================================================
-- 9. COMMENTS
-- =============================================================================

COMMENT ON TABLE public.admin_permissions IS 'RBAC permissions matrix for admin roles';
COMMENT ON TABLE public.user_usage_metrics IS 'Tracks user usage metrics by period (daily/weekly/monthly)';
COMMENT ON TABLE public.admin_impersonations IS 'Logs all admin impersonation sessions for audit';
COMMENT ON TABLE public.admin_audit_log IS 'Enhanced audit log for all admin actions';
COMMENT ON TABLE public.admin_budgets IS 'Budget controls and spending limits';
COMMENT ON TABLE public.admin_budget_alerts IS 'Budget alert notifications';

COMMENT ON COLUMN public.profiles.status IS 'User status: active, disabled, or banned';
COMMENT ON COLUMN public.profiles.last_seen_at IS 'Last time user was active in the system';
COMMENT ON COLUMN public.profiles.admin_notes IS 'Internal admin notes about the user';
COMMENT ON COLUMN public.profiles.deleted_at IS 'Soft delete timestamp';
COMMENT ON COLUMN public.profiles.deleted_by IS 'Admin who soft-deleted this user';

