-- Add RLS policies for document_analysis table

-- Policy: Users can view analyses they created
CREATE POLICY "Users can view their own document analyses"
  ON public.document_analysis
  FOR SELECT
  USING (created_by = auth.uid());

-- Policy: Users can view analyses for accounts they have access to
CREATE POLICY "Users can view analyses for their accounts"
  ON public.document_analysis
  FOR SELECT
  USING (
    account_id IS NULL OR
    EXISTS (
      SELECT 1 
      FROM public.account_memberships 
      WHERE account_id = document_analysis.account_id 
        AND user_id = auth.uid()
    )
  );

-- Policy: Users can create analyses
CREATE POLICY "Users can create document analyses"
  ON public.document_analysis
  FOR INSERT
  WITH CHECK (created_by = auth.uid());

-- Policy: Users can update their own analyses
CREATE POLICY "Users can update their own document analyses"
  ON public.document_analysis
  FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Policy: System/service role can update any analysis (for edge functions)
CREATE POLICY "Service role can update document analyses"
  ON public.document_analysis
  FOR UPDATE
  USING (true);

-- Policy: Staff can view all analyses
CREATE POLICY "Staff can view all document analyses"
  ON public.document_analysis
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_staff = true
    )
  );

-- Policy: Staff can update all analyses
CREATE POLICY "Staff can update all document analyses"
  ON public.document_analysis
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_staff = true
    )
  );