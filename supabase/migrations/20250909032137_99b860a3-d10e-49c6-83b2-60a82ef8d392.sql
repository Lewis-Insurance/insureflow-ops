-- Add RLS Policies for notes
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