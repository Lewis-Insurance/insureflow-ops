-- ============================================================================
-- PHASE 3: GOAL MANAGEMENT & KPI DASHBOARD
-- ============================================================================
-- InsuredMine-competitive goal management system with:
-- - Agency-level goals (GWP targets, retention rates)
-- - Producer goals (new policies, renewals, commissions)
-- - Team goals (cross-sell ratios, customer satisfaction)
-- - Real-time progress tracking
-- - Gamification (leaderboards, achievements)
-- ============================================================================

-- ============================================================================
-- STEP 1: GOAL TYPES (Pre-defined goal categories)
-- ============================================================================

CREATE TABLE IF NOT EXISTS goal_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identification
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,

  -- Category
  category TEXT NOT NULL CHECK (category IN (
    'revenue',       -- GWP, premium, commission
    'production',    -- Policies written, quotes, applications
    'retention',     -- Retention rate, renewals
    'growth',        -- New clients, cross-sell, up-sell
    'service',       -- Response time, satisfaction, NPS
    'activity'       -- Calls, meetings, tasks completed
  )),

  -- Metric configuration
  metric_type TEXT NOT NULL CHECK (metric_type IN (
    'currency',      -- Dollar amounts
    'count',         -- Number of items
    'percentage',    -- Percentage values
    'ratio',         -- Ratio values
    'score'          -- Score/rating values
  )),

  -- Calculation method
  aggregation TEXT NOT NULL DEFAULT 'sum' CHECK (aggregation IN (
    'sum',           -- Sum of values
    'count',         -- Count of records
    'average',       -- Average of values
    'min',           -- Minimum value
    'max',           -- Maximum value
    'latest'         -- Most recent value
  )),

  -- Data source
  source_table TEXT,           -- Table to query for actual values
  source_field TEXT,           -- Field to aggregate
  source_filter JSONB,         -- Additional filters

  -- Display
  icon TEXT,
  color TEXT DEFAULT '#0066cc',

  -- System flag
  is_system BOOLEAN DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- STEP 2: GOALS (Actual goal instances)
-- ============================================================================

CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_workspace_id UUID NOT NULL REFERENCES agency_workspaces(id) ON DELETE CASCADE,

  -- Goal definition
  name TEXT NOT NULL,
  description TEXT,
  goal_type_id UUID REFERENCES goal_types(id),

  -- Scope
  scope TEXT NOT NULL CHECK (scope IN (
    'agency',        -- Entire agency goal
    'team',          -- Team/department goal
    'producer',      -- Individual producer goal
    'personal'       -- Personal goal (self-set)
  )),

  -- Target assignment
  assigned_to UUID REFERENCES auth.users(id),     -- For producer/personal goals
  team_id UUID,                                    -- For team goals (future)

  -- Target values
  target_value NUMERIC NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN (
    'at_least',      -- Must meet or exceed
    'at_most',       -- Must stay at or below
    'exactly',       -- Must match exactly
    'range'          -- Must be within range
  )),
  target_min NUMERIC,          -- For range type
  target_max NUMERIC,          -- For range type

  -- Time period
  period_type TEXT NOT NULL CHECK (period_type IN (
    'daily',
    'weekly',
    'monthly',
    'quarterly',
    'yearly',
    'custom'
  )),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,

  -- Current progress (cached for performance)
  current_value NUMERIC DEFAULT 0,
  progress_percentage NUMERIC DEFAULT 0,
  last_calculated_at TIMESTAMPTZ,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN (
    'draft',         -- Not yet started
    'active',        -- In progress
    'achieved',      -- Goal met
    'failed',        -- Goal not met (past end date)
    'cancelled'      -- Manually cancelled
  )),
  achieved_at TIMESTAMPTZ,

  -- Notifications
  notify_on_milestone BOOLEAN DEFAULT TRUE,
  notify_on_achievement BOOLEAN DEFAULT TRUE,
  notify_at_risk BOOLEAN DEFAULT TRUE,          -- Notify when falling behind

  -- Visibility
  is_public BOOLEAN DEFAULT TRUE,               -- Visible on leaderboards

  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- STEP 3: GOAL MILESTONES (Sub-targets within goals)
-- ============================================================================

CREATE TABLE IF NOT EXISTS goal_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,

  -- Milestone definition
  name TEXT NOT NULL,
  description TEXT,
  target_value NUMERIC NOT NULL,
  percentage_of_goal NUMERIC,              -- Auto-calculated percentage

  -- Status
  is_achieved BOOLEAN DEFAULT FALSE,
  achieved_at TIMESTAMPTZ,

  -- Rewards
  reward_points INTEGER DEFAULT 0,
  reward_badge_id UUID,                    -- Reference to achievement badge

  -- Order
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- STEP 4: GOAL PROGRESS SNAPSHOTS (Historical tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS goal_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,

  -- Snapshot data
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  current_value NUMERIC NOT NULL,
  progress_percentage NUMERIC NOT NULL,

  -- Change from previous
  value_change NUMERIC,
  percentage_change NUMERIC,

  -- Context
  snapshot_type TEXT DEFAULT 'scheduled' CHECK (snapshot_type IN (
    'scheduled',     -- Regular scheduled snapshot
    'manual',        -- Manual refresh
    'milestone',     -- Triggered by milestone achievement
    'final'          -- End of period snapshot
  )),

  -- Metadata
  recorded_by UUID REFERENCES auth.users(id),
  notes TEXT
);

-- ============================================================================
-- STEP 5: ACHIEVEMENTS (Gamification - Badges & Awards)
-- ============================================================================

CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Definition
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,

  -- Category
  category TEXT NOT NULL CHECK (category IN (
    'goal',          -- Goal-related achievements
    'streak',        -- Consistency achievements
    'milestone',     -- Specific milestone reached
    'competition',   -- Leaderboard/competition wins
    'special'        -- Special/custom achievements
  )),

  -- Criteria
  criteria_type TEXT NOT NULL CHECK (criteria_type IN (
    'goal_achieved',           -- Complete X goals
    'goal_exceeded',           -- Exceed goal by X%
    'streak_days',             -- Maintain streak for X days
    'leaderboard_position',    -- Reach position X
    'cumulative_value',        -- Reach cumulative X
    'custom'                   -- Custom criteria
  )),
  criteria_config JSONB,       -- Specific criteria parameters

  -- Display
  icon TEXT,
  badge_image_url TEXT,
  color TEXT DEFAULT '#FFD700',

  -- Points
  points INTEGER DEFAULT 0,

  -- Rarity
  rarity TEXT DEFAULT 'common' CHECK (rarity IN (
    'common',
    'uncommon',
    'rare',
    'epic',
    'legendary'
  )),

  -- System flag
  is_system BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- STEP 6: USER ACHIEVEMENTS (Earned achievements)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  agency_workspace_id UUID REFERENCES agency_workspaces(id) ON DELETE CASCADE,

  -- Award details
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  goal_id UUID REFERENCES goals(id),           -- Related goal if applicable

  -- Context
  context_data JSONB,                          -- Additional context about how it was earned

  -- Display
  is_displayed BOOLEAN DEFAULT TRUE,           -- Show on profile
  is_new BOOLEAN DEFAULT TRUE,                 -- New badge indicator

  -- Unique constraint
  UNIQUE(user_id, achievement_id, goal_id)
);

-- ============================================================================
-- STEP 7: LEADERBOARDS (Competition tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS leaderboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_workspace_id UUID NOT NULL REFERENCES agency_workspaces(id) ON DELETE CASCADE,

  -- Definition
  name TEXT NOT NULL,
  description TEXT,

  -- Scope
  metric_type TEXT NOT NULL,                   -- What's being measured
  goal_type_id UUID REFERENCES goal_types(id),

  -- Time period
  period_type TEXT NOT NULL CHECK (period_type IN (
    'daily',
    'weekly',
    'monthly',
    'quarterly',
    'yearly',
    'all_time'
  )),
  start_date DATE,
  end_date DATE,

  -- Participants
  participant_type TEXT NOT NULL CHECK (participant_type IN (
    'producer',
    'team',
    'all'
  )),

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN (
    'upcoming',
    'active',
    'completed',
    'archived'
  )),

  -- Display
  is_public BOOLEAN DEFAULT TRUE,
  show_rank BOOLEAN DEFAULT TRUE,
  show_values BOOLEAN DEFAULT TRUE,

  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- STEP 8: LEADERBOARD ENTRIES (Cached rankings)
-- ============================================================================

CREATE TABLE IF NOT EXISTS leaderboard_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leaderboard_id UUID NOT NULL REFERENCES leaderboards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Ranking
  rank INTEGER NOT NULL,
  previous_rank INTEGER,
  rank_change INTEGER,                         -- Positive = moved up

  -- Values
  current_value NUMERIC NOT NULL,
  previous_value NUMERIC,
  value_change NUMERIC,

  -- Metadata
  calculated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint
  UNIQUE(leaderboard_id, user_id)
);

-- ============================================================================
-- STEP 9: GOAL TEMPLATES (Pre-built goal configurations)
-- ============================================================================

CREATE TABLE IF NOT EXISTS goal_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_workspace_id UUID REFERENCES agency_workspaces(id) ON DELETE CASCADE,

  -- Template definition
  name TEXT NOT NULL,
  description TEXT,
  goal_type_id UUID REFERENCES goal_types(id),

  -- Default values
  default_target NUMERIC,
  default_period TEXT CHECK (default_period IN (
    'daily', 'weekly', 'monthly', 'quarterly', 'yearly'
  )),
  default_scope TEXT CHECK (default_scope IN (
    'agency', 'team', 'producer', 'personal'
  )),

  -- Suggested milestones
  milestones JSONB,                            -- Array of milestone configs

  -- System flag
  is_system BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- STEP 10: INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_goals_agency ON goals(agency_workspace_id);
CREATE INDEX IF NOT EXISTS idx_goals_assigned ON goals(assigned_to);
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
CREATE INDEX IF NOT EXISTS idx_goals_period ON goals(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_goals_type ON goals(goal_type_id);

CREATE INDEX IF NOT EXISTS idx_milestones_goal ON goal_milestones(goal_id);
CREATE INDEX IF NOT EXISTS idx_progress_goal ON goal_progress(goal_id);
CREATE INDEX IF NOT EXISTS idx_progress_date ON goal_progress(recorded_at);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_agency ON user_achievements(agency_workspace_id);

CREATE INDEX IF NOT EXISTS idx_leaderboards_agency ON leaderboards(agency_workspace_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_entries_lb ON leaderboard_entries(leaderboard_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_entries_user ON leaderboard_entries(user_id);

-- ============================================================================
-- STEP 11: RLS POLICIES
-- ============================================================================

ALTER TABLE goal_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_templates ENABLE ROW LEVEL SECURITY;

-- Add agency_workspace_id to goal_types for custom types (MUST be before RLS policy)
ALTER TABLE goal_types ADD COLUMN IF NOT EXISTS agency_workspace_id UUID REFERENCES agency_workspaces(id) ON DELETE CASCADE;

-- Drop existing policies if re-running migration
DROP POLICY IF EXISTS "goal_types_select" ON goal_types;
DROP POLICY IF EXISTS "goals_select" ON goals;
DROP POLICY IF EXISTS "goals_insert" ON goals;
DROP POLICY IF EXISTS "goals_update" ON goals;
DROP POLICY IF EXISTS "goals_delete" ON goals;
DROP POLICY IF EXISTS "milestones_select" ON goal_milestones;
DROP POLICY IF EXISTS "milestones_insert" ON goal_milestones;
DROP POLICY IF EXISTS "progress_select" ON goal_progress;
DROP POLICY IF EXISTS "progress_insert" ON goal_progress;
DROP POLICY IF EXISTS "achievements_select" ON achievements;
DROP POLICY IF EXISTS "user_achievements_select" ON user_achievements;
DROP POLICY IF EXISTS "user_achievements_insert" ON user_achievements;
DROP POLICY IF EXISTS "leaderboards_select" ON leaderboards;
DROP POLICY IF EXISTS "leaderboards_insert" ON leaderboards;
DROP POLICY IF EXISTS "leaderboards_update" ON leaderboards;
DROP POLICY IF EXISTS "lb_entries_select" ON leaderboard_entries;
DROP POLICY IF EXISTS "templates_select" ON goal_templates;
DROP POLICY IF EXISTS "templates_insert" ON goal_templates;

-- Goal types: System types visible to all, custom types to agency
CREATE POLICY "goal_types_select" ON goal_types
  FOR SELECT USING (
    is_system = TRUE
    OR agency_workspace_id IS NULL
    OR is_agency_member(agency_workspace_id)
  );

-- Goals: Agency members can view their agency's goals
CREATE POLICY "goals_select" ON goals
  FOR SELECT USING (is_agency_member(agency_workspace_id));

CREATE POLICY "goals_insert" ON goals
  FOR INSERT WITH CHECK (is_agency_member(agency_workspace_id));

CREATE POLICY "goals_update" ON goals
  FOR UPDATE USING (
    is_agency_admin(agency_workspace_id)
    OR (assigned_to = auth.uid() AND scope IN ('producer', 'personal'))
  );

CREATE POLICY "goals_delete" ON goals
  FOR DELETE USING (is_agency_admin(agency_workspace_id));

-- Milestones: Follow parent goal
CREATE POLICY "milestones_select" ON goal_milestones
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM goals g
      WHERE g.id = goal_milestones.goal_id
        AND is_agency_member(g.agency_workspace_id)
    )
  );

CREATE POLICY "milestones_insert" ON goal_milestones
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM goals g
      WHERE g.id = goal_milestones.goal_id
        AND is_agency_member(g.agency_workspace_id)
    )
  );

-- Progress: Follow parent goal
CREATE POLICY "progress_select" ON goal_progress
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM goals g
      WHERE g.id = goal_progress.goal_id
        AND is_agency_member(g.agency_workspace_id)
    )
  );

CREATE POLICY "progress_insert" ON goal_progress
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM goals g
      WHERE g.id = goal_progress.goal_id
        AND is_agency_member(g.agency_workspace_id)
    )
  );

-- Achievements: System achievements visible to all
CREATE POLICY "achievements_select" ON achievements
  FOR SELECT USING (is_active = TRUE);

-- User achievements: Own achievements or agency visibility
CREATE POLICY "user_achievements_select" ON user_achievements
  FOR SELECT USING (
    user_id = auth.uid()
    OR (
      agency_workspace_id IS NOT NULL
      AND is_agency_member(agency_workspace_id)
    )
  );

CREATE POLICY "user_achievements_insert" ON user_achievements
  FOR INSERT WITH CHECK (
    agency_workspace_id IS NULL
    OR is_agency_member(agency_workspace_id)
  );

-- Leaderboards: Agency members
CREATE POLICY "leaderboards_select" ON leaderboards
  FOR SELECT USING (is_agency_member(agency_workspace_id));

CREATE POLICY "leaderboards_insert" ON leaderboards
  FOR INSERT WITH CHECK (is_agency_admin(agency_workspace_id));

CREATE POLICY "leaderboards_update" ON leaderboards
  FOR UPDATE USING (is_agency_admin(agency_workspace_id));

-- Leaderboard entries: Follow parent leaderboard
CREATE POLICY "lb_entries_select" ON leaderboard_entries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM leaderboards l
      WHERE l.id = leaderboard_entries.leaderboard_id
        AND is_agency_member(l.agency_workspace_id)
    )
  );

-- Goal templates: Agency members
CREATE POLICY "templates_select" ON goal_templates
  FOR SELECT USING (
    is_system = TRUE
    OR agency_workspace_id IS NULL
    OR is_agency_member(agency_workspace_id)
  );

CREATE POLICY "templates_insert" ON goal_templates
  FOR INSERT WITH CHECK (
    agency_workspace_id IS NULL
    OR is_agency_admin(agency_workspace_id)
  );

-- ============================================================================
-- STEP 12: SEED SYSTEM GOAL TYPES
-- ============================================================================

INSERT INTO goal_types (name, slug, description, category, metric_type, aggregation, source_table, source_field, icon, is_system)
VALUES
  -- Revenue Goals
  ('Gross Written Premium', 'gwp', 'Total premium written', 'revenue', 'currency', 'sum', 'policies', 'premium', 'dollar-sign', TRUE),
  ('Commission Earned', 'commission', 'Total commissions earned', 'revenue', 'currency', 'sum', 'commissions', 'amount', 'credit-card', TRUE),
  ('New Business Premium', 'new-business', 'Premium from new policies', 'revenue', 'currency', 'sum', 'policies', 'premium', 'trending-up', TRUE),
  ('Renewal Premium', 'renewal-premium', 'Premium from renewals', 'revenue', 'currency', 'sum', 'policies', 'premium', 'refresh-cw', TRUE),

  -- Production Goals
  ('Policies Written', 'policies-written', 'Number of policies bound', 'production', 'count', 'count', 'policies', 'id', 'file-text', TRUE),
  ('Quotes Generated', 'quotes-generated', 'Number of quotes created', 'production', 'count', 'count', 'quotes', 'id', 'file-plus', TRUE),
  ('Applications Submitted', 'applications', 'Applications submitted to carriers', 'production', 'count', 'count', 'applications', 'id', 'send', TRUE),
  ('New Clients', 'new-clients', 'New customer accounts', 'growth', 'count', 'count', 'accounts', 'id', 'user-plus', TRUE),

  -- Retention Goals
  ('Retention Rate', 'retention-rate', 'Percentage of policies renewed', 'retention', 'percentage', 'average', NULL, NULL, 'shield', TRUE),
  ('Renewals Processed', 'renewals-processed', 'Number of renewals completed', 'retention', 'count', 'count', 'policies', 'id', 'rotate-cw', TRUE),

  -- Growth Goals
  ('Cross-Sell Rate', 'cross-sell-rate', 'Multi-policy households percentage', 'growth', 'percentage', 'average', NULL, NULL, 'layers', TRUE),
  ('Referrals Received', 'referrals', 'Number of referrals received', 'growth', 'count', 'count', 'leads', 'id', 'users', TRUE),

  -- Service Goals
  ('Customer Satisfaction', 'csat', 'Customer satisfaction score', 'service', 'score', 'average', 'nps_responses', 'score', 'smile', TRUE),
  ('NPS Score', 'nps', 'Net Promoter Score', 'service', 'score', 'average', 'nps_responses', 'score', 'thumbs-up', TRUE),
  ('Response Time', 'response-time', 'Average response time in hours', 'service', 'count', 'average', NULL, NULL, 'clock', TRUE),

  -- Activity Goals
  ('Calls Made', 'calls-made', 'Outbound calls completed', 'activity', 'count', 'count', 'call_logs', 'id', 'phone', TRUE),
  ('Tasks Completed', 'tasks-completed', 'Tasks marked complete', 'activity', 'count', 'count', 'tasks', 'id', 'check-square', TRUE),
  ('Meetings Held', 'meetings', 'Meetings completed', 'activity', 'count', 'count', 'calendar_events', 'id', 'calendar', TRUE)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- STEP 13: SEED SYSTEM ACHIEVEMENTS
-- ============================================================================

INSERT INTO achievements (name, slug, description, category, criteria_type, criteria_config, icon, points, rarity, is_system)
VALUES
  -- Goal Achievements
  ('First Goal', 'first-goal', 'Complete your first goal', 'goal', 'goal_achieved', '{"count": 1}', 'flag', 10, 'common', TRUE),
  ('Goal Getter', 'goal-getter-5', 'Complete 5 goals', 'goal', 'goal_achieved', '{"count": 5}', 'target', 50, 'uncommon', TRUE),
  ('Goal Master', 'goal-master-25', 'Complete 25 goals', 'goal', 'goal_achieved', '{"count": 25}', 'award', 250, 'rare', TRUE),
  ('Overachiever', 'overachiever', 'Exceed a goal by 25%', 'goal', 'goal_exceeded', '{"percentage": 25}', 'trending-up', 100, 'uncommon', TRUE),
  ('Crushing It', 'crushing-it', 'Exceed a goal by 50%', 'goal', 'goal_exceeded', '{"percentage": 50}', 'zap', 200, 'rare', TRUE),

  -- Streak Achievements
  ('Hot Streak', 'streak-7', 'Complete goals 7 days in a row', 'streak', 'streak_days', '{"days": 7}', 'flame', 70, 'uncommon', TRUE),
  ('On Fire', 'streak-30', 'Complete goals 30 days in a row', 'streak', 'streak_days', '{"days": 30}', 'fire-extinguisher', 300, 'rare', TRUE),
  ('Unstoppable', 'streak-90', 'Complete goals 90 days in a row', 'streak', 'streak_days', '{"days": 90}', 'rocket', 900, 'epic', TRUE),

  -- Leaderboard Achievements
  ('Top Producer', 'top-producer', 'Reach #1 on any leaderboard', 'competition', 'leaderboard_position', '{"position": 1}', 'crown', 500, 'epic', TRUE),
  ('Podium Finish', 'podium', 'Reach top 3 on any leaderboard', 'competition', 'leaderboard_position', '{"position": 3}', 'medal', 200, 'rare', TRUE),

  -- Milestone Achievements
  ('Million Dollar Producer', 'million-gwp', 'Write $1M in premium', 'milestone', 'cumulative_value', '{"metric": "gwp", "value": 1000000}', 'dollar-sign', 1000, 'legendary', TRUE),
  ('Century Club', 'century-policies', 'Write 100 policies', 'milestone', 'cumulative_value', '{"metric": "policies-written", "value": 100}', 'star', 500, 'epic', TRUE)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- STEP 14: HELPER FUNCTIONS
-- ============================================================================

-- Calculate goal progress
CREATE OR REPLACE FUNCTION calculate_goal_progress(p_goal_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_goal RECORD;
  v_goal_type RECORD;
  v_current_value NUMERIC;
  v_progress_pct NUMERIC;
  v_result JSONB;
BEGIN
  -- Get goal details
  SELECT * INTO v_goal FROM goals WHERE id = p_goal_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Goal not found');
  END IF;

  -- Get goal type for calculation method
  SELECT * INTO v_goal_type FROM goal_types WHERE id = v_goal.goal_type_id;

  -- Calculate current value based on goal type
  -- This is a placeholder - actual implementation would query source tables
  -- For now, return cached value
  v_current_value := COALESCE(v_goal.current_value, 0);

  -- Calculate percentage
  IF v_goal.target_value > 0 THEN
    v_progress_pct := ROUND((v_current_value / v_goal.target_value) * 100, 2);
  ELSE
    v_progress_pct := 0;
  END IF;

  -- Update cached values
  UPDATE goals
  SET
    current_value = v_current_value,
    progress_percentage = v_progress_pct,
    last_calculated_at = NOW(),
    status = CASE
      WHEN v_progress_pct >= 100 AND status = 'active' THEN 'achieved'
      WHEN v_goal.end_date < CURRENT_DATE AND v_progress_pct < 100 THEN 'failed'
      ELSE status
    END,
    achieved_at = CASE
      WHEN v_progress_pct >= 100 AND achieved_at IS NULL THEN NOW()
      ELSE achieved_at
    END
  WHERE id = p_goal_id;

  RETURN jsonb_build_object(
    'goal_id', p_goal_id,
    'current_value', v_current_value,
    'target_value', v_goal.target_value,
    'progress_percentage', v_progress_pct,
    'status', v_goal.status
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Refresh leaderboard rankings
CREATE OR REPLACE FUNCTION refresh_leaderboard(p_leaderboard_id UUID)
RETURNS VOID AS $$
DECLARE
  v_lb RECORD;
BEGIN
  SELECT * INTO v_lb FROM leaderboards WHERE id = p_leaderboard_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Delete old entries
  DELETE FROM leaderboard_entries WHERE leaderboard_id = p_leaderboard_id;

  -- This is a placeholder - actual implementation would query based on goal_type
  -- and calculate rankings

  -- Update leaderboard timestamp
  UPDATE leaderboards SET updated_at = NOW() WHERE id = p_leaderboard_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check and award achievements
CREATE OR REPLACE FUNCTION check_user_achievements(p_user_id UUID, p_agency_workspace_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_achievement RECORD;
  v_earned_count INTEGER;
  v_new_achievements JSONB := '[]'::JSONB;
BEGIN
  -- Check each active achievement
  FOR v_achievement IN
    SELECT * FROM achievements WHERE is_active = TRUE AND is_system = TRUE
  LOOP
    -- Skip if already earned
    IF EXISTS (
      SELECT 1 FROM user_achievements
      WHERE user_id = p_user_id AND achievement_id = v_achievement.id
    ) THEN
      CONTINUE;
    END IF;

    -- Check criteria (placeholder - actual implementation would check specific criteria)
    -- For now, just check goal_achieved type
    IF v_achievement.criteria_type = 'goal_achieved' THEN
      SELECT COUNT(*) INTO v_earned_count
      FROM goals
      WHERE assigned_to = p_user_id
        AND status = 'achieved'
        AND agency_workspace_id = p_agency_workspace_id;

      IF v_earned_count >= (v_achievement.criteria_config->>'count')::INTEGER THEN
        -- Award achievement
        INSERT INTO user_achievements (user_id, achievement_id, agency_workspace_id)
        VALUES (p_user_id, v_achievement.id, p_agency_workspace_id);

        v_new_achievements := v_new_achievements || jsonb_build_object(
          'achievement_id', v_achievement.id,
          'name', v_achievement.name,
          'points', v_achievement.points
        );
      END IF;
    END IF;
  END LOOP;

  RETURN v_new_achievements;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 15: VIEWS
-- ============================================================================

-- Producer dashboard view
CREATE OR REPLACE VIEW v_producer_goal_summary AS
SELECT
  g.assigned_to AS user_id,
  g.agency_workspace_id,
  COUNT(*) FILTER (WHERE g.status = 'active') AS active_goals,
  COUNT(*) FILTER (WHERE g.status = 'achieved') AS achieved_goals,
  COUNT(*) FILTER (WHERE g.status = 'failed') AS failed_goals,
  ROUND(AVG(g.progress_percentage) FILTER (WHERE g.status = 'active'), 2) AS avg_progress,
  SUM(g.current_value) FILTER (WHERE gt.metric_type = 'currency') AS total_revenue_progress,
  COUNT(DISTINCT ua.achievement_id) AS total_achievements,
  COALESCE(SUM(a.points), 0) AS total_points
FROM goals g
LEFT JOIN goal_types gt ON g.goal_type_id = gt.id
LEFT JOIN user_achievements ua ON ua.user_id = g.assigned_to AND ua.agency_workspace_id = g.agency_workspace_id
LEFT JOIN achievements a ON ua.achievement_id = a.id
WHERE g.assigned_to IS NOT NULL
GROUP BY g.assigned_to, g.agency_workspace_id;

-- Agency goal summary view
CREATE OR REPLACE VIEW v_agency_goal_summary AS
SELECT
  g.agency_workspace_id,
  COUNT(*) AS total_goals,
  COUNT(*) FILTER (WHERE g.status = 'active') AS active_goals,
  COUNT(*) FILTER (WHERE g.status = 'achieved') AS achieved_goals,
  ROUND(
    COUNT(*) FILTER (WHERE g.status = 'achieved')::NUMERIC /
    NULLIF(COUNT(*) FILTER (WHERE g.status IN ('achieved', 'failed')), 0) * 100,
    2
  ) AS achievement_rate,
  ROUND(AVG(g.progress_percentage) FILTER (WHERE g.status = 'active'), 2) AS avg_progress
FROM goals g
GROUP BY g.agency_workspace_id;

-- ============================================================================
-- STEP 16: TRIGGERS
-- ============================================================================

-- Update timestamps
DROP TRIGGER IF EXISTS goals_updated_at ON goals;
CREATE TRIGGER goals_updated_at
  BEFORE UPDATE ON goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS leaderboards_updated_at ON leaderboards;
CREATE TRIGGER leaderboards_updated_at
  BEFORE UPDATE ON leaderboards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SUMMARY
-- ============================================================================

DO $$
DECLARE
  v_goal_types INTEGER;
  v_achievements INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_goal_types FROM goal_types WHERE is_system = TRUE;
  SELECT COUNT(*) INTO v_achievements FROM achievements WHERE is_system = TRUE;

  RAISE NOTICE '=========================================';
  RAISE NOTICE 'Phase 3: Goal Management Complete';
  RAISE NOTICE '=========================================';
  RAISE NOTICE 'Tables created: goals, goal_types, goal_milestones,';
  RAISE NOTICE '  goal_progress, achievements, user_achievements,';
  RAISE NOTICE '  leaderboards, leaderboard_entries, goal_templates';
  RAISE NOTICE 'System goal types: %', v_goal_types;
  RAISE NOTICE 'System achievements: %', v_achievements;
  RAISE NOTICE '=========================================';
END $$;
