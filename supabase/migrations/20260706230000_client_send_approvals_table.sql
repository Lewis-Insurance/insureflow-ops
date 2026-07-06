-- ============================================================================
-- client_send_approvals: the Fence interactive-approval store
-- ============================================================================
-- The client-send-approval-create fn (mint) and _shared/clientSendApprovalGate
-- (consume) have referenced this table since the Fence minter shipped - but no
-- migration ever created it, so the INTERACTIVE approval path (a human
-- clicking Send in the app) has never worked: every mint 500'd on insert.
-- Discovered 2026-07-06 during the submission-packet send E2E; the same gap
-- silently blocked interactive COI email sends.
--
-- Column contract derived from the code (create fn insert + gate consume):
-- one-time, expiring, content-hash-bound approvals consumed atomically via a
-- conditional UPDATE on consumed_at.
--
-- Access is SERVICE-ROLE ONLY (both fns use the service client): RLS is
-- enabled with NO policies, and anon/authenticated are revoked.

create table if not exists public.client_send_approvals (
  id uuid primary key default gen_random_uuid(),
  approval_ref text not null unique,
  surface text not null,
  content_hash text not null,
  approved_by_user_id uuid not null,
  approved_by_email text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_client_send_approvals_expires
  on public.client_send_approvals (expires_at)
  where consumed_at is null;

alter table public.client_send_approvals enable row level security;
revoke all on public.client_send_approvals from anon, authenticated, public;
