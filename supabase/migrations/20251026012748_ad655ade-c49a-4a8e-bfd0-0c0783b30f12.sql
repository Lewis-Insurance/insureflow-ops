-- Add related_lead_id column to tasks table
ALTER TABLE public.tasks
ADD COLUMN related_lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_tasks_related_lead_id ON public.tasks(related_lead_id);

-- Update RLS policies to allow access to tasks where user is assigned to the related lead
-- First, create a helper function to check if user has access to a lead
CREATE OR REPLACE FUNCTION public.user_has_lead_access(p_lead_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Check if user is assigned to the lead or is staff
  RETURN EXISTS (
    SELECT 1 
    FROM public.leads l
    WHERE l.id = p_lead_id
    AND (
      l.assigned_to = auth.uid()
      OR EXISTS (
        SELECT 1 
        FROM public.profiles p 
        WHERE p.id = auth.uid() 
        AND (p.is_staff = true OR p.role IN ('agent', 'admin', 'staff', 'producer'))
      )
    )
  );
END;
$$;

-- Drop existing task policies if they exist and recreate with lead support
DROP POLICY IF EXISTS "Users can view tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can create tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can update tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can delete tasks" ON public.tasks;

-- Create new policies that support both account-based and lead-based tasks
CREATE POLICY "Users can view tasks"
ON public.tasks
FOR SELECT
USING (
  -- Staff can see all tasks
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND (is_staff = true OR role IN ('agent', 'admin', 'staff', 'producer'))
  )
  OR
  -- User is assigned to the task
  assignee_id = auth.uid()
  OR
  -- User created the task
  created_by = auth.uid()
  OR
  -- User has access to the related account (if account_id exists)
  (
    account_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.account_memberships
      WHERE account_id = tasks.account_id
      AND user_id = auth.uid()
    )
  )
  OR
  -- User has access to the related lead (if related_lead_id exists)
  (
    related_lead_id IS NOT NULL
    AND public.user_has_lead_access(related_lead_id)
  )
);

CREATE POLICY "Users can create tasks"
ON public.tasks
FOR INSERT
WITH CHECK (
  -- Staff can create tasks
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND (is_staff = true OR role IN ('agent', 'admin', 'staff', 'producer'))
  )
  OR
  -- User can create tasks assigned to themselves
  assignee_id = auth.uid()
  OR
  -- User has access to the related account
  (
    account_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.account_memberships
      WHERE account_id = tasks.account_id
      AND user_id = auth.uid()
    )
  )
  OR
  -- User has access to the related lead
  (
    related_lead_id IS NOT NULL
    AND public.user_has_lead_access(related_lead_id)
  )
);

CREATE POLICY "Users can update tasks"
ON public.tasks
FOR UPDATE
USING (
  -- Staff can update all tasks
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND (is_staff = true OR role IN ('agent', 'admin', 'staff', 'producer'))
  )
  OR
  -- User is assigned to the task
  assignee_id = auth.uid()
  OR
  -- User created the task
  created_by = auth.uid()
  OR
  -- User has access to the related account
  (
    account_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.account_memberships
      WHERE account_id = tasks.account_id
      AND user_id = auth.uid()
    )
  )
  OR
  -- User has access to the related lead
  (
    related_lead_id IS NOT NULL
    AND public.user_has_lead_access(related_lead_id)
  )
);

CREATE POLICY "Users can delete tasks"
ON public.tasks
FOR DELETE
USING (
  -- Staff can delete tasks
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND (is_staff = true OR role IN ('agent', 'admin', 'staff', 'producer'))
  )
  OR
  -- User created the task
  created_by = auth.uid()
);

-- Add comment to document the new column
COMMENT ON COLUMN public.tasks.related_lead_id IS 'Optional reference to a lead that this task is associated with';