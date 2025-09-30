-- Add created_by column to tasks table
ALTER TABLE public.tasks ADD COLUMN created_by uuid REFERENCES auth.users(id);

-- Create RLS policies for tasks table
CREATE POLICY "Staff can manage all tasks" 
ON public.tasks 
FOR ALL 
USING (is_staff())
WITH CHECK (is_staff());

CREATE POLICY "Users can view tasks for their accounts"
ON public.tasks
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.account_memberships m
    WHERE m.account_id = tasks.account_id 
    AND m.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create tasks for their accounts"
ON public.tasks
FOR INSERT
WITH CHECK (
  auth.uid() = created_by AND
  EXISTS (
    SELECT 1 FROM public.account_memberships m
    WHERE m.account_id = tasks.account_id 
    AND m.user_id = auth.uid()
    AND m.role = ANY(ARRAY['owner', 'staff'])
  )
);

CREATE POLICY "Users can update tasks they created"
ON public.tasks
FOR UPDATE
USING (
  created_by = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.account_memberships m
    WHERE m.account_id = tasks.account_id 
    AND m.user_id = auth.uid()
    AND m.role = ANY(ARRAY['owner', 'staff'])
  )
)
WITH CHECK (
  created_by = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.account_memberships m
    WHERE m.account_id = tasks.account_id 
    AND m.user_id = auth.uid()
    AND m.role = ANY(ARRAY['owner', 'staff'])
  )
);