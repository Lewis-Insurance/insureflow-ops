-- ============================================================================
-- LEVITATE RELATIONSHIP MARKETING ENGINE - PHASE 2: AUTOMATION ENGINE
-- ============================================================================
-- This migration creates the automation engine tables for multi-step
-- marketing sequences, triggers, and step executions.
-- ============================================================================

-- ============================================================================
-- 1. AUTOMATION RECIPES - The "workflow" definitions
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.marketing_automation_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,

  -- Identification
  name TEXT NOT NULL,
  description TEXT,

  -- Classification
  category TEXT DEFAULT 'general' CHECK (category IN (
    'welcome', 'renewal', 'birthday', 'holiday', 'cross_sell',
    'retention', 'win_back', 'referral', 'survey', 'review_request',
    'policy_update', 'educational', 'general'
  )),

  -- Trigger configuration
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'manual',           -- Manually enrolled
    'date_based',       -- Birthday, anniversary, etc.
    'policy_event',     -- New policy, renewal due, etc.
    'segment_entry',    -- Contact enters a segment
    'form_submission',  -- Form filled out
    'tag_added',        -- Tag added to contact
    'status_change'     -- Policy/contact status change
  )),
  trigger_config JSONB DEFAULT '{}',
  /*
    Examples:
    date_based: {field: 'birthday', days_before: 7, time_of_day: '09:00'}
    policy_event: {event: 'renewal_due', days_before: 90}
    segment_entry: {segment_id: 'uuid'}
  */

  -- Audience filtering
  audience_filter JSONB,
  /*
    {
      exclude_tags: ['do-not-market'],
      include_lines: ['auto', 'home'],
      states: ['CA', 'TX'],
      min_policies: 1
    }
  */

  -- Sender configuration
  sender_type TEXT DEFAULT 'account_producer' CHECK (sender_type IN (
    'specific_user',     -- Always from specified user
    'account_producer',  -- Account's assigned producer
    'policy_producer',   -- Policy's assigned producer
    'agency_default'     -- Agency default sender
  )),
  sender_user_id UUID REFERENCES public.profiles(id),

  -- Cancellation rules
  cancel_on_reply BOOLEAN DEFAULT TRUE,
  cancel_on_manual_contact BOOLEAN DEFAULT TRUE,
  cancel_on_policy_status TEXT[], -- ['cancelled', 'non_renewed']

  -- Re-enrollment
  allow_re_enrollment BOOLEAN DEFAULT FALSE,
  re_enrollment_cooldown_days INTEGER DEFAULT 365,

  -- Status
  is_active BOOLEAN DEFAULT FALSE, -- Start inactive, activate after testing
  is_archived BOOLEAN DEFAULT FALSE,

  -- Test mode
  test_mode BOOLEAN DEFAULT TRUE, -- Requires explicit activation
  test_contact_ids UUID[], -- Only enroll these contacts in test mode

  -- Stats (denormalized for performance)
  total_enrolled INTEGER DEFAULT 0,
  total_completed INTEGER DEFAULT 0,
  total_cancelled INTEGER DEFAULT 0,

  -- Audit
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_automation_recipes_org ON public.marketing_automation_recipes(org_id);
CREATE INDEX idx_automation_recipes_active ON public.marketing_automation_recipes(org_id, trigger_type)
  WHERE is_active = TRUE AND is_archived = FALSE;

-- RLS
ALTER TABLE public.marketing_automation_recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.marketing_automation_recipes
FOR ALL USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- ============================================================================
-- 2. AUTOMATION STEPS - Individual steps within a recipe
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.marketing_automation_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  recipe_id UUID NOT NULL REFERENCES public.marketing_automation_recipes(id) ON DELETE CASCADE,

  -- Ordering
  step_order INTEGER NOT NULL,

  -- Step type
  step_type TEXT NOT NULL CHECK (step_type IN (
    'email',      -- Send email
    'sms',        -- Send SMS
    'wait',       -- Wait for time period
    'task',       -- Create a task
    'tag',        -- Add/remove tag
    'branch'      -- Conditional branch (future)
  )),

  -- Delay before this step
  delay_type TEXT DEFAULT 'days' CHECK (delay_type IN ('minutes', 'hours', 'days', 'weeks')),
  delay_value INTEGER DEFAULT 0,

  -- Email step config
  email_template_id UUID REFERENCES public.marketing_email_templates(id),
  email_template_version_id UUID REFERENCES public.marketing_email_template_versions(id), -- Pin to version

  -- SMS step config
  sms_template_id UUID REFERENCES public.marketing_sms_templates(id),
  sms_template_version_id UUID REFERENCES public.marketing_sms_template_versions(id),

  -- Task step config
  task_title TEXT,
  task_description TEXT,
  task_due_days INTEGER DEFAULT 3,
  task_priority TEXT DEFAULT 'medium',
  task_assignee_id UUID REFERENCES public.profiles(id), -- NULL = recipe sender

  -- Tag step config
  tag_action TEXT CHECK (tag_action IN ('add', 'remove')),
  tag_name TEXT,

  -- Conditions for this step
  conditions JSONB,
  /*
    {
      skip_if_opened_previous: true,
      skip_if_clicked_previous: true,
      only_if_has_tag: 'vip'
    }
  */

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(recipe_id, step_order)
);

CREATE INDEX idx_automation_steps_recipe ON public.marketing_automation_steps(recipe_id, step_order);

-- RLS
ALTER TABLE public.marketing_automation_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.marketing_automation_steps
FOR ALL USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- ============================================================================
-- 3. AUTOMATION ENROLLMENTS - Contacts currently in automations
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.marketing_automation_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  recipe_id UUID NOT NULL REFERENCES public.marketing_automation_recipes(id) ON DELETE CASCADE,

  -- Who is enrolled
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  policy_id UUID REFERENCES public.policies(id) ON DELETE SET NULL,

  -- Enrollment details
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  enrolled_by UUID REFERENCES public.profiles(id), -- NULL = trigger
  enrolled_sender_id UUID REFERENCES public.profiles(id), -- Resolved at enrollment

  enrollment_source TEXT DEFAULT 'trigger' CHECK (enrollment_source IN (
    'trigger', 'manual', 'import', 'api'
  )),

  -- Progress
  status TEXT DEFAULT 'active' CHECK (status IN (
    'pending',    -- Waiting to start
    'active',     -- In progress
    'paused',     -- Temporarily paused
    'completed',  -- Finished all steps
    'cancelled',  -- Manually or automatically cancelled
    'failed'      -- Permanent failure
  )),

  current_step_order INTEGER DEFAULT 0,
  next_step_at TIMESTAMPTZ,

  -- Completion
  completed_at TIMESTAMPTZ,

  -- Cancellation
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES public.profiles(id),
  cancelled_reason TEXT, -- 'manual', 'reply_received', 'policy_cancelled', 'unsubscribed', etc.

  -- Pause
  paused_at TIMESTAMPTZ,
  paused_by UUID REFERENCES public.profiles(id),
  paused_reason TEXT,

  -- Snapshot of policy status at enrollment (for change detection)
  policy_status_at_enrollment TEXT,

  -- Idempotency for preventing duplicate enrollments
  idempotency_key TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(idempotency_key)
);

CREATE INDEX idx_automation_enrollments_contact ON public.marketing_automation_enrollments(contact_id);
CREATE INDEX idx_automation_enrollments_recipe ON public.marketing_automation_enrollments(recipe_id, status);
CREATE INDEX idx_automation_enrollments_active ON public.marketing_automation_enrollments(org_id, status, next_step_at)
  WHERE status IN ('pending', 'active');
CREATE INDEX idx_automation_enrollments_policy ON public.marketing_automation_enrollments(policy_id)
  WHERE policy_id IS NOT NULL;

-- RLS
ALTER TABLE public.marketing_automation_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.marketing_automation_enrollments
FOR ALL USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- ============================================================================
-- 4. AUTOMATION STEP EXECUTIONS - Individual step execution records
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.marketing_automation_step_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  enrollment_id UUID NOT NULL REFERENCES public.marketing_automation_enrollments(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES public.marketing_automation_steps(id) ON DELETE CASCADE,

  -- Idempotency
  idempotency_key TEXT NOT NULL UNIQUE,

  -- Scheduling
  scheduled_for TIMESTAMPTZ NOT NULL,

  -- Processing state
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending',    -- Waiting to be processed
    'claimed',    -- Processor has claimed it
    'processing', -- Currently executing
    'completed',  -- Successfully completed
    'skipped',    -- Skipped due to conditions
    'failed'      -- Permanent failure
  )),

  -- Processor tracking (for distributed processing)
  processor_id TEXT,
  claimed_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,

  -- Result
  completed_at TIMESTAMPTZ,
  result_type TEXT, -- 'email_sent', 'sms_sent', 'task_created', 'skipped_condition', etc.
  result_data JSONB,

  -- Skip reason
  skipped_reason TEXT, -- 'condition_not_met', 'contact_unsubscribed', 'policy_cancelled', etc.

  -- Retry handling
  error_count INTEGER DEFAULT 0,
  error_message TEXT,

  -- DLQ (Dead Letter Queue)
  in_dlq BOOLEAN DEFAULT FALSE,
  dlq_at TIMESTAMPTZ,

  -- Link to evidence (if message sent)
  communication_evidence_id UUID REFERENCES public.communication_evidence(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_step_executions_pending ON public.marketing_automation_step_executions(scheduled_for, status)
  WHERE status = 'pending';
CREATE INDEX idx_step_executions_claimed ON public.marketing_automation_step_executions(lease_expires_at)
  WHERE status = 'claimed';
CREATE INDEX idx_step_executions_enrollment ON public.marketing_automation_step_executions(enrollment_id);
CREATE INDEX idx_step_executions_dlq ON public.marketing_automation_step_executions(org_id, in_dlq)
  WHERE in_dlq = TRUE;

-- RLS
ALTER TABLE public.marketing_automation_step_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.marketing_automation_step_executions
FOR ALL USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- ============================================================================
-- 5. AUTOMATION DEAD LETTER QUEUE - Failed executions for review
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.marketing_automation_dlq (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  execution_id UUID REFERENCES public.marketing_automation_step_executions(id) ON DELETE SET NULL,
  enrollment_id UUID REFERENCES public.marketing_automation_enrollments(id) ON DELETE SET NULL,
  recipe_id UUID REFERENCES public.marketing_automation_recipes(id) ON DELETE SET NULL,

  -- Error details
  error_message TEXT NOT NULL,
  error_count INTEGER DEFAULT 1,
  error_stack TEXT,

  -- Context snapshot
  context_snapshot JSONB,

  -- Resolution
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id),
  resolution_action TEXT, -- 'retry', 'skip', 'cancel_enrollment', 'ignore'
  resolution_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_automation_dlq_unresolved ON public.marketing_automation_dlq(org_id, created_at)
  WHERE resolved = FALSE;

-- RLS
ALTER TABLE public.marketing_automation_dlq ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.marketing_automation_dlq
FOR ALL USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- ============================================================================
-- 6. AUTOMATION EVENTS - Trigger events from CRM
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.marketing_automation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,

  -- Event details
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL, -- 'contact', 'policy', 'account'
  entity_id UUID NOT NULL,

  -- Event payload
  payload JSONB NOT NULL DEFAULT '{}',

  -- Processing
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  recipes_triggered UUID[],

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_automation_events_unprocessed ON public.marketing_automation_events(org_id, event_type, created_at)
  WHERE processed = FALSE;
CREATE INDEX idx_automation_events_entity ON public.marketing_automation_events(entity_type, entity_id);

-- RLS
ALTER TABLE public.marketing_automation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.marketing_automation_events
FOR ALL USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- ============================================================================
-- 7. FUNCTION: Enroll contact in automation
-- ============================================================================
CREATE OR REPLACE FUNCTION enroll_in_automation(
  p_recipe_id UUID,
  p_contact_id UUID,
  p_account_id UUID DEFAULT NULL,
  p_policy_id UUID DEFAULT NULL,
  p_enrolled_by UUID DEFAULT NULL,
  p_source TEXT DEFAULT 'manual'
) RETURNS UUID AS $$
DECLARE
  v_recipe public.marketing_automation_recipes;
  v_org_id UUID;
  v_enrollment_id UUID;
  v_first_step public.marketing_automation_steps;
  v_sender_id UUID;
  v_scheduled_for TIMESTAMPTZ;
  v_idempotency_key TEXT;
BEGIN
  -- Get recipe
  SELECT * INTO v_recipe FROM public.marketing_automation_recipes WHERE id = p_recipe_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recipe not found';
  END IF;

  v_org_id := v_recipe.org_id;

  -- Check if already enrolled (active)
  IF EXISTS (
    SELECT 1 FROM public.marketing_automation_enrollments
    WHERE recipe_id = p_recipe_id
      AND contact_id = p_contact_id
      AND status IN ('pending', 'active', 'paused')
  ) THEN
    RAISE EXCEPTION 'Contact already enrolled in this automation';
  END IF;

  -- Check re-enrollment cooldown
  IF NOT v_recipe.allow_re_enrollment THEN
    IF EXISTS (
      SELECT 1 FROM public.marketing_automation_enrollments
      WHERE recipe_id = p_recipe_id
        AND contact_id = p_contact_id
        AND completed_at > NOW() - (v_recipe.re_enrollment_cooldown_days || ' days')::INTERVAL
    ) THEN
      RAISE EXCEPTION 'Contact in re-enrollment cooldown period';
    END IF;
  END IF;

  -- Check preferences
  IF EXISTS (
    SELECT 1 FROM public.communication_preferences
    WHERE contact_id = p_contact_id
      AND (do_not_contact = TRUE OR do_not_market = TRUE)
  ) THEN
    RAISE EXCEPTION 'Contact has opted out of marketing';
  END IF;

  -- Resolve sender
  IF v_recipe.sender_type = 'specific_user' THEN
    v_sender_id := v_recipe.sender_user_id;
  ELSIF v_recipe.sender_type = 'account_producer' AND p_account_id IS NOT NULL THEN
    SELECT producer_id INTO v_sender_id FROM public.accounts WHERE id = p_account_id;
  ELSIF v_recipe.sender_type = 'policy_producer' AND p_policy_id IS NOT NULL THEN
    SELECT producer_id INTO v_sender_id FROM public.policies WHERE id = p_policy_id;
  END IF;
  v_sender_id := COALESCE(v_sender_id, v_recipe.sender_user_id);

  -- Generate idempotency key
  v_idempotency_key := 'enroll_' || p_recipe_id || '_' || p_contact_id || '_' || NOW()::DATE;

  -- Create enrollment
  INSERT INTO public.marketing_automation_enrollments (
    org_id,
    recipe_id,
    contact_id,
    account_id,
    policy_id,
    enrolled_by,
    enrolled_sender_id,
    enrollment_source,
    status,
    idempotency_key
  ) VALUES (
    v_org_id,
    p_recipe_id,
    p_contact_id,
    p_account_id,
    p_policy_id,
    p_enrolled_by,
    v_sender_id,
    p_source,
    'active',
    v_idempotency_key
  ) RETURNING id INTO v_enrollment_id;

  -- Get first step
  SELECT * INTO v_first_step
  FROM public.marketing_automation_steps
  WHERE recipe_id = p_recipe_id AND is_active = TRUE
  ORDER BY step_order ASC
  LIMIT 1;

  IF v_first_step IS NOT NULL THEN
    -- Calculate scheduled time
    v_scheduled_for := NOW() +
      CASE v_first_step.delay_type
        WHEN 'minutes' THEN (v_first_step.delay_value || ' minutes')::INTERVAL
        WHEN 'hours' THEN (v_first_step.delay_value || ' hours')::INTERVAL
        WHEN 'days' THEN (v_first_step.delay_value || ' days')::INTERVAL
        WHEN 'weeks' THEN (v_first_step.delay_value || ' weeks')::INTERVAL
        ELSE '0 seconds'::INTERVAL
      END;

    -- Create first step execution
    INSERT INTO public.marketing_automation_step_executions (
      org_id,
      enrollment_id,
      step_id,
      idempotency_key,
      scheduled_for
    ) VALUES (
      v_org_id,
      v_enrollment_id,
      v_first_step.id,
      'auto_' || v_enrollment_id || '_' || v_first_step.id || '_initial',
      v_scheduled_for
    );

    -- Update enrollment with next step info
    UPDATE public.marketing_automation_enrollments
    SET next_step_at = v_scheduled_for,
        current_step_order = v_first_step.step_order
    WHERE id = v_enrollment_id;
  END IF;

  -- Update recipe stats
  UPDATE public.marketing_automation_recipes
  SET total_enrolled = total_enrolled + 1,
      updated_at = NOW()
  WHERE id = p_recipe_id;

  RETURN v_enrollment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 8. FUNCTION: Cancel enrollment
-- ============================================================================
CREATE OR REPLACE FUNCTION cancel_automation_enrollment(
  p_enrollment_id UUID,
  p_cancelled_by UUID DEFAULT NULL,
  p_reason TEXT DEFAULT 'manual'
) RETURNS BOOLEAN AS $$
DECLARE
  v_enrollment public.marketing_automation_enrollments;
BEGIN
  -- Get enrollment
  SELECT * INTO v_enrollment FROM public.marketing_automation_enrollments WHERE id = p_enrollment_id;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_enrollment.status NOT IN ('pending', 'active', 'paused') THEN
    RETURN FALSE; -- Already completed/cancelled
  END IF;

  -- Cancel the enrollment
  UPDATE public.marketing_automation_enrollments
  SET status = 'cancelled',
      cancelled_at = NOW(),
      cancelled_by = p_cancelled_by,
      cancelled_reason = p_reason,
      updated_at = NOW()
  WHERE id = p_enrollment_id;

  -- Cancel pending step executions
  UPDATE public.marketing_automation_step_executions
  SET status = 'skipped',
      skipped_reason = 'enrollment_cancelled',
      updated_at = NOW()
  WHERE enrollment_id = p_enrollment_id AND status = 'pending';

  -- Update recipe stats
  UPDATE public.marketing_automation_recipes
  SET total_cancelled = total_cancelled + 1,
      updated_at = NOW()
  WHERE id = v_enrollment.recipe_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 9. FUNCTION: Reclaim orphaned step executions
-- ============================================================================
CREATE OR REPLACE FUNCTION reclaim_orphaned_step_executions(
  p_lease_ttl_minutes INTEGER DEFAULT 5
) RETURNS INTEGER AS $$
DECLARE
  v_reclaimed INTEGER;
BEGIN
  WITH reclaimed AS (
    UPDATE public.marketing_automation_step_executions
    SET status = 'pending',
        processor_id = NULL,
        claimed_at = NULL,
        lease_expires_at = NULL,
        updated_at = NOW()
    WHERE status = 'claimed'
      AND lease_expires_at < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO v_reclaimed FROM reclaimed;

  RETURN v_reclaimed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE public.marketing_automation_recipes IS 'Levitate: Automation workflow definitions';
COMMENT ON TABLE public.marketing_automation_steps IS 'Levitate: Individual steps within automation recipes';
COMMENT ON TABLE public.marketing_automation_enrollments IS 'Levitate: Contact enrollments in automations';
COMMENT ON TABLE public.marketing_automation_step_executions IS 'Levitate: Individual step execution records';
COMMENT ON TABLE public.marketing_automation_dlq IS 'Levitate: Dead letter queue for failed automation steps';
COMMENT ON TABLE public.marketing_automation_events IS 'Levitate: CRM events that trigger automations';
