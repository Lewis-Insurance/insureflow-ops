-- ============================================================================
-- CEO WEEKLY DIGEST FEATURE
-- ============================================================================
-- This migration adds tables and functions for:
-- 1. ceo_digest_settings - Configuration for weekly digest emails
-- 2. ceo_digest_runs - Audit trail of digest runs and sent emails
-- 3. get_weekly_ceo_digest_facts() - RPC function to compute metrics
-- ============================================================================

-- ============================================================================
-- 1. CEO DIGEST SETTINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS ceo_digest_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_workspace_id UUID NOT NULL REFERENCES agency_workspaces(id) ON DELETE CASCADE,

  -- Enable/disable digest
  enabled BOOLEAN NOT NULL DEFAULT TRUE,

  -- Schedule configuration
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  send_day_of_week INTEGER NOT NULL DEFAULT 1 CHECK (send_day_of_week >= 0 AND send_day_of_week <= 6),
  -- 0=Sunday, 1=Monday, 2=Tuesday, etc.
  send_time_local TEXT NOT NULL DEFAULT '08:00' CHECK (send_time_local ~ '^\d{2}:\d{2}$'),

  -- Recipients (array of email addresses)
  recipients JSONB NOT NULL DEFAULT '[]',

  -- Privacy settings
  include_pii BOOLEAN NOT NULL DEFAULT FALSE,

  -- Alert thresholds
  thresholds JSONB NOT NULL DEFAULT '{
    "leads_drop_pct": 25,
    "quotes_drop_pct": 25,
    "overdue_tasks_critical": 10,
    "aging_quotes_days": 7,
    "canopy_reconnects_critical": 3,
    "canopy_errors_critical": 5
  }',

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),

  -- One settings row per agency
  CONSTRAINT ceo_digest_settings_agency_unique UNIQUE (agency_workspace_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ceo_digest_settings_agency
  ON ceo_digest_settings(agency_workspace_id);
CREATE INDEX IF NOT EXISTS idx_ceo_digest_settings_enabled
  ON ceo_digest_settings(enabled) WHERE enabled = TRUE;

-- Enable RLS
ALTER TABLE ceo_digest_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Only agency admins/owners can manage
CREATE POLICY "Agency admins can view digest settings" ON ceo_digest_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM agency_workspace_memberships m
      WHERE m.agency_workspace_id = ceo_digest_settings.agency_workspace_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
        AND m.status = 'active'
    )
  );

CREATE POLICY "Agency admins can insert digest settings" ON ceo_digest_settings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM agency_workspace_memberships m
      WHERE m.agency_workspace_id = ceo_digest_settings.agency_workspace_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
        AND m.status = 'active'
    )
  );

CREATE POLICY "Agency admins can update digest settings" ON ceo_digest_settings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM agency_workspace_memberships m
      WHERE m.agency_workspace_id = ceo_digest_settings.agency_workspace_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
        AND m.status = 'active'
    )
  );

CREATE POLICY "Service role can manage digest settings" ON ceo_digest_settings
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- ============================================================================
-- 2. CEO DIGEST RUNS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS ceo_digest_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_workspace_id UUID NOT NULL REFERENCES agency_workspaces(id) ON DELETE CASCADE,

  -- Period covered
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL,
  week_label TEXT, -- e.g., "Week of Dec 16-22, 2024"

  -- Recipients for this run
  recipients JSONB NOT NULL DEFAULT '[]',

  -- Computed facts packet (deterministic metrics)
  facts JSONB,

  -- AI-generated output (strict JSON)
  ai_output JSONB,
  ai_provider TEXT, -- 'openai' or 'anthropic'
  ai_model TEXT, -- e.g., 'gpt-4o' or 'claude-3-sonnet'
  ai_tokens_used INTEGER,

  -- Run status
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN (
    'created',      -- Run created, not yet processed
    'computing',    -- Computing facts
    'generating',   -- AI generating summary
    'sending',      -- Sending emails
    'sent',         -- Successfully sent
    'skipped',      -- Skipped (e.g., duplicate)
    'failed'        -- Failed with error
  )),

  -- Idempotency key (prevents duplicate sends)
  idempotency_key TEXT NOT NULL,

  -- Email provider details
  email_provider TEXT, -- 'resend', 'sendgrid', etc.
  email_result JSONB, -- Provider response
  emails_sent INTEGER DEFAULT 0,

  -- Error tracking
  error TEXT,
  error_code TEXT,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  triggered_by TEXT DEFAULT 'cron', -- 'cron', 'manual', 'force'

  -- Unique constraint on idempotency key per agency
  CONSTRAINT ceo_digest_runs_idempotency_unique UNIQUE (agency_workspace_id, idempotency_key)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ceo_digest_runs_agency
  ON ceo_digest_runs(agency_workspace_id);
CREATE INDEX IF NOT EXISTS idx_ceo_digest_runs_status
  ON ceo_digest_runs(status);
CREATE INDEX IF NOT EXISTS idx_ceo_digest_runs_period
  ON ceo_digest_runs(period_start DESC);
CREATE INDEX IF NOT EXISTS idx_ceo_digest_runs_created
  ON ceo_digest_runs(created_at DESC);

-- Enable RLS
ALTER TABLE ceo_digest_runs ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Only agency admins/owners can view
CREATE POLICY "Agency admins can view digest runs" ON ceo_digest_runs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM agency_workspace_memberships m
      WHERE m.agency_workspace_id = ceo_digest_runs.agency_workspace_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
        AND m.status = 'active'
    )
  );

CREATE POLICY "Service role can manage digest runs" ON ceo_digest_runs
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- ============================================================================
-- 3. UPDATED_AT TRIGGERS
-- ============================================================================

CREATE TRIGGER ceo_digest_settings_updated_at
  BEFORE UPDATE ON ceo_digest_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER ceo_digest_runs_updated_at
  BEFORE UPDATE ON ceo_digest_runs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 4. GET WEEKLY CEO DIGEST FACTS RPC FUNCTION
-- ============================================================================
-- Computes deterministic metrics for the CEO digest.
-- Returns a structured JSON "facts packet" with:
-- - meta: date range, timezone, week label
-- - kpis: leads, quotes, binds, premium
-- - deltas_vs_previous_week
-- - funnel: counts by stage/status
-- - lists: top opportunities, aging items, top agents, top carriers
-- - service_ops: overdue tasks, backlog
-- - integration_health: Canopy metrics
-- - alerts: rule-based alerts with severity
-- ============================================================================

CREATE OR REPLACE FUNCTION get_weekly_ceo_digest_facts(
  p_agency_workspace_id UUID,
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ,
  p_timezone TEXT DEFAULT 'America/New_York',
  p_include_pii BOOLEAN DEFAULT FALSE,
  p_thresholds JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_meta JSONB;
  v_kpis JSONB;
  v_prev_kpis JSONB;
  v_deltas JSONB;
  v_funnel JSONB;
  v_lists JSONB;
  v_service_ops JSONB;
  v_integration_health JSONB;
  v_alerts JSONB := '[]'::JSONB;
  v_missing_data JSONB := '[]'::JSONB;

  -- Thresholds with defaults
  v_leads_drop_pct INTEGER;
  v_quotes_drop_pct INTEGER;
  v_overdue_tasks_critical INTEGER;
  v_aging_quotes_days INTEGER;
  v_canopy_reconnects_critical INTEGER;
  v_canopy_errors_critical INTEGER;

  -- Temp variables
  v_prev_period_start TIMESTAMPTZ;
  v_prev_period_end TIMESTAMPTZ;
  v_week_label TEXT;

  -- Current period counts
  v_leads_new INTEGER := 0;
  v_leads_contacted INTEGER := 0;
  v_leads_qualified INTEGER := 0;
  v_leads_quoted INTEGER := 0;
  v_leads_won INTEGER := 0;
  v_leads_lost INTEGER := 0;
  v_quotes_created INTEGER := 0;
  v_quotes_sent INTEGER := 0;
  v_quotes_accepted INTEGER := 0;
  v_quotes_declined INTEGER := 0;
  v_policies_bound INTEGER := 0;
  v_premium_written NUMERIC := 0;
  v_tasks_created INTEGER := 0;
  v_tasks_completed INTEGER := 0;
  v_tasks_overdue INTEGER := 0;

  -- Previous period counts
  v_prev_leads_new INTEGER := 0;
  v_prev_quotes_created INTEGER := 0;
  v_prev_policies_bound INTEGER := 0;
  v_prev_premium_written NUMERIC := 0;

  -- Integration health
  v_canopy_pulls INTEGER := 0;
  v_canopy_successful INTEGER := 0;
  v_canopy_errors INTEGER := 0;
  v_canopy_reconnects INTEGER := 0;
  v_canopy_servicing_pending INTEGER := 0;
  v_canopy_policies_synced INTEGER := 0;
BEGIN
  -- Parse thresholds with defaults
  v_leads_drop_pct := COALESCE((p_thresholds->>'leads_drop_pct')::INTEGER, 25);
  v_quotes_drop_pct := COALESCE((p_thresholds->>'quotes_drop_pct')::INTEGER, 25);
  v_overdue_tasks_critical := COALESCE((p_thresholds->>'overdue_tasks_critical')::INTEGER, 10);
  v_aging_quotes_days := COALESCE((p_thresholds->>'aging_quotes_days')::INTEGER, 7);
  v_canopy_reconnects_critical := COALESCE((p_thresholds->>'canopy_reconnects_critical')::INTEGER, 3);
  v_canopy_errors_critical := COALESCE((p_thresholds->>'canopy_errors_critical')::INTEGER, 5);

  -- Calculate previous period (same duration)
  v_prev_period_end := p_period_start - INTERVAL '1 second';
  v_prev_period_start := v_prev_period_end - (p_period_end - p_period_start);

  -- Generate week label
  v_week_label := 'Week of ' || TO_CHAR(p_period_start AT TIME ZONE p_timezone, 'Mon DD') ||
                  '-' || TO_CHAR(p_period_end AT TIME ZONE p_timezone, 'DD, YYYY');

  -- ============================================================================
  -- CURRENT PERIOD METRICS
  -- ============================================================================

  -- Leads metrics (check if leads table exists)
  BEGIN
    SELECT
      COALESCE(COUNT(*) FILTER (WHERE created_at >= p_period_start AND created_at < p_period_end), 0),
      COALESCE(COUNT(*) FILTER (WHERE status = 'contacted' AND updated_at >= p_period_start AND updated_at < p_period_end), 0),
      COALESCE(COUNT(*) FILTER (WHERE status = 'qualified' AND updated_at >= p_period_start AND updated_at < p_period_end), 0),
      COALESCE(COUNT(*) FILTER (WHERE status = 'quoted' AND updated_at >= p_period_start AND updated_at < p_period_end), 0),
      COALESCE(COUNT(*) FILTER (WHERE status = 'won' AND updated_at >= p_period_start AND updated_at < p_period_end), 0),
      COALESCE(COUNT(*) FILTER (WHERE status = 'lost' AND updated_at >= p_period_start AND updated_at < p_period_end), 0)
    INTO v_leads_new, v_leads_contacted, v_leads_qualified, v_leads_quoted, v_leads_won, v_leads_lost
    FROM leads l
    JOIN accounts a ON l.account_id = a.id
    WHERE a.agency_workspace_id = p_agency_workspace_id
      AND l.deleted_at IS NULL;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_missing_data := v_missing_data || '"leads"'::JSONB;
  END;

  -- Quotes metrics
  BEGIN
    SELECT
      COALESCE(COUNT(*) FILTER (WHERE created_at >= p_period_start AND created_at < p_period_end), 0),
      COALESCE(COUNT(*) FILTER (WHERE status = 'sent' AND updated_at >= p_period_start AND updated_at < p_period_end), 0),
      COALESCE(COUNT(*) FILTER (WHERE status = 'accepted' AND updated_at >= p_period_start AND updated_at < p_period_end), 0),
      COALESCE(COUNT(*) FILTER (WHERE status = 'declined' AND updated_at >= p_period_start AND updated_at < p_period_end), 0)
    INTO v_quotes_created, v_quotes_sent, v_quotes_accepted, v_quotes_declined
    FROM quotes q
    JOIN accounts a ON q.account_id = a.id
    WHERE a.agency_workspace_id = p_agency_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_missing_data := v_missing_data || '"quotes"'::JSONB;
  END;

  -- Policies metrics
  BEGIN
    SELECT
      COALESCE(COUNT(*), 0),
      COALESCE(SUM(premium), 0)
    INTO v_policies_bound, v_premium_written
    FROM policies p
    JOIN accounts a ON p.account_id = a.id
    WHERE a.agency_workspace_id = p_agency_workspace_id
      AND p.created_at >= p_period_start
      AND p.created_at < p_period_end
      AND p.status IN ('active', 'pending')
      AND p.deleted_at IS NULL;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_missing_data := v_missing_data || '"policies"'::JSONB;
  END;

  -- Tasks metrics
  BEGIN
    SELECT
      COALESCE(COUNT(*) FILTER (WHERE created_at >= p_period_start AND created_at < p_period_end), 0),
      COALESCE(COUNT(*) FILTER (WHERE completed_at >= p_period_start AND completed_at < p_period_end), 0),
      COALESCE(COUNT(*) FILTER (WHERE status = 'pending' AND due_at < NOW()), 0)
    INTO v_tasks_created, v_tasks_completed, v_tasks_overdue
    FROM tasks t
    WHERE t.agency_workspace_id = p_agency_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_missing_data := v_missing_data || '"tasks"'::JSONB;
  END;

  -- ============================================================================
  -- PREVIOUS PERIOD METRICS (for deltas)
  -- ============================================================================

  BEGIN
    SELECT COALESCE(COUNT(*), 0)
    INTO v_prev_leads_new
    FROM leads l
    JOIN accounts a ON l.account_id = a.id
    WHERE a.agency_workspace_id = p_agency_workspace_id
      AND l.created_at >= v_prev_period_start
      AND l.created_at < v_prev_period_end
      AND l.deleted_at IS NULL;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL; -- Already handled
  END;

  BEGIN
    SELECT COALESCE(COUNT(*), 0)
    INTO v_prev_quotes_created
    FROM quotes q
    JOIN accounts a ON q.account_id = a.id
    WHERE a.agency_workspace_id = p_agency_workspace_id
      AND q.created_at >= v_prev_period_start
      AND q.created_at < v_prev_period_end;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  BEGIN
    SELECT COALESCE(COUNT(*), 0), COALESCE(SUM(premium), 0)
    INTO v_prev_policies_bound, v_prev_premium_written
    FROM policies p
    JOIN accounts a ON p.account_id = a.id
    WHERE a.agency_workspace_id = p_agency_workspace_id
      AND p.created_at >= v_prev_period_start
      AND p.created_at < v_prev_period_end
      AND p.status IN ('active', 'pending')
      AND p.deleted_at IS NULL;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  -- ============================================================================
  -- CANOPY INTEGRATION HEALTH
  -- ============================================================================

  BEGIN
    -- Canopy pulls this period
    SELECT
      COALESCE(COUNT(*), 0),
      COALESCE(COUNT(*) FILTER (WHERE status = 'complete'), 0),
      COALESCE(COUNT(*) FILTER (WHERE status = 'error'), 0)
    INTO v_canopy_pulls, v_canopy_successful, v_canopy_errors
    FROM canopy_pulls cp
    JOIN accounts a ON cp.account_id = a.id
    WHERE a.agency_workspace_id = p_agency_workspace_id
      AND cp.created_at >= p_period_start
      AND cp.created_at < p_period_end;

    -- Canopy reconnects required
    SELECT COALESCE(COUNT(*), 0)
    INTO v_canopy_reconnects
    FROM canopy_monitorings cm
    JOIN accounts a ON cm.account_id = a.id
    WHERE a.agency_workspace_id = p_agency_workspace_id
      AND cm.status = 'reconnect_required';

    -- Canopy servicing actions pending
    SELECT COALESCE(COUNT(*), 0)
    INTO v_canopy_servicing_pending
    FROM canopy_servicing_actions csa
    JOIN canopy_pulls cp ON csa.pull_id = cp.id
    JOIN accounts a ON cp.account_id = a.id
    WHERE a.agency_workspace_id = p_agency_workspace_id
      AND csa.status IN ('pending', 'waiting_confirmation');

    -- Total synced policies
    SELECT COALESCE(COUNT(*), 0)
    INTO v_canopy_policies_synced
    FROM canopy_policies cpol
    JOIN canopy_pulls cp ON cpol.pull_id = cp.id
    JOIN accounts a ON cp.account_id = a.id
    WHERE a.agency_workspace_id = p_agency_workspace_id
      AND cp.status = 'complete';

  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_missing_data := v_missing_data || '"canopy"'::JSONB;
    v_canopy_pulls := NULL;
    v_canopy_successful := NULL;
    v_canopy_errors := NULL;
    v_canopy_reconnects := NULL;
    v_canopy_servicing_pending := NULL;
    v_canopy_policies_synced := NULL;
  END;

  -- ============================================================================
  -- BUILD JSON STRUCTURES
  -- ============================================================================

  -- Meta
  v_meta := jsonb_build_object(
    'period_start', p_period_start,
    'period_end', p_period_end,
    'timezone', p_timezone,
    'week_label', v_week_label,
    'generated_at', NOW(),
    'agency_workspace_id', p_agency_workspace_id
  );

  -- KPIs
  v_kpis := jsonb_build_object(
    'leads_new', v_leads_new,
    'leads_contacted', v_leads_contacted,
    'leads_qualified', v_leads_qualified,
    'leads_quoted', v_leads_quoted,
    'leads_won', v_leads_won,
    'leads_lost', v_leads_lost,
    'quotes_created', v_quotes_created,
    'quotes_sent', v_quotes_sent,
    'quotes_accepted', v_quotes_accepted,
    'quotes_declined', v_quotes_declined,
    'policies_bound', v_policies_bound,
    'premium_written', v_premium_written,
    'tasks_created', v_tasks_created,
    'tasks_completed', v_tasks_completed,
    'tasks_overdue', v_tasks_overdue
  );

  -- Calculate deltas
  v_deltas := jsonb_build_object(
    'leads_new', jsonb_build_object(
      'current', v_leads_new,
      'previous', v_prev_leads_new,
      'change', v_leads_new - v_prev_leads_new,
      'change_pct', CASE WHEN v_prev_leads_new > 0
        THEN ROUND(((v_leads_new::NUMERIC - v_prev_leads_new) / v_prev_leads_new * 100)::NUMERIC, 1)
        ELSE NULL END
    ),
    'quotes_created', jsonb_build_object(
      'current', v_quotes_created,
      'previous', v_prev_quotes_created,
      'change', v_quotes_created - v_prev_quotes_created,
      'change_pct', CASE WHEN v_prev_quotes_created > 0
        THEN ROUND(((v_quotes_created::NUMERIC - v_prev_quotes_created) / v_prev_quotes_created * 100)::NUMERIC, 1)
        ELSE NULL END
    ),
    'policies_bound', jsonb_build_object(
      'current', v_policies_bound,
      'previous', v_prev_policies_bound,
      'change', v_policies_bound - v_prev_policies_bound,
      'change_pct', CASE WHEN v_prev_policies_bound > 0
        THEN ROUND(((v_policies_bound::NUMERIC - v_prev_policies_bound) / v_prev_policies_bound * 100)::NUMERIC, 1)
        ELSE NULL END
    ),
    'premium_written', jsonb_build_object(
      'current', v_premium_written,
      'previous', v_prev_premium_written,
      'change', v_premium_written - v_prev_premium_written,
      'change_pct', CASE WHEN v_prev_premium_written > 0
        THEN ROUND(((v_premium_written - v_prev_premium_written) / v_prev_premium_written * 100)::NUMERIC, 1)
        ELSE NULL END
    )
  );

  -- Build funnel
  v_funnel := jsonb_build_object(
    'leads', jsonb_build_object(
      'new', v_leads_new,
      'contacted', v_leads_contacted,
      'qualified', v_leads_qualified,
      'quoted', v_leads_quoted,
      'won', v_leads_won,
      'lost', v_leads_lost
    ),
    'quotes', jsonb_build_object(
      'created', v_quotes_created,
      'sent', v_quotes_sent,
      'accepted', v_quotes_accepted,
      'declined', v_quotes_declined
    )
  );

  -- Build lists (top opportunities, aging items, top agents, top carriers)
  v_lists := jsonb_build_object(
    'top_opportunities', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB)
      FROM (
        SELECT
          q.id,
          CASE WHEN p_include_pii THEN a.name
               ELSE LEFT(a.name, 1) || '***' END AS account_name,
          q.policy_type AS line_of_business,
          q.premium,
          q.status,
          '/quotes/' || q.id AS deep_link
        FROM quotes q
        JOIN accounts a ON q.account_id = a.id
        WHERE a.agency_workspace_id = p_agency_workspace_id
          AND q.status IN ('draft', 'sent')
          AND q.premium > 0
        ORDER BY q.premium DESC
        LIMIT 5
      ) t
    ),
    'aging_quotes', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB)
      FROM (
        SELECT
          q.id,
          CASE WHEN p_include_pii THEN a.name
               ELSE LEFT(a.name, 1) || '***' END AS account_name,
          q.policy_type AS line_of_business,
          q.premium,
          EXTRACT(DAY FROM NOW() - q.created_at)::INTEGER AS days_old,
          '/quotes/' || q.id AS deep_link
        FROM quotes q
        JOIN accounts a ON q.account_id = a.id
        WHERE a.agency_workspace_id = p_agency_workspace_id
          AND q.status IN ('draft', 'sent')
          AND q.created_at < NOW() - (v_aging_quotes_days || ' days')::INTERVAL
        ORDER BY q.created_at ASC
        LIMIT 5
      ) t
    ),
    'top_agents', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB)
      FROM (
        SELECT
          p.id AS agent_id,
          CASE WHEN p_include_pii THEN p.full_name
               ELSE SPLIT_PART(p.full_name, ' ', 1) || ' ' || LEFT(SPLIT_PART(p.full_name, ' ', 2), 1) || '.' END AS agent_name,
          COUNT(pol.id) AS policies_this_week,
          COALESCE(SUM(pol.premium), 0)::NUMERIC AS premium_written
        FROM profiles p
        JOIN agency_workspace_memberships m ON m.user_id = p.id
        LEFT JOIN policies pol ON pol.created_by = p.id
          AND pol.created_at >= p_period_start
          AND pol.created_at < p_period_end
          AND pol.deleted_at IS NULL
        WHERE m.agency_workspace_id = p_agency_workspace_id
          AND m.role IN ('producer', 'admin', 'owner')
          AND m.status = 'active'
        GROUP BY p.id, p.full_name
        ORDER BY premium_written DESC
        LIMIT 5
      ) t
    ),
    'top_carriers', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB)
      FROM (
        SELECT
          c.id AS carrier_id,
          c.name AS carrier_name,
          COUNT(pol.id) AS policies_this_week,
          COALESCE(SUM(pol.premium), 0)::NUMERIC AS premium_written
        FROM carriers c
        JOIN policies pol ON pol.carrier_id = c.id
        JOIN accounts a ON pol.account_id = a.id
        WHERE a.agency_workspace_id = p_agency_workspace_id
          AND pol.created_at >= p_period_start
          AND pol.created_at < p_period_end
          AND pol.deleted_at IS NULL
        GROUP BY c.id, c.name
        ORDER BY premium_written DESC
        LIMIT 5
      ) t
    ),
    'top_lines_of_business', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB)
      FROM (
        SELECT
          pol.line_of_business,
          COUNT(pol.id) AS policies_this_week,
          COALESCE(SUM(pol.premium), 0)::NUMERIC AS premium_written
        FROM policies pol
        JOIN accounts a ON pol.account_id = a.id
        WHERE a.agency_workspace_id = p_agency_workspace_id
          AND pol.created_at >= p_period_start
          AND pol.created_at < p_period_end
          AND pol.deleted_at IS NULL
          AND pol.line_of_business IS NOT NULL
        GROUP BY pol.line_of_business
        ORDER BY premium_written DESC
        LIMIT 5
      ) t
    )
  );

  -- Service/Ops backlog
  v_service_ops := jsonb_build_object(
    'overdue_tasks', v_tasks_overdue,
    'tasks_by_priority', (
      SELECT COALESCE(jsonb_object_agg(priority, cnt), '{}'::JSONB)
      FROM (
        SELECT priority, COUNT(*) AS cnt
        FROM tasks
        WHERE agency_workspace_id = p_agency_workspace_id
          AND status = 'pending'
        GROUP BY priority
      ) t
    ),
    'tasks_by_category', (
      SELECT COALESCE(jsonb_object_agg(entity_type, cnt), '{}'::JSONB)
      FROM (
        SELECT COALESCE(entity_type, 'other') AS entity_type, COUNT(*) AS cnt
        FROM tasks
        WHERE agency_workspace_id = p_agency_workspace_id
          AND status = 'pending'
        GROUP BY entity_type
      ) t
    ),
    'overdue_tasks_list', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB)
      FROM (
        SELECT
          t.id,
          t.title,
          t.priority,
          t.due_at,
          EXTRACT(DAY FROM NOW() - t.due_at)::INTEGER AS days_overdue,
          '/' || t.entity_type || 's/' || t.entity_id AS deep_link
        FROM tasks t
        WHERE t.agency_workspace_id = p_agency_workspace_id
          AND t.status = 'pending'
          AND t.due_at < NOW()
        ORDER BY t.due_at ASC
        LIMIT 10
      ) t
    )
  );

  -- Integration health
  v_integration_health := jsonb_build_object(
    'canopy', CASE WHEN v_canopy_pulls IS NOT NULL THEN jsonb_build_object(
      'available', TRUE,
      'pulls_this_week', v_canopy_pulls,
      'successful_pulls', v_canopy_successful,
      'failed_pulls', v_canopy_errors,
      'reconnects_required', v_canopy_reconnects,
      'servicing_pending', v_canopy_servicing_pending,
      'total_policies_synced', v_canopy_policies_synced,
      'error_rate_pct', CASE WHEN v_canopy_pulls > 0
        THEN ROUND((v_canopy_errors::NUMERIC / v_canopy_pulls * 100)::NUMERIC, 1)
        ELSE 0 END
    ) ELSE jsonb_build_object('available', FALSE, 'missing', TRUE) END
  );

  -- ============================================================================
  -- GENERATE ALERTS
  -- ============================================================================

  -- Alert: Leads drop
  IF v_prev_leads_new > 0 AND
     ((v_prev_leads_new - v_leads_new)::NUMERIC / v_prev_leads_new * 100) >= v_leads_drop_pct THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'severity', 'warning',
      'category', 'leads',
      'title', 'Significant drop in new leads',
      'message', 'New leads dropped by ' ||
        ROUND(((v_prev_leads_new - v_leads_new)::NUMERIC / v_prev_leads_new * 100)::NUMERIC, 1) ||
        '% compared to last week (' || v_leads_new || ' vs ' || v_prev_leads_new || ')',
      'evidence', jsonb_build_object('current', v_leads_new, 'previous', v_prev_leads_new)
    ));
  END IF;

  -- Alert: Quotes drop
  IF v_prev_quotes_created > 0 AND
     ((v_prev_quotes_created - v_quotes_created)::NUMERIC / v_prev_quotes_created * 100) >= v_quotes_drop_pct THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'severity', 'warning',
      'category', 'quotes',
      'title', 'Significant drop in quotes',
      'message', 'Quotes created dropped by ' ||
        ROUND(((v_prev_quotes_created - v_quotes_created)::NUMERIC / v_prev_quotes_created * 100)::NUMERIC, 1) ||
        '% compared to last week (' || v_quotes_created || ' vs ' || v_prev_quotes_created || ')',
      'evidence', jsonb_build_object('current', v_quotes_created, 'previous', v_prev_quotes_created)
    ));
  END IF;

  -- Alert: Critical overdue tasks
  IF v_tasks_overdue >= v_overdue_tasks_critical THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'severity', 'critical',
      'category', 'operations',
      'title', 'Critical backlog of overdue tasks',
      'message', v_tasks_overdue || ' tasks are overdue (threshold: ' || v_overdue_tasks_critical || ')',
      'evidence', jsonb_build_object('overdue_count', v_tasks_overdue, 'threshold', v_overdue_tasks_critical)
    ));
  END IF;

  -- Alert: Canopy reconnects required
  IF v_canopy_reconnects IS NOT NULL AND v_canopy_reconnects >= v_canopy_reconnects_critical THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'severity', 'critical',
      'category', 'integration',
      'title', 'Canopy connections need attention',
      'message', v_canopy_reconnects || ' Canopy connections require reconnection',
      'evidence', jsonb_build_object('reconnects', v_canopy_reconnects, 'threshold', v_canopy_reconnects_critical)
    ));
  END IF;

  -- Alert: Canopy errors
  IF v_canopy_errors IS NOT NULL AND v_canopy_errors >= v_canopy_errors_critical THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'severity', 'warning',
      'category', 'integration',
      'title', 'Elevated Canopy sync errors',
      'message', v_canopy_errors || ' Canopy pulls failed this week',
      'evidence', jsonb_build_object('errors', v_canopy_errors, 'total', v_canopy_pulls, 'threshold', v_canopy_errors_critical)
    ));
  END IF;

  -- Alert: Servicing actions pending
  IF v_canopy_servicing_pending IS NOT NULL AND v_canopy_servicing_pending > 0 THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'severity', 'info',
      'category', 'integration',
      'title', 'Canopy servicing actions pending',
      'message', v_canopy_servicing_pending || ' servicing actions awaiting confirmation',
      'evidence', jsonb_build_object('pending', v_canopy_servicing_pending)
    ));
  END IF;

  -- ============================================================================
  -- BUILD FINAL RESULT
  -- ============================================================================

  v_result := jsonb_build_object(
    'meta', v_meta,
    'kpis', v_kpis,
    'deltas_vs_previous_week', v_deltas,
    'funnel', v_funnel,
    'lists', v_lists,
    'service_ops', v_service_ops,
    'integration_health', v_integration_health,
    'alerts', v_alerts,
    'missing_data', v_missing_data
  );

  RETURN v_result;
END;
$$;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION get_weekly_ceo_digest_facts TO service_role;

-- ============================================================================
-- 5. HELPER FUNCTION: GET OR CREATE DEFAULT SETTINGS
-- ============================================================================

CREATE OR REPLACE FUNCTION get_or_create_ceo_digest_settings(
  p_agency_workspace_id UUID
)
RETURNS ceo_digest_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings ceo_digest_settings;
BEGIN
  -- Try to get existing settings
  SELECT * INTO v_settings
  FROM ceo_digest_settings
  WHERE agency_workspace_id = p_agency_workspace_id;

  -- If not found, create defaults
  IF NOT FOUND THEN
    INSERT INTO ceo_digest_settings (agency_workspace_id)
    VALUES (p_agency_workspace_id)
    RETURNING * INTO v_settings;
  END IF;

  RETURN v_settings;
END;
$$;

GRANT EXECUTE ON FUNCTION get_or_create_ceo_digest_settings TO authenticated;
GRANT EXECUTE ON FUNCTION get_or_create_ceo_digest_settings TO service_role;

-- ============================================================================
-- 6. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE ceo_digest_settings IS 'Configuration for weekly CEO digest emails per agency';
COMMENT ON TABLE ceo_digest_runs IS 'Audit trail of CEO digest generation and email sends';
COMMENT ON FUNCTION get_weekly_ceo_digest_facts IS 'Computes deterministic metrics for CEO weekly digest';
COMMENT ON FUNCTION get_or_create_ceo_digest_settings IS 'Gets or creates default digest settings for an agency';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
