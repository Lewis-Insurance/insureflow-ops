-- Create task_checklist_items table for sub-tasks
CREATE TABLE IF NOT EXISTS public.task_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  item_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_task_checklist_items_task_id ON public.task_checklist_items(task_id);
CREATE INDEX IF NOT EXISTS idx_task_checklist_items_order ON public.task_checklist_items(task_id, item_order);

-- Enable RLS
ALTER TABLE public.task_checklist_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for task_checklist_items
CREATE POLICY "Users can view checklist items for tasks they can view"
  ON public.task_checklist_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.account_memberships m ON m.account_id = t.account_id
      WHERE t.id = task_checklist_items.task_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create checklist items for tasks they can edit"
  ON public.task_checklist_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.account_memberships m ON m.account_id = t.account_id
      WHERE t.id = task_checklist_items.task_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'staff')
    )
  );

CREATE POLICY "Users can update checklist items for tasks they can edit"
  ON public.task_checklist_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.account_memberships m ON m.account_id = t.account_id
      WHERE t.id = task_checklist_items.task_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'staff')
    )
  );

CREATE POLICY "Users can delete checklist items for tasks they can edit"
  ON public.task_checklist_items
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.account_memberships m ON m.account_id = t.account_id
      WHERE t.id = task_checklist_items.task_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'staff')
    )
  );

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_task_checklist_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER task_checklist_items_updated_at
  BEFORE UPDATE ON public.task_checklist_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_task_checklist_items_updated_at();