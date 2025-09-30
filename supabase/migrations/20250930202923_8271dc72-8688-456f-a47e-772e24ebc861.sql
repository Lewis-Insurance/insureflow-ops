-- Create trigger event enum
DO $$ BEGIN
  CREATE TYPE task_trigger_event AS ENUM (
    'quote_requested',
    'quote_accepted',
    'policy_issued',
    'policy_renewal_due',
    'claim_filed',
    'payment_overdue',
    'service_request',
    'manual'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create task_templates table
CREATE TABLE IF NOT EXISTS public.task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category task_category NOT NULL DEFAULT 'general',
  trigger_event task_trigger_event NOT NULL,
  
  -- Default values for generated tasks
  default_assignee_role TEXT,
  priority task_priority NOT NULL DEFAULT 'medium',
  estimated_duration_hours INTEGER,
  
  -- For sequencing and dependencies
  task_order INTEGER DEFAULT 0,
  dependencies JSONB DEFAULT '[]'::jsonb,
  
  -- Template metadata
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create task_generation_log table to track automatic task creation
CREATE TABLE IF NOT EXISTS public.task_generation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES public.task_templates(id) ON DELETE SET NULL,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  trigger_event task_trigger_event NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_task_templates_trigger_event ON public.task_templates(trigger_event);
CREATE INDEX IF NOT EXISTS idx_task_templates_is_active ON public.task_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_task_generation_log_template_id ON public.task_generation_log(template_id);
CREATE INDEX IF NOT EXISTS idx_task_generation_log_task_id ON public.task_generation_log(task_id);
CREATE INDEX IF NOT EXISTS idx_task_generation_log_entity ON public.task_generation_log(entity_type, entity_id);

-- Enable RLS
ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_generation_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for task_templates
DO $$ BEGIN
  CREATE POLICY "Staff can view all task templates"
    ON public.task_templates FOR SELECT
    USING (is_staff());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can manage task templates"
    ON public.task_templates FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS Policies for task_generation_log
DO $$ BEGIN
  CREATE POLICY "Staff can view task generation logs"
    ON public.task_generation_log FOR SELECT
    USING (is_staff());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "System can insert task generation logs"
    ON public.task_generation_log FOR INSERT
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Update trigger for task_templates
CREATE TRIGGER set_task_templates_updated_at
  BEFORE UPDATE ON public.task_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Function to generate tasks from templates
CREATE OR REPLACE FUNCTION public.generate_tasks_from_templates(
  p_trigger_event task_trigger_event,
  p_account_id UUID,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template RECORD;
  v_task_id UUID;
  v_generated_count INTEGER := 0;
  v_result JSONB := '[]'::jsonb;
  v_due_date TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Loop through active templates for this trigger event
  FOR v_template IN
    SELECT * FROM public.task_templates
    WHERE trigger_event = p_trigger_event
      AND is_active = true
    ORDER BY task_order ASC
  LOOP
    -- Calculate due date based on estimated duration
    v_due_date := NULL;
    IF v_template.estimated_duration_hours IS NOT NULL THEN
      v_due_date := now() + (v_template.estimated_duration_hours || ' hours')::interval;
    END IF;

    -- Create task from template
    INSERT INTO public.tasks (
      account_id,
      title,
      description,
      category,
      priority,
      status,
      due_at,
      metadata
    ) VALUES (
      p_account_id,
      v_template.name,
      v_template.description,
      v_template.category,
      v_template.priority,
      'pending',
      v_due_date,
      jsonb_build_object(
        'template_id', v_template.id,
        'trigger_event', p_trigger_event::text,
        'auto_generated', true
      )
    )
    RETURNING id INTO v_task_id;

    -- Log the task generation
    INSERT INTO public.task_generation_log (
      template_id,
      task_id,
      trigger_event,
      entity_type,
      entity_id,
      metadata
    ) VALUES (
      v_template.id,
      v_task_id,
      p_trigger_event,
      p_entity_type,
      p_entity_id,
      jsonb_build_object('generated_at', now())
    );

    v_generated_count := v_generated_count + 1;
    
    -- Add to result
    v_result := v_result || jsonb_build_object(
      'task_id', v_task_id,
      'template_id', v_template.id,
      'template_name', v_template.name
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'generated_count', v_generated_count,
    'tasks', v_result
  );
END;
$$;