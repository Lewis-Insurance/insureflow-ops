-- Fix restrictive SELECT policies preventing creators from viewing their own comparison sessions
DO $$ BEGIN
  PERFORM 1;
EXCEPTION WHEN others THEN
  -- no-op
END $$;

-- Recreate SELECT policies as PERMISSIVE (default) so either condition grants access
DROP POLICY IF EXISTS "Users can view comparison sessions for their accounts" ON public.comparison_sessions;
DROP POLICY IF EXISTS "comparison_sessions_select_creator" ON public.comparison_sessions;

CREATE POLICY "Users can view comparison sessions for their accounts"
ON public.comparison_sessions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.account_memberships m
    WHERE m.account_id = comparison_sessions.account_id
      AND m.user_id = auth.uid()
  )
);

CREATE POLICY "comparison_sessions_select_creator"
ON public.comparison_sessions
FOR SELECT
USING (created_by = auth.uid());