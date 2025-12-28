-- ============================================================================
-- MOBILE APP & PUSH NOTIFICATIONS MIGRATION
-- ============================================================================
-- Phase 4: Mobile App Foundation
--
-- This migration creates:
-- 1. Device registration table for push tokens
-- 2. Push notification queue
-- 3. Notification preferences per user
-- 4. Notification history for offline sync
-- 5. Mobile session tracking
-- ============================================================================

-- ============================================================================
-- STEP 1: DEVICE REGISTRATIONS
-- ============================================================================
-- Store push tokens for each device a user has registered

CREATE TABLE IF NOT EXISTS device_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User who owns this device
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Agency context (for multi-tenant notifications)
  agency_workspace_id UUID REFERENCES agency_workspaces(id) ON DELETE CASCADE,

  -- Device identification
  device_id TEXT NOT NULL, -- Unique device identifier
  device_name TEXT, -- "iPhone 15 Pro", "Samsung Galaxy S24"
  device_type TEXT NOT NULL CHECK (device_type IN ('ios', 'android', 'web')),
  os_version TEXT, -- "iOS 17.2", "Android 14"
  app_version TEXT, -- "1.0.0"

  -- Push token
  push_token TEXT NOT NULL,
  push_provider TEXT NOT NULL DEFAULT 'expo' CHECK (push_provider IN ('expo', 'apns', 'fcm', 'web')),

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: one token per device per user
  UNIQUE(user_id, device_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_device_reg_user ON device_registrations(user_id);
CREATE INDEX IF NOT EXISTS idx_device_reg_agency ON device_registrations(agency_workspace_id);
CREATE INDEX IF NOT EXISTS idx_device_reg_token ON device_registrations(push_token);
CREATE INDEX IF NOT EXISTS idx_device_reg_active ON device_registrations(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- STEP 2: NOTIFICATION PREFERENCES
-- ============================================================================
-- Per-user notification preferences (which notifications they want to receive)

CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agency_workspace_id UUID REFERENCES agency_workspaces(id) ON DELETE CASCADE,

  -- Notification categories
  tasks_enabled BOOLEAN DEFAULT TRUE,
  leads_enabled BOOLEAN DEFAULT TRUE,
  policies_enabled BOOLEAN DEFAULT TRUE,
  renewals_enabled BOOLEAN DEFAULT TRUE,
  documents_enabled BOOLEAN DEFAULT TRUE,
  messages_enabled BOOLEAN DEFAULT TRUE,
  goals_enabled BOOLEAN DEFAULT TRUE,
  system_enabled BOOLEAN DEFAULT TRUE,

  -- Delivery preferences
  push_enabled BOOLEAN DEFAULT TRUE,
  email_enabled BOOLEAN DEFAULT TRUE,
  sms_enabled BOOLEAN DEFAULT FALSE,

  -- Quiet hours (don't send push during these times)
  quiet_hours_enabled BOOLEAN DEFAULT FALSE,
  quiet_hours_start TIME, -- e.g., "22:00:00"
  quiet_hours_end TIME, -- e.g., "07:00:00"
  timezone TEXT DEFAULT 'America/New_York',

  -- Batching preferences
  batch_notifications BOOLEAN DEFAULT FALSE,
  batch_interval_minutes INTEGER DEFAULT 30,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, agency_workspace_id)
);

-- ============================================================================
-- STEP 3: PUSH NOTIFICATION QUEUE
-- ============================================================================
-- Queue for outgoing push notifications (processed by edge function)

CREATE TABLE IF NOT EXISTS push_notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Target
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_registration_id UUID REFERENCES device_registrations(id) ON DELETE CASCADE,

  -- Content
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB DEFAULT '{}', -- Custom payload for app

  -- Categorization
  category TEXT NOT NULL CHECK (category IN (
    'task', 'lead', 'policy', 'renewal', 'document',
    'message', 'goal', 'achievement', 'system', 'reminder'
  )),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

  -- Optional: Link to source record
  source_type TEXT, -- 'task', 'lead', 'policy', etc.
  source_id UUID,

  -- Agency context
  agency_workspace_id UUID REFERENCES agency_workspaces(id) ON DELETE CASCADE,

  -- Processing status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_attempt_at TIMESTAMPTZ,
  error_message TEXT,

  -- Scheduling
  scheduled_for TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),

  -- Delivery tracking
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for queue processing
CREATE INDEX IF NOT EXISTS idx_push_queue_pending ON push_notification_queue(status, scheduled_for)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_push_queue_user ON push_notification_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_push_queue_agency ON push_notification_queue(agency_workspace_id);
CREATE INDEX IF NOT EXISTS idx_push_queue_source ON push_notification_queue(source_type, source_id);

-- ============================================================================
-- STEP 4: NOTIFICATION HISTORY (for in-app notification center)
-- ============================================================================
-- Permanent record of all notifications (for in-app display and offline sync)

CREATE TABLE IF NOT EXISTS notification_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Target
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agency_workspace_id UUID REFERENCES agency_workspaces(id) ON DELETE CASCADE,

  -- Content
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  icon TEXT, -- Icon name or URL
  image_url TEXT, -- Optional image
  action_url TEXT, -- Deep link when tapped
  data JSONB DEFAULT '{}',

  -- Categorization
  category TEXT NOT NULL,
  priority TEXT DEFAULT 'normal',

  -- Source record link
  source_type TEXT,
  source_id UUID,

  -- State
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  is_archived BOOLEAN DEFAULT FALSE,
  archived_at TIMESTAMPTZ,

  -- Sync tracking (for offline)
  sync_version BIGINT DEFAULT 1,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notif_history_user ON notification_history(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_history_agency ON notification_history(agency_workspace_id);
CREATE INDEX IF NOT EXISTS idx_notif_history_unread ON notification_history(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notif_history_sync ON notification_history(user_id, sync_version);
CREATE INDEX IF NOT EXISTS idx_notif_history_created ON notification_history(user_id, created_at DESC);

-- ============================================================================
-- STEP 5: MOBILE SESSIONS (for analytics and sync)
-- ============================================================================

CREATE TABLE IF NOT EXISTS mobile_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_registration_id UUID REFERENCES device_registrations(id) ON DELETE SET NULL,

  -- Session info
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  last_active_at TIMESTAMPTZ DEFAULT NOW(),

  -- App state
  app_version TEXT,
  app_state TEXT DEFAULT 'active' CHECK (app_state IN ('active', 'background', 'inactive')),

  -- Network
  connection_type TEXT, -- 'wifi', 'cellular', 'offline'

  -- Analytics
  screens_visited TEXT[] DEFAULT '{}',
  actions_count INTEGER DEFAULT 0,

  -- Sync tracking
  last_sync_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'idle' CHECK (sync_status IN ('idle', 'syncing', 'error'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mobile_sessions_user ON mobile_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_mobile_sessions_active ON mobile_sessions(user_id, ended_at) WHERE ended_at IS NULL;

-- ============================================================================
-- STEP 6: OFFLINE SYNC QUEUE (for offline-first)
-- ============================================================================
-- Queue of changes made while offline, to be synced when back online

CREATE TABLE IF NOT EXISTS offline_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,

  -- Operation
  operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
  table_name TEXT NOT NULL,
  record_id UUID,

  -- Payload
  payload JSONB NOT NULL,

  -- Conflict resolution
  client_timestamp TIMESTAMPTZ NOT NULL,
  server_timestamp TIMESTAMPTZ,
  conflict_resolved BOOLEAN DEFAULT FALSE,
  resolution_strategy TEXT CHECK (resolution_strategy IN ('client_wins', 'server_wins', 'merge', 'manual')),

  -- Processing
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'synced', 'conflict', 'failed')),
  error_message TEXT,
  attempts INTEGER DEFAULT 0,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  synced_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_offline_queue_pending ON offline_sync_queue(user_id, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_offline_queue_device ON offline_sync_queue(user_id, device_id);

-- ============================================================================
-- STEP 7: RLS POLICIES
-- ============================================================================

ALTER TABLE device_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobile_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_sync_queue ENABLE ROW LEVEL SECURITY;

-- Device registrations: Users can only access their own devices
DROP POLICY IF EXISTS "device_reg_select" ON device_registrations;
CREATE POLICY "device_reg_select" ON device_registrations
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "device_reg_insert" ON device_registrations;
CREATE POLICY "device_reg_insert" ON device_registrations
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "device_reg_update" ON device_registrations;
CREATE POLICY "device_reg_update" ON device_registrations
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "device_reg_delete" ON device_registrations;
CREATE POLICY "device_reg_delete" ON device_registrations
  FOR DELETE USING (user_id = auth.uid());

-- Notification preferences: Users can only access their own preferences
DROP POLICY IF EXISTS "notif_prefs_select" ON notification_preferences;
CREATE POLICY "notif_prefs_select" ON notification_preferences
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notif_prefs_insert" ON notification_preferences;
CREATE POLICY "notif_prefs_insert" ON notification_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notif_prefs_update" ON notification_preferences;
CREATE POLICY "notif_prefs_update" ON notification_preferences
  FOR UPDATE USING (user_id = auth.uid());

-- Push queue: Users can view their own queued notifications
DROP POLICY IF EXISTS "push_queue_select" ON push_notification_queue;
CREATE POLICY "push_queue_select" ON push_notification_queue
  FOR SELECT USING (user_id = auth.uid());

-- Notification history: Users can access their own notifications
DROP POLICY IF EXISTS "notif_history_select" ON notification_history;
CREATE POLICY "notif_history_select" ON notification_history
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notif_history_update" ON notification_history;
CREATE POLICY "notif_history_update" ON notification_history
  FOR UPDATE USING (user_id = auth.uid());

-- Mobile sessions: Users can access their own sessions
DROP POLICY IF EXISTS "mobile_sessions_select" ON mobile_sessions;
CREATE POLICY "mobile_sessions_select" ON mobile_sessions
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "mobile_sessions_insert" ON mobile_sessions;
CREATE POLICY "mobile_sessions_insert" ON mobile_sessions
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "mobile_sessions_update" ON mobile_sessions;
CREATE POLICY "mobile_sessions_update" ON mobile_sessions
  FOR UPDATE USING (user_id = auth.uid());

-- Offline sync queue: Users can only access their own queue
DROP POLICY IF EXISTS "offline_queue_select" ON offline_sync_queue;
CREATE POLICY "offline_queue_select" ON offline_sync_queue
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "offline_queue_insert" ON offline_sync_queue;
CREATE POLICY "offline_queue_insert" ON offline_sync_queue
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "offline_queue_update" ON offline_sync_queue;
CREATE POLICY "offline_queue_update" ON offline_sync_queue
  FOR UPDATE USING (user_id = auth.uid());

-- ============================================================================
-- STEP 8: HELPER FUNCTIONS
-- ============================================================================

-- Function to queue a push notification
CREATE OR REPLACE FUNCTION queue_push_notification(
  p_user_id UUID,
  p_title TEXT,
  p_body TEXT,
  p_category TEXT,
  p_priority TEXT DEFAULT 'normal',
  p_data JSONB DEFAULT '{}',
  p_source_type TEXT DEFAULT NULL,
  p_source_id UUID DEFAULT NULL,
  p_agency_workspace_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_notification_id UUID;
  v_prefs notification_preferences%ROWTYPE;
BEGIN
  -- Check user preferences
  SELECT * INTO v_prefs
  FROM notification_preferences
  WHERE user_id = p_user_id
    AND (agency_workspace_id = p_agency_workspace_id OR agency_workspace_id IS NULL)
  LIMIT 1;

  -- Check if this category is enabled (if preferences exist)
  IF v_prefs.id IS NOT NULL THEN
    IF NOT v_prefs.push_enabled THEN
      RETURN NULL; -- Push disabled
    END IF;

    -- Check category-specific preference
    CASE p_category
      WHEN 'task' THEN IF NOT v_prefs.tasks_enabled THEN RETURN NULL; END IF;
      WHEN 'lead' THEN IF NOT v_prefs.leads_enabled THEN RETURN NULL; END IF;
      WHEN 'policy' THEN IF NOT v_prefs.policies_enabled THEN RETURN NULL; END IF;
      WHEN 'renewal' THEN IF NOT v_prefs.renewals_enabled THEN RETURN NULL; END IF;
      WHEN 'document' THEN IF NOT v_prefs.documents_enabled THEN RETURN NULL; END IF;
      WHEN 'message' THEN IF NOT v_prefs.messages_enabled THEN RETURN NULL; END IF;
      WHEN 'goal', 'achievement' THEN IF NOT v_prefs.goals_enabled THEN RETURN NULL; END IF;
      WHEN 'system' THEN IF NOT v_prefs.system_enabled THEN RETURN NULL; END IF;
      ELSE NULL; -- Allow unknown categories
    END CASE;
  END IF;

  -- Insert into queue
  INSERT INTO push_notification_queue (
    user_id, title, body, category, priority, data,
    source_type, source_id, agency_workspace_id
  ) VALUES (
    p_user_id, p_title, p_body, p_category, p_priority, p_data,
    p_source_type, p_source_id, p_agency_workspace_id
  ) RETURNING id INTO v_notification_id;

  -- Also insert into history
  INSERT INTO notification_history (
    user_id, title, body, category, priority, data,
    source_type, source_id, agency_workspace_id
  ) VALUES (
    p_user_id, p_title, p_body, p_category, p_priority, p_data,
    p_source_type, p_source_id, p_agency_workspace_id
  );

  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get unread notification count
CREATE OR REPLACE FUNCTION get_unread_notification_count(p_user_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM notification_history
    WHERE user_id = p_user_id
      AND is_read = FALSE
      AND is_archived = FALSE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark notifications as read
CREATE OR REPLACE FUNCTION mark_notifications_read(
  p_user_id UUID,
  p_notification_ids UUID[] DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF p_notification_ids IS NULL THEN
    -- Mark all as read
    UPDATE notification_history
    SET is_read = TRUE, read_at = NOW(), sync_version = sync_version + 1
    WHERE user_id = p_user_id AND is_read = FALSE;
  ELSE
    -- Mark specific ones as read
    UPDATE notification_history
    SET is_read = TRUE, read_at = NOW(), sync_version = sync_version + 1
    WHERE user_id = p_user_id
      AND id = ANY(p_notification_ids)
      AND is_read = FALSE;
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 9: TRIGGERS FOR AUTOMATIC NOTIFICATIONS
-- ============================================================================

-- Trigger function to notify on task assignment
-- Note: Uses assignee_id column (the actual column name in tasks table)
-- Note: tasks table uses account_id, not agency_workspace_id
CREATE OR REPLACE FUNCTION notify_task_assigned()
RETURNS TRIGGER AS $$
DECLARE
  v_agency_id UUID;
BEGIN
  -- Only notify if assignee_id changed and is not null
  IF NEW.assignee_id IS NOT NULL AND
     (OLD IS NULL OR OLD.assignee_id IS DISTINCT FROM NEW.assignee_id) THEN

    -- Try to get agency_workspace_id from account (if account has one)
    IF NEW.account_id IS NOT NULL THEN
      SELECT agency_workspace_id INTO v_agency_id
      FROM accounts
      WHERE id = NEW.account_id;
    END IF;

    PERFORM queue_push_notification(
      NEW.assignee_id,
      'New Task Assigned',
      COALESCE(NEW.title, 'You have been assigned a new task'),
      'task',
      CASE WHEN NEW.priority::TEXT = 'urgent' THEN 'high' ELSE 'normal' END,
      jsonb_build_object('task_id', NEW.id, 'priority', NEW.priority::TEXT),
      'task',
      NEW.id,
      v_agency_id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on tasks table (if it exists and has assignee_id column)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'assignee_id'
  ) THEN
    DROP TRIGGER IF EXISTS trg_notify_task_assigned ON tasks;
    CREATE TRIGGER trg_notify_task_assigned
      AFTER INSERT OR UPDATE OF assignee_id ON tasks
      FOR EACH ROW
      EXECUTE FUNCTION notify_task_assigned();
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Could not create task assignment trigger: %', SQLERRM;
END $$;

-- ============================================================================
-- SUMMARY
-- ============================================================================

DO $$
DECLARE
  v_tables INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_tables
  FROM information_schema.tables
  WHERE table_name IN (
    'device_registrations', 'notification_preferences',
    'push_notification_queue', 'notification_history',
    'mobile_sessions', 'offline_sync_queue'
  );

  RAISE NOTICE '=========================================';
  RAISE NOTICE 'Mobile Push Notifications Migration Complete';
  RAISE NOTICE '=========================================';
  RAISE NOTICE 'Tables created: %', v_tables;
  RAISE NOTICE 'Features:';
  RAISE NOTICE '  - Device registration with push tokens';
  RAISE NOTICE '  - Per-user notification preferences';
  RAISE NOTICE '  - Push notification queue';
  RAISE NOTICE '  - In-app notification history';
  RAISE NOTICE '  - Mobile session tracking';
  RAISE NOTICE '  - Offline sync queue';
  RAISE NOTICE '=========================================';
END $$;
