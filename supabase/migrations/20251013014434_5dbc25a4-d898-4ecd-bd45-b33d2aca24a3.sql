-- Allow creators to view their own comparison sessions regardless of account membership
CREATE POLICY "comparison_sessions_select_creator"
ON public.comparison_sessions
FOR SELECT
USING (created_by = auth.uid());