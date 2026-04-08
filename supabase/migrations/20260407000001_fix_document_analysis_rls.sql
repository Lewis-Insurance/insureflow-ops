-- SEC-004 fix: document_analysis RLS hardening
-- Resolves BLA-283 (anon SELECT bypass)
-- Applied via BLA-366

-- 1. PRIMARY FIX: drop the world-readable SELECT policy (no role clause + USING(true))
DROP POLICY IF EXISTS "Users can view document analysis" ON public.document_analysis;

-- 2. SECONDARY FIX: replace account_id IS NULL-leaky policy with authenticated-only version
DROP POLICY IF EXISTS "Users can view analyses for their accounts" ON public.document_analysis;
CREATE POLICY "Users can view analyses for their accounts"
  ON public.document_analysis
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships
      WHERE account_id = document_analysis.account_id
        AND user_id = auth.uid()
    )
  );

-- 3. TIGHTEN: scope service-role update to service_role only
DROP POLICY IF EXISTS "Service role can update document analyses" ON public.document_analysis;
CREATE POLICY "Service role can update document analyses"
  ON public.document_analysis
  FOR UPDATE
  TO service_role
  USING (true);
