-- Fence Sprint 1: one-time named-human approvals for client-facing sends.
-- Safe to stage on the feature branch only; production deploy is Brian-gated.

create table if not exists public.client_send_approvals (
  id bigserial primary key,
  approval_ref text not null unique,
  surface text not null check (surface in ('email-send', 'send-sms', 'send-coi-email', 'esign-create-request')),
  content_hash text not null check (content_hash like 'sha256:%'),
  approved_by_user_id uuid not null references auth.users(id) on delete restrict,
  approved_by_email text,
  consumed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  created_at timestamptz not null default now(),
  constraint client_send_approvals_consumed_after_created check (consumed_at is null or consumed_at >= created_at),
  constraint client_send_approvals_expires_after_created check (expires_at > created_at)
);

create index if not exists client_send_approvals_lookup_idx
  on public.client_send_approvals (approval_ref, surface, consumed_at);

create index if not exists client_send_approvals_human_idx
  on public.client_send_approvals (approved_by_user_id, created_at desc);

alter table public.client_send_approvals enable row level security;

-- No broad client read/update policy: approvals are minted by the authenticated
-- edge function and consumed by send functions through the service role. This
-- keeps approval refs opaque and one-time at the server boundary.
