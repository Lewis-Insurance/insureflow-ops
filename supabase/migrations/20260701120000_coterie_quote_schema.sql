-- ============================================================================
-- COTERIE COMMERCIAL QUOTE SCHEMA (Phase 1 — MOCK vertical slice)
-- ============================================================================
-- Tables backing the credential-free, mock-only Coterie commercial quoting
-- slice plus the carrier-agnostic human-approval + audit primitives.
--
-- !!! NOT AUTO-APPLIED !!!
-- This migration file is created for review only. Per Phase 1 guardrails it is
-- NOT run automatically against any database and NO `supabase db push` is
-- performed. Apply it manually (Supabase SQL editor or CLI) after review.
--
-- Tenant scoping mirrors the canonical policies RLS pattern:
--   account_id -> accounts.agency_workspace_id -> agency_workspace_memberships
-- (see 20260107100002_fix_policies_rls_policies.sql). Service role retains full
-- access for the edge function. The webhook log is reserved (service-role only).
-- ============================================================================

-- ============================================================================
-- 1. COTERIE_QUOTE_SESSIONS
-- ============================================================================
-- One row per quote attempt (intake snapshot + normalized carrier request).

CREATE TABLE IF NOT EXISTS public.coterie_quote_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  -- Agency-derived from the account at write time (denormalized for fast scoping).
  agency_workspace_id UUID REFERENCES public.agency_workspaces(id) ON DELETE SET NULL,
  intake_json JSONB NOT NULL,
  normalized_request JSONB,
  status TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'quoted', 'declined', 'error', 'referral')),
  -- Idempotency: repeated submissions with the same key reuse the first session.
  idempotency_key TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_coterie_sessions_account
  ON public.coterie_quote_sessions(account_id);
CREATE INDEX IF NOT EXISTS idx_coterie_sessions_workspace
  ON public.coterie_quote_sessions(agency_workspace_id);
CREATE INDEX IF NOT EXISTS idx_coterie_sessions_status
  ON public.coterie_quote_sessions(status);
CREATE INDEX IF NOT EXISTS idx_coterie_sessions_created_by
  ON public.coterie_quote_sessions(created_by);
-- Idempotency uniqueness per account, ignoring soft-deleted rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_coterie_sessions_idempotency
  ON public.coterie_quote_sessions(account_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND deleted_at IS NULL;

-- ============================================================================
-- 2. COTERIE_QUOTES
-- ============================================================================
-- Normalized + raw quote result for a session.

CREATE TABLE IF NOT EXISTS public.coterie_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.coterie_quote_sessions(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  external_id TEXT,
  line_quotes JSONB NOT NULL DEFAULT '[]'::jsonb,
  premium NUMERIC(14, 2),
  monthly_premium NUMERIC(14, 2),
  decision TEXT NOT NULL DEFAULT 'error'
    CHECK (decision IN ('quoted', 'declined', 'error', 'referral')),
  raw_response JSONB,
  carrier TEXT NOT NULL DEFAULT 'Coterie Insurance',
  proposal_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_coterie_quotes_session
  ON public.coterie_quotes(session_id);
CREATE INDEX IF NOT EXISTS idx_coterie_quotes_account
  ON public.coterie_quotes(account_id);
CREATE INDEX IF NOT EXISTS idx_coterie_quotes_decision
  ON public.coterie_quotes(decision);
CREATE INDEX IF NOT EXISTS idx_coterie_quotes_external
  ON public.coterie_quotes(external_id)
  WHERE external_id IS NOT NULL;
-- Concurrency integrity: at most ONE active (non-deleted) quote per session.
-- This is what makes the heal / idempotency-race quote insert in
-- coterie-quote/index.ts safe — a concurrent second writer hits this unique
-- violation (SQLSTATE 23505) and ADOPTS the winner's row instead of creating a
-- duplicate quote (and a duplicate audit trail).
CREATE UNIQUE INDEX IF NOT EXISTS uq_coterie_quotes_session_active
  ON public.coterie_quotes(session_id)
  WHERE deleted_at IS NULL;

-- ============================================================================
-- 3. CARRIER_APPROVAL_GATES
-- ============================================================================
-- Carrier-agnostic, named-human approval gates. No client-facing action (send,
-- proposal, bind, policy change) may proceed without an `approved` gate.

CREATE TABLE IF NOT EXISTS public.carrier_approval_gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('quote', 'proposal', 'bind', 'client_message', 'policy_change')),
  entity_id UUID NOT NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  denial_reason TEXT,
  summary TEXT NOT NULL DEFAULT '',
  risk_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_trail JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Concurrency integrity: exactly ONE approval gate per (entity_type, entity_id)
-- (UNIQUE, in lockstep with uq_coterie_quotes_session_active). A concurrent
-- second writer hits this unique violation (SQLSTATE 23505) and ADOPTS the
-- existing gate instead of creating a duplicate. Doubles as the entity lookup
-- index, so no separate non-unique index is needed.
CREATE UNIQUE INDEX IF NOT EXISTS uq_carrier_gates_entity
  ON public.carrier_approval_gates(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_carrier_gates_account
  ON public.carrier_approval_gates(account_id);
CREATE INDEX IF NOT EXISTS idx_carrier_gates_status
  ON public.carrier_approval_gates(status);
CREATE INDEX IF NOT EXISTS idx_carrier_gates_assigned
  ON public.carrier_approval_gates(assigned_to);

-- ============================================================================
-- 4. CARRIER_AUDIT_EVENTS (append-only)
-- ============================================================================
-- Immutable audit trail. Detail is REDACTED before insert (no PII / secrets).
-- Append-only is enforced via RLS: SELECT + INSERT only, no UPDATE/DELETE policy.

CREATE TABLE IF NOT EXISTS public.carrier_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  actor UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_carrier_audit_account
  ON public.carrier_audit_events(account_id);
CREATE INDEX IF NOT EXISTS idx_carrier_audit_event_type
  ON public.carrier_audit_events(event_type);
CREATE INDEX IF NOT EXISTS idx_carrier_audit_entity
  ON public.carrier_audit_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_carrier_audit_created
  ON public.carrier_audit_events(created_at DESC);

-- ============================================================================
-- 5. COTERIE_WEBHOOK_LOG (reserved — service-role only)
-- ============================================================================
-- Reserved for a future Coterie webhook receiver. Not used in Phase 1.

CREATE TABLE IF NOT EXISTS public.coterie_webhook_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT,
  payload JSONB,
  headers JSONB,
  auth_valid BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coterie_webhook_event_type
  ON public.coterie_webhook_log(event_type);
CREATE INDEX IF NOT EXISTS idx_coterie_webhook_created
  ON public.coterie_webhook_log(created_at DESC);

-- ============================================================================
-- 6. UPDATED_AT TRIGGERS
-- ============================================================================
-- Reuses the project-wide update_updated_at_column() helper.

DROP TRIGGER IF EXISTS coterie_quote_sessions_updated_at ON public.coterie_quote_sessions;
CREATE TRIGGER coterie_quote_sessions_updated_at
  BEFORE UPDATE ON public.coterie_quote_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS carrier_approval_gates_updated_at ON public.carrier_approval_gates;
CREATE TRIGGER carrier_approval_gates_updated_at
  BEFORE UPDATE ON public.carrier_approval_gates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- Separation-of-duties + lifecycle integrity guard (A2/A3).
-- ----------------------------------------------------------------------------
-- RLS `WITH CHECK` can only see the NEW row, so the rules that need OLD (the
-- immutability of requested_by and "a decided gate can't be reverted") live in
-- this BEFORE UPDATE trigger. Same plpgsql style as update_updated_at_column().
--
-- Split (kept consistent with the RLS policy + the edge/frontend mirrors):
--   * ALL callers (incl. service role): a gate that is NOT decided
--     (pending/expired) must not retain approved_by/approved_at. This forces any
--     reset/expiry to clear the approver and blocks forging an approver onto a
--     non-decided gate.
--   * NON service role (staff) only: requested_by is immutable, and a decided
--     gate (approved/denied) may not be reverted to 'pending'. Only the service
--     role may reset a decided gate (and it must clear the approver fields, per
--     the invariant above).
CREATE OR REPLACE FUNCTION public.enforce_carrier_approval_gate_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Invariant for every caller: no stale/forged approver on a non-decided gate.
  IF NEW.status IN ('pending', 'expired')
     AND (NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL) THEN
    RAISE EXCEPTION
      'carrier_approval_gates: a % gate must not retain approved_by/approved_at', NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- The service role (edge function / admin resets) may reset or override a
  -- decided gate; it is exempt from the staff-only separation-of-duties guards.
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- requested_by is immutable for staff: a mutable requester would let an
  -- approver rewrite it to dodge the distinct-approver (SoD) check.
  IF NEW.requested_by IS DISTINCT FROM OLD.requested_by THEN
    RAISE EXCEPTION 'carrier_approval_gates: requested_by is immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  -- A decided gate is terminal for staff: it cannot be reopened to 'pending'
  -- (which would invite a fresh, possibly self-, approval). Only the service
  -- role may reset it.
  IF OLD.status IN ('approved', 'denied') AND NEW.status = 'pending' THEN
    RAISE EXCEPTION 'carrier_approval_gates: a decided gate cannot be reverted to pending'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS carrier_approval_gates_sod_guard ON public.carrier_approval_gates;
CREATE TRIGGER carrier_approval_gates_sod_guard
  BEFORE UPDATE ON public.carrier_approval_gates
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_carrier_approval_gate_transition();

-- ============================================================================
-- 7. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.coterie_quote_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coterie_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carrier_approval_gates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carrier_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coterie_webhook_log ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- coterie_quote_sessions
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff can view coterie sessions in their workspace" ON public.coterie_quote_sessions;
CREATE POLICY "Staff can view coterie sessions in their workspace"
  ON public.coterie_quote_sessions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      JOIN public.agency_workspace_memberships awm
        ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE a.id = coterie_quote_sessions.account_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Staff can insert coterie sessions in their workspace" ON public.coterie_quote_sessions;
CREATE POLICY "Staff can insert coterie sessions in their workspace"
  ON public.coterie_quote_sessions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.accounts a
      JOIN public.agency_workspace_memberships awm
        ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE a.id = coterie_quote_sessions.account_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
        AND awm.role IN ('owner', 'admin', 'producer', 'csr')
    )
  );

DROP POLICY IF EXISTS "Service role manages coterie sessions" ON public.coterie_quote_sessions;
CREATE POLICY "Service role manages coterie sessions"
  ON public.coterie_quote_sessions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ----------------------------------------------------------------------------
-- coterie_quotes
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff can view coterie quotes in their workspace" ON public.coterie_quotes;
CREATE POLICY "Staff can view coterie quotes in their workspace"
  ON public.coterie_quotes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      JOIN public.agency_workspace_memberships awm
        ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE a.id = coterie_quotes.account_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Staff can insert coterie quotes in their workspace" ON public.coterie_quotes;
CREATE POLICY "Staff can insert coterie quotes in their workspace"
  ON public.coterie_quotes
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.accounts a
      JOIN public.agency_workspace_memberships awm
        ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE a.id = coterie_quotes.account_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
        AND awm.role IN ('owner', 'admin', 'producer', 'csr')
    )
  );

DROP POLICY IF EXISTS "Service role manages coterie quotes" ON public.coterie_quotes;
CREATE POLICY "Service role manages coterie quotes"
  ON public.coterie_quotes
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ----------------------------------------------------------------------------
-- carrier_approval_gates (staff may also UPDATE to approve/deny in-workspace)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff can view approval gates in their workspace" ON public.carrier_approval_gates;
CREATE POLICY "Staff can view approval gates in their workspace"
  ON public.carrier_approval_gates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      JOIN public.agency_workspace_memberships awm
        ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE a.id = carrier_approval_gates.account_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
    )
  );

-- A staff-created gate must be a FRESH, self-requested, undecided gate (A1): it
-- starts 'pending', carries no approver, and records the creator as the
-- requester. This stops a member from inserting an already-'approved' (or
-- otherwise pre-decided) gate to bypass the named-human review. Pre-approved /
-- system gates remain possible ONLY via the service role (FOR ALL policy below).
DROP POLICY IF EXISTS "Staff can insert approval gates in their workspace" ON public.carrier_approval_gates;
CREATE POLICY "Staff can insert approval gates in their workspace"
  ON public.carrier_approval_gates
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.accounts a
      JOIN public.agency_workspace_memberships awm
        ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE a.id = carrier_approval_gates.account_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
        AND awm.role IN ('owner', 'admin', 'producer', 'csr')
    )
    AND status = 'pending'
    AND approved_by IS NULL
    AND approved_at IS NULL
    AND requested_by = auth.uid()
  );

-- Separation of duties: an allowed-role member may update a gate, but the
-- APPROVE transition is non-forgeable — it must record the acting human
-- (approved_by = auth.uid()) AND that human must NOT be the requester
-- (approved_by IS DISTINCT FROM requested_by). Denials record the actor too but
-- may be the requester (you can deny/withdraw your own request); pending/expired
-- impose no actor constraint. This matters because Phase 2 wires bind/send to
-- gate status, so a self-approvable gate would make the approver forgeable.
DROP POLICY IF EXISTS "Staff can update approval gates in their workspace" ON public.carrier_approval_gates;
CREATE POLICY "Staff can update approval gates in their workspace"
  ON public.carrier_approval_gates
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      JOIN public.agency_workspace_memberships awm
        ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE a.id = carrier_approval_gates.account_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
        AND awm.role IN ('owner', 'admin', 'producer', 'csr')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.accounts a
      JOIN public.agency_workspace_memberships awm
        ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE a.id = carrier_approval_gates.account_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
        AND awm.role IN ('owner', 'admin', 'producer', 'csr')
    )
    AND (
      -- Approving REQUIRES a different, IDENTIFIED human (separation of duties).
      -- `requested_by IS NOT NULL` is explicit (not merely implied by IS DISTINCT
      -- FROM) so a gate with a null/cleared requester can NEVER be self-approved
      -- through the "null counts as distinct" loophole (A2). Immutability of
      -- requested_by is enforced by the BEFORE UPDATE trigger below.
      (status = 'approved'
        AND approved_by = auth.uid()
        AND requested_by IS NOT NULL
        AND approved_by IS DISTINCT FROM requested_by)
      -- Denials record the actor but may be the requester.
      OR (status = 'denied' AND approved_by = auth.uid())
      -- Non-decision transitions are unconstrained HERE (the trigger still blocks
      -- reverting a decided gate and forging approver fields onto pending/expired).
      OR status IN ('pending', 'expired')
    )
  );

DROP POLICY IF EXISTS "Service role manages approval gates" ON public.carrier_approval_gates;
CREATE POLICY "Service role manages approval gates"
  ON public.carrier_approval_gates
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ----------------------------------------------------------------------------
-- carrier_audit_events (APPEND-ONLY: SELECT + INSERT only; no UPDATE/DELETE)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff can view audit events in their workspace" ON public.carrier_audit_events;
CREATE POLICY "Staff can view audit events in their workspace"
  ON public.carrier_audit_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      JOIN public.agency_workspace_memberships awm
        ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE a.id = carrier_audit_events.account_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
    )
  );

-- INSERT is restricted to the service role ONLY (see the service-role policy
-- below): the audit trail is written exclusively by the edge function via the
-- service-role client. Allowing staff to INSERT would let any active member
-- forge arbitrary `carrier_audit_events` rows, so no staff INSERT policy exists.
-- (Dropped here for idempotency in case a prior version created it.)
DROP POLICY IF EXISTS "Staff can insert audit events in their workspace" ON public.carrier_audit_events;

DROP POLICY IF EXISTS "Service role manages audit events" ON public.carrier_audit_events;
CREATE POLICY "Service role manages audit events"
  ON public.carrier_audit_events
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ----------------------------------------------------------------------------
-- coterie_webhook_log (reserved — service-role only)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role manages coterie webhook log" ON public.coterie_webhook_log;
CREATE POLICY "Service role manages coterie webhook log"
  ON public.coterie_webhook_log
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================================
-- 8. DOCUMENTATION COMMENTS
-- ============================================================================
COMMENT ON TABLE public.coterie_quote_sessions IS 'Coterie commercial quote attempts (intake + normalized request). Phase 1 mock-only.';
COMMENT ON TABLE public.coterie_quotes IS 'Normalized + raw Coterie quote results per session. Phase 1 mock-only.';
COMMENT ON TABLE public.carrier_approval_gates IS 'Carrier-agnostic named-human approval gates; no client-facing action without an approved gate.';
COMMENT ON TABLE public.carrier_audit_events IS 'Append-only, redacted audit trail for carrier integrations.';
COMMENT ON TABLE public.coterie_webhook_log IS 'Reserved for a future Coterie webhook receiver (service-role only). Unused in Phase 1.';

-- ============================================================================
-- DONE — remember: this file is NOT auto-applied.
-- ============================================================================
