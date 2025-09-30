-- Create task category enum if not exists
DO $$ BEGIN
  CREATE TYPE task_category AS ENUM ('quote', 'policy', 'claim', 'renewal', 'service', 'general');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add missing columns to existing tasks table
ALTER TABLE public.tasks 
  ADD COLUMN IF NOT EXISTS policy_id UUID REFERENCES public.policies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category task_category DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS dependencies JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Create task_comments table if not exists
CREATE TABLE IF NOT EXISTS public.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comment_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create task_attachments table if not exists
CREATE TABLE IF NOT EXISTS public.task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  attached_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  attached_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_tasks_policy_id ON public.tasks(policy_id);
CREATE INDEX IF NOT EXISTS idx_tasks_quote_id ON public.tasks(quote_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON public.tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_category ON public.tasks(category);
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON public.task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_user_id ON public.task_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id ON public.task_attachments(task_id);

-- Enable RLS
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DO $$ BEGIN
  CREATE POLICY "Users can view comments for tasks they can access"
    ON public.task_comments FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.tasks t JOIN public.account_memberships m ON m.account_id = t.account_id WHERE t.id = task_comments.task_id AND m.user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can create comments for tasks they can access"
    ON public.task_comments FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM public.tasks t JOIN public.account_memberships m ON m.account_id = t.account_id WHERE t.id = task_comments.task_id AND m.user_id = auth.uid() AND m.role IN ('owner', 'staff')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can view attachments for tasks they can access"
    ON public.task_attachments FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.tasks t JOIN public.account_memberships m ON m.account_id = t.account_id WHERE t.id = task_attachments.task_id AND m.user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can create attachments for tasks they can access"
    ON public.task_attachments FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM public.tasks t JOIN public.account_memberships m ON m.account_id = t.account_id WHERE t.id = task_attachments.task_id AND m.user_id = auth.uid() AND m.role IN ('owner', 'staff')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete their own attachments"
    ON public.task_attachments FOR DELETE
    USING (attached_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;