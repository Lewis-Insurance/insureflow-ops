-- Add time tracking table
CREATE TABLE IF NOT EXISTS public.task_time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_minutes INTEGER,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add recurring tasks table
CREATE TABLE IF NOT EXISTS public.task_recurrence_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  recurrence_pattern TEXT NOT NULL, -- daily, weekly, monthly, yearly, custom
  recurrence_interval INTEGER NOT NULL DEFAULT 1,
  days_of_week INTEGER[], -- 0=Sunday, 1=Monday, etc.
  day_of_month INTEGER,
  month_of_year INTEGER,
  end_date DATE,
  max_occurrences INTEGER,
  last_generated_at TIMESTAMP WITH TIME ZONE,
  occurrences_count INTEGER DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add task dependencies table
CREATE TABLE IF NOT EXISTS public.task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  depends_on_task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  dependency_type TEXT NOT NULL DEFAULT 'finish_to_start', -- finish_to_start, start_to_start, finish_to_finish, start_to_finish
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(task_id, depends_on_task_id),
  CHECK (task_id != depends_on_task_id)
);

-- Add activity feed table
CREATE TABLE IF NOT EXISTS public.task_activity_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action_type TEXT NOT NULL, -- created, updated, assigned, completed, commented, etc.
  changes JSONB,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_task_time_entries_task_id ON public.task_time_entries(task_id);
CREATE INDEX IF NOT EXISTS idx_task_time_entries_user_id ON public.task_time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_task_recurrence_rules_template ON public.task_recurrence_rules(template_task_id);
CREATE INDEX IF NOT EXISTS idx_task_recurrence_rules_active ON public.task_recurrence_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id ON public.task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on ON public.task_dependencies(depends_on_task_id);
CREATE INDEX IF NOT EXISTS idx_task_activity_feed_task_id ON public.task_activity_feed(task_id);
CREATE INDEX IF NOT EXISTS idx_task_activity_feed_created_at ON public.task_activity_feed(created_at DESC);

-- Enable RLS
ALTER TABLE public.task_time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_recurrence_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_activity_feed ENABLE ROW LEVEL SECURITY;

-- RLS Policies for task_time_entries
CREATE POLICY "Users can view time entries for tasks they can access"
  ON public.task_time_entries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.account_memberships m ON m.account_id = t.account_id
      WHERE t.id = task_time_entries.task_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create their own time entries"
  ON public.task_time_entries FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own time entries"
  ON public.task_time_entries FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own time entries"
  ON public.task_time_entries FOR DELETE
  USING (user_id = auth.uid());

-- RLS Policies for task_recurrence_rules
CREATE POLICY "Users can view recurrence rules for accessible tasks"
  ON public.task_recurrence_rules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.account_memberships m ON m.account_id = t.account_id
      WHERE t.id = task_recurrence_rules.template_task_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can manage recurrence rules"
  ON public.task_recurrence_rules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.account_memberships m ON m.account_id = t.account_id
      WHERE t.id = task_recurrence_rules.template_task_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'staff')
    )
  );

-- RLS Policies for task_dependencies
CREATE POLICY "Users can view dependencies for accessible tasks"
  ON public.task_dependencies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.account_memberships m ON m.account_id = t.account_id
      WHERE t.id = task_dependencies.task_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can manage task dependencies"
  ON public.task_dependencies FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.account_memberships m ON m.account_id = t.account_id
      WHERE t.id = task_dependencies.task_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'staff')
    )
  );

-- RLS Policies for task_activity_feed
CREATE POLICY "Users can view activity for accessible tasks"
  ON public.task_activity_feed FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.account_memberships m ON m.account_id = t.account_id
      WHERE t.id = task_activity_feed.task_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert activity entries"
  ON public.task_activity_feed FOR INSERT
  WITH CHECK (true);

-- Triggers to update updated_at
CREATE TRIGGER task_time_entries_updated_at
  BEFORE UPDATE ON public.task_time_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER task_recurrence_rules_updated_at
  BEFORE UPDATE ON public.task_recurrence_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Function to log task activity
CREATE OR REPLACE FUNCTION public.log_task_activity()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.task_activity_feed (task_id, user_id, action_type, changes)
    VALUES (NEW.id, auth.uid(), 'created', to_jsonb(NEW));
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO public.task_activity_feed (task_id, user_id, action_type, changes)
    VALUES (
      NEW.id, 
      auth.uid(), 
      CASE 
        WHEN OLD.status != NEW.status THEN 'status_changed'
        WHEN OLD.assignee_id != NEW.assignee_id THEN 'assigned'
        ELSE 'updated'
      END,
      jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW))
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add trigger to tasks table for activity logging
CREATE TRIGGER log_task_activity_trigger
  AFTER INSERT OR UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.log_task_activity();