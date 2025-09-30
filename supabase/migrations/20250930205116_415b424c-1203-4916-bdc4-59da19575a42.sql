-- Task Reminders Table
CREATE TABLE IF NOT EXISTS public.task_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  remind_at TIMESTAMP WITH TIME ZONE NOT NULL,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('email', 'in_app', 'both')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled')),
  sent_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('task_reminder', 'task_assigned', 'task_completed', 'task_overdue', 'task_dependency', 'general')),
  entity_type TEXT,
  entity_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMP WITH TIME ZONE,
  action_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_task_reminders_task_id ON public.task_reminders(task_id);
CREATE INDEX IF NOT EXISTS idx_task_reminders_remind_at ON public.task_reminders(remind_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

-- RLS Policies for task_reminders
ALTER TABLE public.task_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view reminders for tasks they have access to"
ON public.task_reminders FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.account_memberships m ON m.account_id = t.account_id
    WHERE t.id = task_reminders.task_id
    AND m.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create reminders for tasks they have access to"
ON public.task_reminders FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.account_memberships m ON m.account_id = t.account_id
    WHERE t.id = task_reminders.task_id
    AND m.user_id = auth.uid()
    AND m.role IN ('owner', 'staff')
  )
);

CREATE POLICY "Users can update reminders for tasks they have access to"
ON public.task_reminders FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.account_memberships m ON m.account_id = t.account_id
    WHERE t.id = task_reminders.task_id
    AND m.user_id = auth.uid()
    AND m.role IN ('owner', 'staff')
  )
);

CREATE POLICY "Users can delete their own reminders"
ON public.task_reminders FOR DELETE
USING (created_by = auth.uid());

-- RLS Policies for notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
ON public.notifications FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
ON public.notifications FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own notifications"
ON public.notifications FOR DELETE
USING (user_id = auth.uid());

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_task_reminders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_task_reminders_updated_at
BEFORE UPDATE ON public.task_reminders
FOR EACH ROW
EXECUTE FUNCTION public.update_task_reminders_updated_at();

-- Function to generate recurring task instances
CREATE OR REPLACE FUNCTION public.generate_recurring_task_instance(
  p_template_task_id UUID,
  p_due_date TIMESTAMP WITH TIME ZONE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template RECORD;
  v_new_task_id UUID;
BEGIN
  -- Get template task
  SELECT * INTO v_template FROM public.tasks WHERE id = p_template_task_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template task not found';
  END IF;
  
  -- Create new task instance
  INSERT INTO public.tasks (
    account_id,
    title,
    description,
    category,
    priority,
    status,
    due_at,
    assignee_id,
    metadata
  ) VALUES (
    v_template.account_id,
    v_template.title,
    v_template.description,
    v_template.category,
    v_template.priority,
    'pending',
    p_due_date,
    v_template.assignee_id,
    jsonb_build_object(
      'recurring_parent', p_template_task_id,
      'generated_at', now()
    )
  )
  RETURNING id INTO v_new_task_id;
  
  RETURN v_new_task_id;
END;
$$;