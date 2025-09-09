-- Create storage bucket for customer documents
INSERT INTO storage.buckets (id, name, public) 
VALUES ('customer-docs', 'customer-docs', false)
ON CONFLICT (id) DO NOTHING;

-- Notes table
CREATE TABLE IF NOT EXISTS public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Task status enum and tasks table
DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('open','in_progress','done','cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  assignee_id uuid REFERENCES auth.users(id),
  title text NOT NULL,
  description text,
  due_at timestamptz,
  status task_status NOT NULL DEFAULT 'open',
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Documents table (metadata for storage files)
CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id),
  path text NOT NULL,
  filename text NOT NULL,
  content_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Duplicate flags table
CREATE TABLE IF NOT EXISTS public.duplicate_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  flagged_by uuid NOT NULL REFERENCES auth.users(id),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duplicate_flags ENABLE ROW LEVEL SECURITY;

-- RLS Policies for notes
CREATE POLICY "notes_read" ON public.notes FOR SELECT USING (
  is_staff() OR EXISTS (
    SELECT 1 FROM public.account_memberships m
    WHERE m.user_id = auth.uid() AND m.account_id = notes.account_id
  )
);

CREATE POLICY "notes_write" ON public.notes FOR INSERT WITH CHECK (
  is_staff() OR EXISTS (
    SELECT 1 FROM public.account_memberships m
    WHERE m.user_id = auth.uid() AND m.account_id = notes.account_id
  )
);

-- RLS Policies for tasks
CREATE POLICY "tasks_read" ON public.tasks FOR SELECT USING (
  is_staff() OR EXISTS (
    SELECT 1 FROM public.account_memberships m
    WHERE m.user_id = auth.uid() AND m.account_id = tasks.account_id
  )
);

CREATE POLICY "tasks_write" ON public.tasks FOR INSERT WITH CHECK (
  is_staff() OR EXISTS (
    SELECT 1 FROM public.account_memberships m
    WHERE m.user_id = auth.uid() AND m.account_id = tasks.account_id
  )
);

CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE USING (
  is_staff() OR created_by = auth.uid()
);

-- RLS Policies for documents
CREATE POLICY "documents_read" ON public.documents FOR SELECT USING (
  is_staff() OR EXISTS (
    SELECT 1 FROM public.account_memberships m
    WHERE m.user_id = auth.uid() AND m.account_id = documents.account_id
  )
);

CREATE POLICY "documents_write" ON public.documents FOR INSERT WITH CHECK (
  is_staff() OR EXISTS (
    SELECT 1 FROM public.account_memberships m
    WHERE m.user_id = auth.uid() AND m.account_id = documents.account_id
  )
);

-- RLS Policies for duplicate flags
CREATE POLICY "duplicate_flags_read" ON public.duplicate_flags FOR SELECT USING (is_staff());
CREATE POLICY "duplicate_flags_write" ON public.duplicate_flags FOR INSERT WITH CHECK (is_staff());

-- Storage policies for customer documents
CREATE POLICY "Customer docs read access" ON storage.objects
FOR SELECT USING (
  bucket_id = 'customer-docs' AND (
    is_staff() OR EXISTS (
      SELECT 1 FROM public.documents d
      JOIN public.account_memberships m ON m.account_id = d.account_id
      WHERE d.path = name AND m.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Customer docs upload access" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'customer-docs' AND (
    is_staff() OR auth.uid() IS NOT NULL
  )
);