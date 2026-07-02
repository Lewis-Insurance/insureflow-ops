-- ============================================================================
-- email_log — Floor Tier-3 send audit trail (dev + prod)
-- Referenced by send-coi-email, send-id-card-email, floor-release-held-sends
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type TEXT NOT NULL,
  to_email TEXT NOT NULL,
  from_email TEXT,
  subject TEXT,
  sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resend_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_email_log_created ON public.email_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_to ON public.email_log (to_email);
CREATE INDEX IF NOT EXISTS idx_email_log_type ON public.email_log (type, created_at DESC);

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_log_staff_read ON public.email_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.agency_workspace_memberships m
      WHERE m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

COMMENT ON TABLE public.email_log IS 'Audit log for Floor/CRM outbound emails (Resend message id, recipient, metadata).';
