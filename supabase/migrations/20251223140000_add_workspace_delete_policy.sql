-- ============================================================================
-- Add missing DELETE policy for workspaces table
-- ============================================================================
-- The workspaces table has RLS enabled but was missing a DELETE policy,
-- causing all delete operations to silently fail (return 0 rows).
-- ============================================================================

-- Add DELETE policy for workspace owners
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
    AND tablename='workspaces' 
    AND policyname='workspaces_owner_delete'
  ) THEN
    CREATE POLICY "workspaces_owner_delete" ON public.workspaces
      FOR DELETE USING (created_by = auth.uid());
  END IF;
END $$;

-- Also ensure workspace_documents has a DELETE policy (cascade may not work without it)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
    AND tablename='workspace_documents' 
    AND policyname='workspace_documents_owner_delete'
  ) THEN
    CREATE POLICY "workspace_documents_owner_delete" ON public.workspace_documents
      FOR DELETE USING (
        EXISTS (
          SELECT 1 FROM public.workspaces w
          WHERE w.id = workspace_documents.workspace_id 
          AND w.created_by = auth.uid()
        )
      );
  END IF;
END $$;

-- Ensure jobs table has a DELETE policy (in case user wants to delete individual jobs)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
    AND tablename='jobs' 
    AND policyname='jobs_owner_delete'
  ) THEN
    CREATE POLICY "jobs_owner_delete" ON public.jobs
      FOR DELETE USING (created_by = auth.uid());
  END IF;
END $$;

-- ============================================================================
-- DONE
-- ============================================================================

