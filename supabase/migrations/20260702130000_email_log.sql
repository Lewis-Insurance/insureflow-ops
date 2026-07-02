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
  -- Tenant boundary for RLS. NULL when the writer had no workspace context
  -- (such rows are readable by service_role only, never leaked across tenants).
  agency_workspace_id UUID REFERENCES public.agency_workspaces(id) ON DELETE CASCADE,
  resend_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Self-heal if an earlier version of this migration created the table without
-- the tenant column.
ALTER TABLE public.email_log
  ADD COLUMN IF NOT EXISTS agency_workspace_id UUID
  REFERENCES public.agency_workspaces(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_email_log_created ON public.email_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_to ON public.email_log (to_email);
CREATE INDEX IF NOT EXISTS idx_email_log_type ON public.email_log (type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_workspace
  ON public.email_log (agency_workspace_id, created_at DESC);

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

-- Workspace-scoped read: a staff member only sees audit rows for a workspace
-- they are an active member of. Without the agency_workspace_id predicate any
-- active member of ANY workspace could read every tenant's outbound-email rows.
DROP POLICY IF EXISTS email_log_staff_read ON public.email_log;
CREATE POLICY email_log_staff_read ON public.email_log
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR (
      agency_workspace_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.agency_workspace_memberships m
        WHERE m.agency_workspace_id = email_log.agency_workspace_id
          AND m.user_id = auth.uid()
          AND m.status = 'active'
      )
    )
  );

COMMENT ON TABLE public.email_log IS 'Audit log for Floor/CRM outbound emails (Resend message id, recipient, metadata). Reads are workspace-scoped via agency_workspace_id.';
