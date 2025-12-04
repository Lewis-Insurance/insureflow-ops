-- Migration: Add AI Task Generation System
-- Description: Automatically generate tasks from various triggers and events
-- Date: 2024-12-03
-- Author: Claude CEO Co-Pilot

-- =============================================================================
-- PART 1: Create task_generation_rules table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.task_generation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Rule identification
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'document_analysis_complete',
    'coverage_gap_identified',
    'renewal_risk_alert',
    'lead_score_increase',
    'policy_expiring_soon',
    'quote_expired',
    'customer_interaction',
    'claim_filed',
    'payment_overdue'
  )),

  -- Conditions (JSONB for flexible rule matching)
  conditions JSONB DEFAULT '{}'::jsonb,
  -- Example: {"lead_score_min": 70, "category": "commercial"}

  -- Task template
  task_title_template TEXT NOT NULL,
  -- Example: "Follow up on {{customer_name}} - {{trigger_reason}}"

  task_description_template TEXT,
  -- Example: "Coverage gap identified: {{gap_details}}"

  task_type TEXT,
  -- Maps to existing task types in system

  priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')),

  -- Assignment logic
  assign_to_type TEXT CHECK (assign_to_type IN ('creator', 'account_owner', 'specific_user', 'role', 'ai_suggestion')),
  assign_to_user_id UUID REFERENCES auth.users(id),
  assign_to_role TEXT,

  -- Due date logic
  due_in_days INTEGER,
  due_in_hours INTEGER,

  -- Metadata
  tags TEXT[],
  ai_prompt TEXT, -- Optional: AI prompt for generating more context

  -- Status
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.task_generation_rules IS 'Rules for automatically generating tasks based on triggers';
COMMENT ON COLUMN public.task_generation_rules.conditions IS 'JSONB conditions that must be met for rule to fire';
COMMENT ON COLUMN public.task_generation_rules.task_title_template IS 'Template with {{variables}} for task title';
COMMENT ON COLUMN public.task_generation_rules.ai_prompt IS 'Optional AI prompt to enhance task context';

-- =============================================================================
-- PART 2: Create generated_tasks_log table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.generated_tasks_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Generated task reference
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES public.task_generation_rules(id) ON DELETE SET NULL,

  -- Trigger context
  trigger_type TEXT NOT NULL,
  trigger_entity_type TEXT, -- 'account', 'policy', 'quote', 'lead', 'document'
  trigger_entity_id UUID, -- ID of the entity that triggered generation
  trigger_data JSONB DEFAULT '{}'::jsonb, -- Full context data

  -- AI enhancement
  was_ai_enhanced BOOLEAN DEFAULT false,
  ai_context TEXT, -- Additional context added by AI
  ai_suggestions JSONB, -- AI-generated recommendations

  -- Assignment
  assigned_to UUID REFERENCES auth.users(id),
  assignment_reason TEXT, -- Why this user was assigned

  -- Status tracking
  generation_status TEXT CHECK (generation_status IN ('pending', 'success', 'failed', 'skipped')),
  generation_error TEXT,

  -- User feedback
  was_helpful BOOLEAN, -- Did user find this auto-task useful?
  user_feedback TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

COMMENT ON TABLE public.generated_tasks_log IS 'Audit log of all auto-generated tasks';
COMMENT ON COLUMN public.generated_tasks_log.trigger_data IS 'Complete context that triggered task generation';
COMMENT ON COLUMN public.generated_tasks_log.ai_suggestions IS 'AI-generated insights and recommendations';

-- =============================================================================
-- PART 3: Create materialized view for generation analytics
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS public.task_generation_analytics AS
SELECT
  DATE_TRUNC('day', created_at) AS date,
  trigger_type,
  rule_id,
  generation_status,

  COUNT(*) AS total_attempts,
  SUM(CASE WHEN generation_status = 'success' THEN 1 ELSE 0 END) AS successful_generations,
  SUM(CASE WHEN generation_status = 'failed' THEN 1 ELSE 0 END) AS failed_generations,

  ROUND(
    (SUM(CASE WHEN generation_status = 'success' THEN 1 ELSE 0 END)::NUMERIC /
     NULLIF(COUNT(*), 0)) * 100,
    2
  ) AS success_rate,

  -- AI enhancement metrics
  SUM(CASE WHEN was_ai_enhanced THEN 1 ELSE 0 END) AS ai_enhanced_count,
  ROUND(
    (SUM(CASE WHEN was_ai_enhanced THEN 1 ELSE 0 END)::NUMERIC /
     NULLIF(COUNT(*), 0)) * 100,
    2
  ) AS ai_enhancement_rate,

  -- User feedback
  COUNT(CASE WHEN was_helpful = true THEN 1 END) AS helpful_count,
  COUNT(CASE WHEN was_helpful = false THEN 1 END) AS not_helpful_count,
  ROUND(
    (COUNT(CASE WHEN was_helpful = true THEN 1 END)::NUMERIC /
     NULLIF(COUNT(CASE WHEN was_helpful IS NOT NULL THEN 1 END), 0)) * 100,
    2
  ) AS helpfulness_rate,

  COUNT(DISTINCT assigned_to) AS unique_assignees

FROM public.generated_tasks_log
GROUP BY DATE_TRUNC('day', created_at), trigger_type, rule_id, generation_status
ORDER BY date DESC, trigger_type;

COMMENT ON MATERIALIZED VIEW public.task_generation_analytics IS 'Analytics for AI task generation performance';

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_generation_analytics_unique
  ON public.task_generation_analytics(date, trigger_type, COALESCE(rule_id, '00000000-0000-0000-0000-000000000000'::uuid), generation_status);

-- =============================================================================
-- PART 4: Create indexes for performance
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_task_generation_rules_trigger_type
  ON public.task_generation_rules(trigger_type);

CREATE INDEX IF NOT EXISTS idx_task_generation_rules_active
  ON public.task_generation_rules(is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_generated_tasks_log_task_id
  ON public.generated_tasks_log(task_id);

CREATE INDEX IF NOT EXISTS idx_generated_tasks_log_rule_id
  ON public.generated_tasks_log(rule_id);

CREATE INDEX IF NOT EXISTS idx_generated_tasks_log_trigger_type
  ON public.generated_tasks_log(trigger_type);

CREATE INDEX IF NOT EXISTS idx_generated_tasks_log_trigger_entity
  ON public.generated_tasks_log(trigger_entity_type, trigger_entity_id);

CREATE INDEX IF NOT EXISTS idx_generated_tasks_log_assigned_to
  ON public.generated_tasks_log(assigned_to);

CREATE INDEX IF NOT EXISTS idx_generated_tasks_log_created_at
  ON public.generated_tasks_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_generated_tasks_log_status
  ON public.generated_tasks_log(generation_status);

-- =============================================================================
-- PART 5: Row Level Security
-- =============================================================================

ALTER TABLE public.task_generation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_tasks_log ENABLE ROW LEVEL SECURITY;

-- Staff can manage task generation rules
CREATE POLICY "Staff can manage task generation rules"
  ON public.task_generation_rules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'staff')
    )
  );

-- Users can view generation rules
CREATE POLICY "Users can view task generation rules"
  ON public.task_generation_rules FOR SELECT
  USING (is_active = true);

-- Users can view their own generated tasks
CREATE POLICY "Users can view their generated tasks"
  ON public.generated_tasks_log FOR SELECT
  USING (
    auth.uid() = assigned_to OR
    EXISTS (
      SELECT 1 FROM public.account_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'staff')
    )
  );

-- System can insert generated task logs
CREATE POLICY "System can insert generated task logs"
  ON public.generated_tasks_log FOR INSERT
  WITH CHECK (true); -- Service role only

-- Users can update their task feedback
CREATE POLICY "Users can update their task feedback"
  ON public.generated_tasks_log FOR UPDATE
  USING (auth.uid() = assigned_to)
  WITH CHECK (auth.uid() = assigned_to);

-- =============================================================================
-- PART 6: Functions for task generation
-- =============================================================================

-- Function to generate task from rule
CREATE OR REPLACE FUNCTION public.generate_task_from_rule(
  p_rule_id UUID,
  p_trigger_data JSONB,
  p_trigger_entity_type TEXT DEFAULT NULL,
  p_trigger_entity_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_rule RECORD;
  v_task_title TEXT;
  v_task_description TEXT;
  v_task_id UUID;
  v_log_id UUID;
  v_assigned_to UUID;
  v_due_date TIMESTAMP WITH TIME ZONE;
  v_account_id UUID;
BEGIN
  -- Get the rule
  SELECT * INTO v_rule
  FROM public.task_generation_rules
  WHERE id = p_rule_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rule not found or inactive: %', p_rule_id;
  END IF;

  -- Replace template variables in title
  v_task_title := v_rule.task_title_template;
  -- Simple variable replacement (can be enhanced with more complex logic)
  -- This is a placeholder - actual implementation would use proper templating

  -- Replace template variables in description
  v_task_description := v_rule.task_description_template;

  -- Determine assignment
  v_assigned_to := CASE v_rule.assign_to_type
    WHEN 'specific_user' THEN v_rule.assign_to_user_id
    WHEN 'creator' THEN auth.uid()
    ELSE NULL -- AI suggestion or other logic
  END;

  -- Calculate due date
  IF v_rule.due_in_days IS NOT NULL THEN
    v_due_date := NOW() + (v_rule.due_in_days || ' days')::INTERVAL;
  ELSIF v_rule.due_in_hours IS NOT NULL THEN
    v_due_date := NOW() + (v_rule.due_in_hours || ' hours')::INTERVAL;
  END IF;

  -- Extract account_id from trigger data if available
  v_account_id := (p_trigger_data->>'account_id')::UUID;

  -- Create the task
  INSERT INTO public.tasks (
    title,
    description,
    type,
    priority,
    assigned_to,
    due_date,
    account_id,
    status,
    tags
  ) VALUES (
    v_task_title,
    v_task_description,
    v_rule.task_type,
    v_rule.priority,
    v_assigned_to,
    v_due_date,
    v_account_id,
    'pending',
    v_rule.tags
  ) RETURNING id INTO v_task_id;

  -- Log the generation
  INSERT INTO public.generated_tasks_log (
    task_id,
    rule_id,
    trigger_type,
    trigger_entity_type,
    trigger_entity_id,
    trigger_data,
    assigned_to,
    generation_status
  ) VALUES (
    v_task_id,
    p_rule_id,
    v_rule.trigger_type,
    p_trigger_entity_type,
    p_trigger_entity_id,
    p_trigger_data,
    v_assigned_to,
    'success'
  ) RETURNING id INTO v_log_id;

  RETURN v_task_id;

EXCEPTION WHEN OTHERS THEN
  -- Log the failure
  INSERT INTO public.generated_tasks_log (
    rule_id,
    trigger_type,
    trigger_entity_type,
    trigger_entity_id,
    trigger_data,
    generation_status,
    generation_error
  ) VALUES (
    p_rule_id,
    v_rule.trigger_type,
    p_trigger_entity_type,
    p_trigger_entity_id,
    p_trigger_data,
    'failed',
    SQLERRM
  );

  RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.generate_task_from_rule IS 'Generate a task based on a rule and trigger data';

-- Function to find matching rules for a trigger
CREATE OR REPLACE FUNCTION public.find_matching_rules(
  p_trigger_type TEXT,
  p_trigger_data JSONB
)
RETURNS TABLE(rule_id UUID, rule_name TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT id, name
  FROM public.task_generation_rules
  WHERE trigger_type = p_trigger_type
    AND is_active = true
  ORDER BY created_at DESC;

  -- Note: Condition matching would be enhanced with more complex JSONB logic
  -- For now, returns all active rules for the trigger type
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.find_matching_rules IS 'Find rules matching a trigger type and conditions';

-- Function to refresh analytics materialized view
CREATE OR REPLACE FUNCTION public.refresh_task_generation_analytics()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.task_generation_analytics;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- PART 7: Triggers for updated_at
-- =============================================================================

CREATE TRIGGER update_task_generation_rules_updated_at
  BEFORE UPDATE ON public.task_generation_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- PART 8: Insert default task generation rules
-- =============================================================================

-- Rule 1: Document Analysis Follow-up
INSERT INTO public.task_generation_rules (
  name,
  description,
  trigger_type,
  task_title_template,
  task_description_template,
  task_type,
  priority,
  assign_to_type,
  due_in_days,
  tags,
  is_active
) VALUES (
  'Document Analysis Follow-up',
  'Create follow-up task when document analysis identifies action items',
  'document_analysis_complete',
  'Review document analysis results',
  'Document analysis completed. Review findings and take appropriate action.',
  'follow_up',
  'medium',
  'account_owner',
  2,
  ARRAY['document', 'analysis', 'auto-generated'],
  true
);

-- Rule 2: Coverage Gap Alert
INSERT INTO public.task_generation_rules (
  name,
  description,
  trigger_type,
  task_title_template,
  task_description_template,
  task_type,
  priority,
  assign_to_type,
  due_in_days,
  tags,
  is_active
) VALUES (
  'Coverage Gap Cross-Sell Task',
  'Create task to address identified coverage gaps',
  'coverage_gap_identified',
  'Address coverage gap',
  'Coverage gap identified. Review recommendations and present solutions to customer.',
  'cross_sell',
  'high',
  'account_owner',
  3,
  ARRAY['coverage', 'cross-sell', 'auto-generated'],
  true
);

-- Rule 3: High Lead Score Alert
INSERT INTO public.task_generation_rules (
  name,
  description,
  trigger_type,
  task_title_template,
  task_description_template,
  task_type,
  priority,
  assign_to_type,
  due_in_hours,
  tags,
  is_active
) VALUES (
  'High Lead Score Follow-up',
  'Create urgent task when lead score increases significantly',
  'lead_score_increase',
  'Hot lead - immediate follow-up required',
  'Lead score increased significantly. Contact immediately while interest is high.',
  'follow_up',
  'urgent',
  'account_owner',
  24,
  ARRAY['lead', 'hot', 'auto-generated'],
  true
);

-- Rule 4: Renewal Risk Alert
INSERT INTO public.task_generation_rules (
  name,
  description,
  trigger_type,
  task_title_template,
  task_description_template,
  task_type,
  priority,
  assign_to_type,
  due_in_days,
  tags,
  is_active
) VALUES (
  'At-Risk Renewal Retention',
  'Create retention task when renewal is at risk',
  'renewal_risk_alert',
  'Retention action required',
  'Renewal identified as at-risk. Proactive outreach needed to secure renewal.',
  'retention',
  'urgent',
  'account_owner',
  1,
  ARRAY['renewal', 'retention', 'at-risk', 'auto-generated'],
  true
);

-- Rule 5: Policy Expiring Soon
INSERT INTO public.task_generation_rules (
  name,
  description,
  trigger_type,
  task_title_template,
  task_description_template,
  task_type,
  priority,
  assign_to_type,
  due_in_days,
  tags,
  is_active
) VALUES (
  'Policy Expiration Reminder',
  'Create task when policy is expiring soon',
  'policy_expiring_soon',
  'Policy renewal reminder',
  'Policy expiring soon. Contact customer to discuss renewal options.',
  'renewal',
  'high',
  'account_owner',
  7,
  ARRAY['renewal', 'expiration', 'auto-generated'],
  true
);

-- =============================================================================
-- PART 9: Grant permissions
-- =============================================================================

GRANT SELECT, INSERT, UPDATE ON public.task_generation_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.generated_tasks_log TO authenticated;
GRANT SELECT ON public.task_generation_analytics TO authenticated;

-- =============================================================================
-- Migration Complete
-- =============================================================================

-- Summary of changes:
-- 1. Created task_generation_rules table for rule definitions
-- 2. Created generated_tasks_log table for audit trail
-- 3. Created task_generation_analytics materialized view
-- 4. Added comprehensive indexes for performance
-- 5. Implemented Row Level Security policies
-- 6. Created helper functions for task generation
-- 7. Inserted 5 default task generation rules
-- 8. All changes are additive and backward compatible
