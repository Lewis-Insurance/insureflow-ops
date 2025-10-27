-- ============================================================================
-- AUTOMATION RULES SYSTEM - Complete with Actions
-- ============================================================================

-- Automation Rules Table
CREATE TABLE IF NOT EXISTS public.automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL, -- 'lead_created', 'lead_status_changed', 'policy_created', 'policy_renewed', 'lead_score_changed', etc.
  trigger_conditions JSONB DEFAULT '{}'::jsonb, -- Additional conditions for trigger
  applies_to TEXT NOT NULL, -- 'lead', 'policy', 'account', 'renewal'
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0, -- For ordering rule execution
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Automation Actions Table (supports multiple actions per rule)
CREATE TABLE IF NOT EXISTS public.automation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  action_order INTEGER NOT NULL DEFAULT 0, -- Order of execution
  action_type TEXT NOT NULL, -- 'send_email', 'send_sms', 'assign_to', 'add_tag', 'remove_tag', 'create_task', 'enroll_campaign', 'update_field', 'webhook'
  action_config JSONB NOT NULL DEFAULT '{}'::jsonb, -- Action-specific configuration
  conditions JSONB DEFAULT '{}'::jsonb, -- Optional conditions for this specific action
  delay_minutes INTEGER DEFAULT 0, -- Delay before executing this action
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Automation Execution Log
CREATE TABLE IF NOT EXISTS public.automation_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  action_id UUID REFERENCES public.automation_actions(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL, -- 'lead', 'policy', 'account', 'renewal'
  entity_id UUID NOT NULL,
  trigger_data JSONB, -- Data about what triggered the rule
  action_result JSONB, -- Result of the action execution
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'success', 'failed', 'skipped'
  error_message TEXT,
  executed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_automation_rules_account ON public.automation_rules(account_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_trigger ON public.automation_rules(trigger_type);
CREATE INDEX IF NOT EXISTS idx_automation_rules_active ON public.automation_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_automation_actions_rule ON public.automation_actions(rule_id);
CREATE INDEX IF NOT EXISTS idx_automation_actions_order ON public.automation_actions(rule_id, action_order);
CREATE INDEX IF NOT EXISTS idx_automation_executions_entity ON public.automation_executions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_automation_executions_rule ON public.automation_executions(rule_id);

-- Enable RLS
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_executions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for automation_rules
CREATE POLICY "Users can view rules in their account"
  ON public.automation_rules FOR SELECT
  USING (
    account_id IN (
      SELECT account_id FROM public.account_memberships 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can manage rules"
  ON public.automation_rules FOR ALL
  USING (
    account_id IN (
      SELECT account_id FROM public.account_memberships 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'staff')
    )
  )
  WITH CHECK (
    account_id IN (
      SELECT account_id FROM public.account_memberships 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'staff')
    )
  );

-- RLS Policies for automation_actions
CREATE POLICY "Users can view actions for their rules"
  ON public.automation_actions FOR SELECT
  USING (
    rule_id IN (
      SELECT id FROM public.automation_rules
      WHERE account_id IN (
        SELECT account_id FROM public.account_memberships 
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Staff can manage actions"
  ON public.automation_actions FOR ALL
  USING (
    rule_id IN (
      SELECT id FROM public.automation_rules
      WHERE account_id IN (
        SELECT account_id FROM public.account_memberships 
        WHERE user_id = auth.uid() 
        AND role IN ('owner', 'staff')
      )
    )
  )
  WITH CHECK (
    rule_id IN (
      SELECT id FROM public.automation_rules
      WHERE account_id IN (
        SELECT account_id FROM public.account_memberships 
        WHERE user_id = auth.uid() 
        AND role IN ('owner', 'staff')
      )
    )
  );

-- RLS Policies for automation_executions
CREATE POLICY "Users can view execution logs for their rules"
  ON public.automation_executions FOR SELECT
  USING (
    rule_id IN (
      SELECT id FROM public.automation_rules
      WHERE account_id IN (
        SELECT account_id FROM public.account_memberships 
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "System can insert execution logs"
  ON public.automation_executions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update execution logs"
  ON public.automation_executions FOR UPDATE
  USING (true);

-- Function to execute automation actions for a trigger event
CREATE OR REPLACE FUNCTION public.process_automation_rules(
  p_trigger_type TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_trigger_data JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule RECORD;
  v_action RECORD;
  v_account_id UUID;
  v_executed_count INTEGER := 0;
  v_results JSONB := '[]'::jsonb;
BEGIN
  -- Get account_id from entity
  CASE p_entity_type
    WHEN 'lead' THEN
      SELECT account_id INTO v_account_id FROM public.leads WHERE id = p_entity_id;
    WHEN 'policy' THEN
      SELECT account_id INTO v_account_id FROM public.policies WHERE id = p_entity_id;
    WHEN 'account' THEN
      v_account_id := p_entity_id;
    ELSE
      RAISE EXCEPTION 'Unknown entity type: %', p_entity_type;
  END CASE;

  -- Find matching active rules
  FOR v_rule IN
    SELECT * FROM public.automation_rules
    WHERE trigger_type = p_trigger_type
      AND applies_to = p_entity_type
      AND account_id = v_account_id
      AND is_active = true
    ORDER BY priority DESC, created_at ASC
  LOOP
    -- Get actions for this rule, ordered by action_order
    FOR v_action IN
      SELECT * FROM public.automation_actions
      WHERE rule_id = v_rule.id
        AND is_active = true
      ORDER BY action_order ASC
    LOOP
      -- Log the execution (async processing will handle actual execution)
      INSERT INTO public.automation_executions (
        rule_id,
        action_id,
        entity_type,
        entity_id,
        trigger_data,
        status
      ) VALUES (
        v_rule.id,
        v_action.id,
        p_entity_type,
        p_entity_id,
        p_trigger_data,
        'pending'
      );

      v_executed_count := v_executed_count + 1;
      
      v_results := v_results || jsonb_build_object(
        'rule_id', v_rule.id,
        'rule_name', v_rule.name,
        'action_id', v_action.id,
        'action_type', v_action.action_type,
        'status', 'queued'
      );
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'rules_triggered', v_executed_count,
    'results', v_results
  );
END;
$$;

-- Trigger function to auto-process rules on lead changes
CREATE OR REPLACE FUNCTION public.trigger_automation_on_lead_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trigger_type TEXT;
  v_trigger_data JSONB;
BEGIN
  -- Determine trigger type
  IF TG_OP = 'INSERT' THEN
    v_trigger_type := 'lead_created';
    v_trigger_data := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status != NEW.status THEN
      v_trigger_type := 'lead_status_changed';
      v_trigger_data := jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'lead', to_jsonb(NEW)
      );
    ELSIF OLD.lead_score != NEW.lead_score THEN
      v_trigger_type := 'lead_score_changed';
      v_trigger_data := jsonb_build_object(
        'old_score', OLD.lead_score,
        'new_score', NEW.lead_score,
        'lead', to_jsonb(NEW)
      );
    ELSE
      RETURN NEW; -- No relevant changes
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  -- Process automation rules (async)
  PERFORM public.process_automation_rules(
    v_trigger_type,
    'lead',
    NEW.id,
    v_trigger_data
  );

  RETURN NEW;
END;
$$;

-- Create trigger on leads table
DROP TRIGGER IF EXISTS trigger_automation_rules_on_leads ON public.leads;
CREATE TRIGGER trigger_automation_rules_on_leads
  AFTER INSERT OR UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_automation_on_lead_change();

-- Trigger function for policy changes
CREATE OR REPLACE FUNCTION public.trigger_automation_on_policy_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trigger_type TEXT;
  v_trigger_data JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_trigger_type := 'policy_created';
    v_trigger_data := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.policy_type != NEW.policy_type THEN
      v_trigger_type := 'policy_type_changed';
      v_trigger_data := jsonb_build_object(
        'old_type', OLD.policy_type,
        'new_type', NEW.policy_type,
        'policy', to_jsonb(NEW)
      );
    ELSIF OLD.status != NEW.status THEN
      v_trigger_type := 'policy_status_changed';
      v_trigger_data := jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'policy', to_jsonb(NEW)
      );
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  PERFORM public.process_automation_rules(
    v_trigger_type,
    'policy',
    NEW.id,
    v_trigger_data
  );

  RETURN NEW;
END;
$$;

-- Create trigger on policies table
DROP TRIGGER IF EXISTS trigger_automation_rules_on_policies ON public.policies;
CREATE TRIGGER trigger_automation_rules_on_policies
  AFTER INSERT OR UPDATE ON public.policies
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_automation_on_policy_change();

COMMENT ON TABLE public.automation_rules IS 'Define automated workflows triggered by specific events';
COMMENT ON TABLE public.automation_actions IS 'Actions to execute when automation rules are triggered';
COMMENT ON TABLE public.automation_executions IS 'Log of automation rule executions';
