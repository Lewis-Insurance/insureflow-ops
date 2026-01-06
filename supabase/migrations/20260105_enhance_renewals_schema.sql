-- Enhance renewals table for comprehensive renewal management
-- Adds status workflow, outcome tracking, and supporting tables

-- ============================================================================
-- STEP 1: Update status constraint to include more workflow states
-- ============================================================================
ALTER TABLE public.renewals DROP CONSTRAINT IF EXISTS renewals_status_check;
ALTER TABLE public.renewals ADD CONSTRAINT renewals_status_check
  CHECK (status IN ('pending', 'contacted', 'quoted', 'renewed', 'lost', 'cancelled', 'moved', 'non_renewed',
                    -- Legacy values for backward compatibility
                    'upcoming', 'in_progress', 'completed'));

-- ============================================================================
-- STEP 2: Add outcome tracking columns to renewals table
-- ============================================================================
ALTER TABLE public.renewals ADD COLUMN IF NOT EXISTS lost_reason TEXT;
ALTER TABLE public.renewals ADD COLUMN IF NOT EXISTS moved_carrier TEXT;
ALTER TABLE public.renewals ADD COLUMN IF NOT EXISTS moved_term TEXT CHECK (moved_term IN ('6_month', 'annual', NULL));
ALTER TABLE public.renewals ADD COLUMN IF NOT EXISTS moved_premium DECIMAL(12,2);
ALTER TABLE public.renewals ADD COLUMN IF NOT EXISTS non_renewal_reason TEXT;
ALTER TABLE public.renewals ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;

-- ============================================================================
-- STEP 3: Add completion tracking columns
-- ============================================================================
ALTER TABLE public.renewals ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.renewals ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES auth.users(id);

-- ============================================================================
-- STEP 4: Add expiration_date if not exists (for UI convenience)
-- ============================================================================
ALTER TABLE public.renewals ADD COLUMN IF NOT EXISTS expiration_date DATE;

-- Update expiration_date from renewal_date where null
UPDATE public.renewals SET expiration_date = renewal_date WHERE expiration_date IS NULL AND renewal_date IS NOT NULL;

-- ============================================================================
-- STEP 5: Create renewal_status_history for audit trail
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.renewal_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  renewal_id UUID NOT NULL REFERENCES public.renewals(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID NOT NULL REFERENCES auth.users(id),
  reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_renewal_status_history_renewal_id
  ON public.renewal_status_history(renewal_id);
CREATE INDEX IF NOT EXISTS idx_renewal_status_history_created_at
  ON public.renewal_status_history(created_at DESC);

ALTER TABLE public.renewal_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view status history for their renewals"
  ON public.renewal_status_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.renewals r
      JOIN public.accounts a ON a.id = r.account_id
      JOIN public.agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE r.id = renewal_status_history.renewal_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
    )
  );

CREATE POLICY "Staff can insert status history"
  ON public.renewal_status_history FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.renewals r
      JOIN public.accounts a ON a.id = r.account_id
      JOIN public.agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE r.id = renewal_status_history.renewal_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
    )
  );

-- ============================================================================
-- STEP 6: Create renewal_notes table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.renewal_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  renewal_id UUID NOT NULL REFERENCES public.renewals(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_renewal_notes_renewal_id
  ON public.renewal_notes(renewal_id);
CREATE INDEX IF NOT EXISTS idx_renewal_notes_created_at
  ON public.renewal_notes(created_at DESC);

ALTER TABLE public.renewal_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view notes for their renewals"
  ON public.renewal_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.renewals r
      JOIN public.accounts a ON a.id = r.account_id
      JOIN public.agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE r.id = renewal_notes.renewal_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
    )
  );

CREATE POLICY "Staff can insert notes"
  ON public.renewal_notes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.renewals r
      JOIN public.accounts a ON a.id = r.account_id
      JOIN public.agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE r.id = renewal_notes.renewal_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
    )
  );

CREATE POLICY "Users can update their own notes"
  ON public.renewal_notes FOR UPDATE
  USING (created_by = auth.uid());

CREATE POLICY "Users can delete their own notes"
  ON public.renewal_notes FOR DELETE
  USING (created_by = auth.uid());

-- Trigger to update updated_at
CREATE TRIGGER renewal_notes_updated_at
  BEFORE UPDATE ON public.renewal_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_renewals_updated_at();

-- ============================================================================
-- STEP 7: Create renewal_contact_log table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.renewal_contact_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  renewal_id UUID NOT NULL REFERENCES public.renewals(id) ON DELETE CASCADE,
  contact_type TEXT NOT NULL CHECK (contact_type IN ('call', 'email', 'sms', 'meeting', 'other')),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  outcome TEXT,
  notes TEXT,
  duration_minutes INTEGER,
  contacted_by UUID NOT NULL REFERENCES auth.users(id),
  contacted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_renewal_contact_log_renewal_id
  ON public.renewal_contact_log(renewal_id);
CREATE INDEX IF NOT EXISTS idx_renewal_contact_log_contacted_at
  ON public.renewal_contact_log(contacted_at DESC);

ALTER TABLE public.renewal_contact_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view contact log for their renewals"
  ON public.renewal_contact_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.renewals r
      JOIN public.accounts a ON a.id = r.account_id
      JOIN public.agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE r.id = renewal_contact_log.renewal_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
    )
  );

CREATE POLICY "Staff can insert contact log entries"
  ON public.renewal_contact_log FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.renewals r
      JOIN public.accounts a ON a.id = r.account_id
      JOIN public.agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE r.id = renewal_contact_log.renewal_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
    )
  );

CREATE POLICY "Users can update their own contact log entries"
  ON public.renewal_contact_log FOR UPDATE
  USING (contacted_by = auth.uid());

CREATE POLICY "Users can delete their own contact log entries"
  ON public.renewal_contact_log FOR DELETE
  USING (contacted_by = auth.uid());

-- ============================================================================
-- STEP 8: Create renewal_quotes table for competitive quotes
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.renewal_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  renewal_id UUID NOT NULL REFERENCES public.renewals(id) ON DELETE CASCADE,
  carrier TEXT NOT NULL,
  premium DECIMAL(12,2) NOT NULL,
  term_months INTEGER DEFAULT 12,
  coverage_summary TEXT,
  quote_date DATE,
  expiration_date DATE,
  document_url TEXT,
  is_selected BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'presented', 'accepted', 'declined', 'expired')),
  notes TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_renewal_quotes_renewal_id
  ON public.renewal_quotes(renewal_id);
CREATE INDEX IF NOT EXISTS idx_renewal_quotes_carrier
  ON public.renewal_quotes(carrier);
CREATE INDEX IF NOT EXISTS idx_renewal_quotes_is_selected
  ON public.renewal_quotes(is_selected) WHERE is_selected = TRUE;

ALTER TABLE public.renewal_quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view quotes for their renewals"
  ON public.renewal_quotes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.renewals r
      JOIN public.accounts a ON a.id = r.account_id
      JOIN public.agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE r.id = renewal_quotes.renewal_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
    )
  );

CREATE POLICY "Staff can insert quotes"
  ON public.renewal_quotes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.renewals r
      JOIN public.accounts a ON a.id = r.account_id
      JOIN public.agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE r.id = renewal_quotes.renewal_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
    )
  );

CREATE POLICY "Staff can update quotes"
  ON public.renewal_quotes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.renewals r
      JOIN public.accounts a ON a.id = r.account_id
      JOIN public.agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE r.id = renewal_quotes.renewal_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
    )
  );

CREATE POLICY "Staff can delete quotes"
  ON public.renewal_quotes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.renewals r
      JOIN public.accounts a ON a.id = r.account_id
      JOIN public.agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE r.id = renewal_quotes.renewal_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
    )
  );

-- Trigger to update updated_at
CREATE TRIGGER renewal_quotes_updated_at
  BEFORE UPDATE ON public.renewal_quotes
  FOR EACH ROW
  EXECUTE FUNCTION update_renewals_updated_at();

-- ============================================================================
-- STEP 9: Create renewal_documents table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.renewal_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  renewal_id UUID NOT NULL REFERENCES public.renewals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  document_type TEXT CHECK (document_type IN ('dec_page', 'quote', 'application', 'endorsement', 'correspondence', 'policy', 'claim', 'other')),
  description TEXT,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_renewal_documents_renewal_id
  ON public.renewal_documents(renewal_id);
CREATE INDEX IF NOT EXISTS idx_renewal_documents_document_type
  ON public.renewal_documents(document_type);

ALTER TABLE public.renewal_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view documents for their renewals"
  ON public.renewal_documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.renewals r
      JOIN public.accounts a ON a.id = r.account_id
      JOIN public.agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE r.id = renewal_documents.renewal_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
    )
  );

CREATE POLICY "Staff can insert documents"
  ON public.renewal_documents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.renewals r
      JOIN public.accounts a ON a.id = r.account_id
      JOIN public.agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE r.id = renewal_documents.renewal_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
    )
  );

CREATE POLICY "Staff can delete documents"
  ON public.renewal_documents FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.renewals r
      JOIN public.accounts a ON a.id = r.account_id
      JOIN public.agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE r.id = renewal_documents.renewal_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
    )
  );

-- ============================================================================
-- STEP 10: Create function to log status changes automatically
-- ============================================================================
CREATE OR REPLACE FUNCTION log_renewal_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.renewal_status_history (
      renewal_id,
      old_status,
      new_status,
      changed_by,
      reason,
      metadata
    ) VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      COALESCE(auth.uid(), NEW.completed_by, NEW.created_by),
      CASE
        WHEN NEW.status = 'lost' THEN NEW.lost_reason
        WHEN NEW.status = 'cancelled' THEN NEW.cancelled_reason
        WHEN NEW.status = 'non_renewed' THEN NEW.non_renewal_reason
        WHEN NEW.status = 'moved' THEN 'Moved to ' || COALESCE(NEW.moved_carrier, 'unknown carrier')
        ELSE NULL
      END,
      CASE
        WHEN NEW.status = 'moved' THEN jsonb_build_object(
          'carrier', NEW.moved_carrier,
          'term', NEW.moved_term,
          'premium', NEW.moved_premium
        )
        ELSE '{}'::jsonb
      END
    );

    -- Update completed_at when status becomes terminal
    IF NEW.status IN ('renewed', 'lost', 'cancelled', 'moved', 'non_renewed', 'completed')
       AND NEW.completed_at IS NULL THEN
      NEW.completed_at = NOW();
      NEW.completed_by = COALESCE(auth.uid(), NEW.completed_by);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists and create new one
DROP TRIGGER IF EXISTS renewal_status_change_trigger ON public.renewals;
CREATE TRIGGER renewal_status_change_trigger
  BEFORE UPDATE ON public.renewals
  FOR EACH ROW
  EXECUTE FUNCTION log_renewal_status_change();

-- ============================================================================
-- STEP 11: Create function to update contact stats on renewal
-- ============================================================================
CREATE OR REPLACE FUNCTION update_renewal_contact_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.renewals
  SET
    contact_count = (
      SELECT COUNT(*) FROM public.renewal_contact_log
      WHERE renewal_id = NEW.renewal_id
    ),
    last_contact_date = (
      SELECT MAX(contacted_at) FROM public.renewal_contact_log
      WHERE renewal_id = NEW.renewal_id
    ),
    days_since_last_contact = EXTRACT(DAY FROM NOW() - (
      SELECT MAX(contacted_at) FROM public.renewal_contact_log
      WHERE renewal_id = NEW.renewal_id
    ))
  WHERE id = NEW.renewal_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS renewal_contact_log_stats_trigger ON public.renewal_contact_log;
CREATE TRIGGER renewal_contact_log_stats_trigger
  AFTER INSERT ON public.renewal_contact_log
  FOR EACH ROW
  EXECUTE FUNCTION update_renewal_contact_stats();

-- ============================================================================
-- STEP 12: Add comments for documentation
-- ============================================================================
COMMENT ON TABLE public.renewal_status_history IS 'Audit trail of renewal status changes';
COMMENT ON TABLE public.renewal_notes IS 'Internal team notes on renewals';
COMMENT ON TABLE public.renewal_contact_log IS 'Log of all contact attempts with customers for renewals';
COMMENT ON TABLE public.renewal_quotes IS 'Competitive quotes from different carriers for renewal comparison';
COMMENT ON TABLE public.renewal_documents IS 'Documents associated with renewals (dec pages, quotes, applications)';

COMMENT ON COLUMN public.renewals.lost_reason IS 'Reason for losing renewal (price, coverage, service, competitor, other)';
COMMENT ON COLUMN public.renewals.moved_carrier IS 'Carrier the policy was moved to when status=moved';
COMMENT ON COLUMN public.renewals.moved_term IS 'Term of the moved policy (6_month or annual)';
COMMENT ON COLUMN public.renewals.moved_premium IS 'Premium at the new carrier when policy was moved';
