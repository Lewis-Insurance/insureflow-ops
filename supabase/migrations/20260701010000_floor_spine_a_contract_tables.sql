-- ============================================================================
-- THE FLOOR — Spine A: work lifecycle contract tables
-- Spec: docs/THE-FLOOR-HANDOFF-ARCHITECTURE.md §4.1–4.2–4.4–4.7
-- Staged only. Do not apply to prod until Brian clears Phase 0 blockers.
-- Separate from Fence client_send_approvals (20260630040000).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- automation_work_requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.automation_work_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  agency_workspace_id UUID NOT NULL REFERENCES public.agency_workspaces(id) ON DELETE CASCADE,

  action TEXT NOT NULL,
  play_id TEXT,
  play_version TEXT,
  source TEXT NOT NULL CHECK (source IN (
    'email', 'slack_forward', 'crm_button', 'voice', 'heartbeat'
  )),
  sender_identity TEXT,
  client_ref UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  resolution_confidence NUMERIC(4, 3) CHECK (
    resolution_confidence IS NULL
    OR (resolution_confidence >= 0 AND resolution_confidence <= 1)
  ),
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decision_package_id UUID,

  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN (
    'received',
    'routed',
    'resolving',
    'needs_identity',
    'executing',
    'awaiting_approval',
    'approved',
    'sent',
    'delivered',
    'failed_delivery',
    'killed',
    'fell_through'
  )),

  idempotency_key TEXT NOT NULL,
  request_body JSONB NOT NULL DEFAULT '{}',

  automation_request_id UUID REFERENCES public.automation_requests(id) ON DELETE SET NULL,
  source_event_id BIGINT,

  CONSTRAINT automation_work_requests_idempotency_unique UNIQUE (action, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_automation_work_requests_workspace
  ON public.automation_work_requests (agency_workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_work_requests_status
  ON public.automation_work_requests (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_work_requests_client
  ON public.automation_work_requests (client_ref)
  WHERE client_ref IS NOT NULL;

-- ---------------------------------------------------------------------------
-- automation_work_request_events (state transition audit)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.automation_work_request_events (
  id BIGSERIAL PRIMARY KEY,
  work_request_id UUID NOT NULL REFERENCES public.automation_work_requests(id) ON DELETE CASCADE,
  from_state TEXT,
  to_state TEXT NOT NULL,
  actor_id UUID REFERENCES auth.users(id),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_work_request_events_request
  ON public.automation_work_request_events (work_request_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- decision_packages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.decision_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_request_id UUID NOT NULL REFERENCES public.automation_work_requests(id) ON DELETE CASCADE,
  play_id TEXT NOT NULL,
  play_version TEXT NOT NULL,
  headline TEXT NOT NULL,
  summary TEXT NOT NULL,
  risk TEXT NOT NULL CHECK (risk IN ('green', 'yellow', 'red')),
  client_ref UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  document_ref JSONB,
  fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  diff JSONB,
  send_spec JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decision_packages_work_request
  ON public.decision_packages (work_request_id, created_at DESC);

ALTER TABLE public.automation_work_requests
  ADD CONSTRAINT automation_work_requests_decision_package_fk
  FOREIGN KEY (decision_package_id) REFERENCES public.decision_packages(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- feedback_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feedback_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_request_id UUID NOT NULL REFERENCES public.automation_work_requests(id) ON DELETE CASCADE,
  play_id TEXT NOT NULL,
  play_version TEXT NOT NULL,
  verb TEXT NOT NULL CHECK (verb IN ('approve', 'edit', 'kill')),
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  field_edits JSONB,
  kill_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_events_work_request
  ON public.feedback_events (work_request_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feedback_events_play
  ON public.feedback_events (play_id, play_version, created_at DESC);

-- ---------------------------------------------------------------------------
-- floor_client_send_approvals (Floor R7 chokepoint; not Fence approvals)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.floor_client_send_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_request_id UUID NOT NULL REFERENCES public.automation_work_requests(id) ON DELETE CASCADE,
  approver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN (
    'approved', 'held', 'sent', 'delivered', 'failed_delivery', 'killed'
  )),
  hold_until TIMESTAMPTZ,
  recipient TEXT NOT NULL,
  recipient_basis TEXT NOT NULL CHECK (recipient_basis IN (
    'account_of_record', 'approved_holder'
  )),
  send_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT floor_one_send_per_work_request UNIQUE (work_request_id)
);

CREATE INDEX IF NOT EXISTS idx_floor_client_send_approvals_status
  ON public.floor_client_send_approvals (status, hold_until);

-- ---------------------------------------------------------------------------
-- RLS: service role + agency staff read; writes via edge functions
-- ---------------------------------------------------------------------------
ALTER TABLE public.automation_work_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_work_request_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.floor_client_send_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY automation_work_requests_staff_read ON public.automation_work_requests
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.agency_workspace_memberships m
      WHERE m.agency_workspace_id = automation_work_requests.agency_workspace_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

CREATE POLICY automation_work_request_events_staff_read ON public.automation_work_request_events
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.automation_work_requests wr
      JOIN public.agency_workspace_memberships m
        ON m.agency_workspace_id = wr.agency_workspace_id
      WHERE wr.id = automation_work_request_events.work_request_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

CREATE POLICY decision_packages_staff_read ON public.decision_packages
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.automation_work_requests wr
      JOIN public.agency_workspace_memberships m
        ON m.agency_workspace_id = wr.agency_workspace_id
      WHERE wr.id = decision_packages.work_request_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

CREATE POLICY feedback_events_staff_read ON public.feedback_events
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.automation_work_requests wr
      JOIN public.agency_workspace_memberships m
        ON m.agency_workspace_id = wr.agency_workspace_id
      WHERE wr.id = feedback_events.work_request_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

CREATE POLICY floor_client_send_approvals_staff_read ON public.floor_client_send_approvals
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR approver_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.automation_work_requests wr
      JOIN public.agency_workspace_memberships m
        ON m.agency_workspace_id = wr.agency_workspace_id
      WHERE wr.id = floor_client_send_approvals.work_request_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

COMMENT ON TABLE public.automation_work_requests IS
  'The Floor work lifecycle unit. Extends automation platform; links to automation_requests optionally.';

COMMENT ON TABLE public.decision_packages IS
  'Typed decision card payload. One source of truth for Slack/Telegram/voice renderers.';

COMMENT ON TABLE public.feedback_events IS
  'Approve/edit/kill audit for compile-from-corrections pipeline (Phase 3).';

COMMENT ON TABLE public.floor_client_send_approvals IS
  'Floor R7 send chokepoint approval rows. UNIQUE(work_request_id) is the send invariant.';
