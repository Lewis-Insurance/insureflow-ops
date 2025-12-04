-- Migration: Add Quote Follow-Up System
-- Description: Automated follow-up rules and tracking for quotes
-- Date: 2024-12-03
-- Author: Claude CEO Co-Pilot

-- =============================================================================
-- PART 1: Create quote_followup_rules table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.quote_followup_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID,
  name TEXT NOT NULL,
  description TEXT,

  -- Trigger conditions
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'quote_created',
    'quote_sent',
    'quote_viewed',
    'quote_expired',
    'quote_not_responded',
    'quote_score_threshold',
    'days_since_activity'
  )),

  -- Filters
  min_quote_score INTEGER,
  max_quote_score INTEGER,
  line_of_business TEXT[],
  carrier_names TEXT[],

  -- Timing
  delay_hours INTEGER NOT NULL DEFAULT 24,
  max_follow_ups INTEGER DEFAULT 3,
  follow_up_interval_hours INTEGER DEFAULT 72, -- 3 days

  -- Action configuration
  action_type TEXT NOT NULL CHECK (action_type IN ('create_task', 'send_email', 'send_sms', 'create_notification', 'all')),
  task_template_id UUID REFERENCES public.task_templates(id),
  email_template_id TEXT, -- Future: reference to email templates table
  sms_template_text TEXT,

  -- Assignment
  assign_to_role TEXT, -- 'quote_owner', 'account_owner', 'manager', specific role
  assign_to_user_id UUID REFERENCES auth.users(id),

  -- Priority
  task_priority TEXT CHECK (task_priority IN ('low', 'medium', 'high', 'urgent')),

  -- State
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

COMMENT ON TABLE public.quote_followup_rules IS 'Configuration rules for automatic quote follow-ups';
COMMENT ON COLUMN public.quote_followup_rules.trigger_type IS 'Event that triggers the follow-up';
COMMENT ON COLUMN public.quote_followup_rules.delay_hours IS 'Hours to wait before first follow-up';
COMMENT ON COLUMN public.quote_followup_rules.max_follow_ups IS 'Maximum number of follow-up attempts';
COMMENT ON COLUMN public.quote_followup_rules.follow_up_interval_hours IS 'Hours between follow-up attempts';

-- =============================================================================
-- PART 2: Create quote_followups table (tracking)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.quote_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES public.quote_followup_rules(id),

  -- Scheduling
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  executed_at TIMESTAMP WITH TIME ZONE,
  next_follow_up_at TIMESTAMP WITH TIME ZONE,

  -- Status
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN (
    'scheduled',
    'pending',
    'sent',
    'completed',
    'cancelled',
    'failed'
  )),

  -- Actions taken
  task_created_id UUID REFERENCES public.tasks(id),
  email_sent_at TIMESTAMP WITH TIME ZONE,
  sms_sent_at TIMESTAMP WITH TIME ZONE,
  notification_created_id UUID REFERENCES public.notifications(id),

  -- Tracking
  follow_up_number INTEGER DEFAULT 1,
  response_received BOOLEAN DEFAULT false,
  response_received_at TIMESTAMP WITH TIME ZONE,
  response_type TEXT, -- 'accepted', 'rejected', 'requested_changes', 'no_response'

  -- Results
  outcome TEXT, -- 'quote_accepted', 'quote_rejected', 'follow_up_scheduled', 'no_response', 'max_attempts_reached'
  outcome_notes TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

COMMENT ON TABLE public.quote_followups IS 'Tracks individual follow-up attempts for quotes';
COMMENT ON COLUMN public.quote_followups.follow_up_number IS 'Sequence number of this follow-up (1, 2, 3...)';
COMMENT ON COLUMN public.quote_followups.response_received IS 'Whether customer responded to this follow-up';

-- =============================================================================
-- PART 3: Create quote_followup_history table (audit log)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.quote_followup_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  followup_id UUID NOT NULL REFERENCES public.quote_followups(id) ON DELETE CASCADE,
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,

  -- Event details
  event_type TEXT NOT NULL CHECK (event_type IN (
    'created',
    'scheduled',
    'sent',
    'failed',
    'response_received',
    'completed',
    'cancelled'
  )),
  event_data JSONB,

  -- Context
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.quote_followup_history IS 'Audit log for all follow-up events';

-- =============================================================================
-- PART 4: Create indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_quote_followup_rules_active ON public.quote_followup_rules(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_quote_followup_rules_trigger ON public.quote_followup_rules(trigger_type) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_quote_followups_quote_id ON public.quote_followups(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_followups_status ON public.quote_followups(status);
CREATE INDEX IF NOT EXISTS idx_quote_followups_scheduled ON public.quote_followups(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_quote_followups_pending ON public.quote_followups(status, scheduled_at) WHERE status IN ('scheduled', 'pending');
CREATE INDEX IF NOT EXISTS idx_quote_followups_rule_id ON public.quote_followups(rule_id);

CREATE INDEX IF NOT EXISTS idx_quote_followup_history_followup ON public.quote_followup_history(followup_id);
CREATE INDEX IF NOT EXISTS idx_quote_followup_history_quote ON public.quote_followup_history(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_followup_history_created ON public.quote_followup_history(created_at DESC);

-- =============================================================================
-- PART 5: Row Level Security
-- =============================================================================

ALTER TABLE public.quote_followup_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_followup_history ENABLE ROW LEVEL SECURITY;

-- RLS for quote_followup_rules
CREATE POLICY "Users can view follow-up rules in their org"
  ON public.quote_followup_rules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'staff')
    )
  );

CREATE POLICY "Staff can manage follow-up rules"
  ON public.quote_followup_rules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'staff')
    )
  );

-- RLS for quote_followups
CREATE POLICY "Users can view follow-ups for quotes they can access"
  ON public.quote_followups FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.quotes q
      JOIN public.account_memberships m ON m.account_id = q.account_id
      WHERE q.id = quote_followups.quote_id
      AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can manage follow-ups"
  ON public.quote_followups FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.quotes q
      JOIN public.account_memberships m ON m.account_id = q.account_id
      WHERE q.id = quote_followups.quote_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'staff')
    )
  );

-- RLS for quote_followup_history
CREATE POLICY "Users can view follow-up history for accessible quotes"
  ON public.quote_followup_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.quotes q
      JOIN public.account_memberships m ON m.account_id = q.account_id
      WHERE q.id = quote_followup_history.quote_id
      AND m.user_id = auth.uid()
    )
  );

-- =============================================================================
-- PART 6: Triggers for updated_at
-- =============================================================================

CREATE TRIGGER update_quote_followup_rules_updated_at
  BEFORE UPDATE ON public.quote_followup_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_quote_followups_updated_at
  BEFORE UPDATE ON public.quote_followups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- PART 7: Default follow-up rules (seed data)
-- =============================================================================

INSERT INTO public.quote_followup_rules (
  name,
  description,
  trigger_type,
  delay_hours,
  max_follow_ups,
  follow_up_interval_hours,
  action_type,
  task_priority,
  is_active
) VALUES
  (
    'Standard Quote Follow-Up',
    'Follow up on quotes 24 hours after creation if no response',
    'days_since_activity',
    24,
    3,
    72,
    'create_task',
    'medium',
    true
  ),
  (
    'High-Value Quote Escalation',
    'Immediate follow-up for quotes scoring 85+ points',
    'quote_score_threshold',
    2,
    5,
    48,
    'all',
    'high',
    true
  ),
  (
    'Expiring Quote Reminder',
    'Reminder 3 days before quote expiration',
    'quote_expired',
    -72, -- 3 days before expiration
    2,
    24,
    'send_email',
    'urgent',
    true
  );

-- =============================================================================
-- PART 8: Grant permissions
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_followup_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_followups TO authenticated;
GRANT SELECT, INSERT ON public.quote_followup_history TO authenticated;

-- =============================================================================
-- Migration Complete
-- =============================================================================

-- Summary of changes:
-- 1. Created quote_followup_rules table for configuration
-- 2. Created quote_followups table for tracking
-- 3. Created quote_followup_history table for audit log
-- 4. Added indexes for query performance
-- 5. Implemented Row Level Security policies
-- 6. Added triggers for updated_at columns
-- 7. Seeded 3 default follow-up rules
-- 8. All changes are additive and backward compatible
