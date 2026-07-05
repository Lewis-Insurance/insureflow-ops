-- ============================================================================
-- Commercial client intake portal (SOW v3 3.5 feeder #3 - Phase 2)
-- ============================================================================
-- Tokenized public link -> the insured fills their own business profile ->
-- lands as a STAGED submission -> agent reviews field-by-field -> apply writes
-- commercial_profiles with provenance src='client'. Mirrors the proven
-- /portal/collect token pattern (public edge fn owns the token check; the
-- tables themselves are staff-only under RLS; anon fully revoked).
--
-- Security posture:
--   - Tokens are server-minted (48 hex chars of pgcrypto randomness), expiring
--     (default 14 days), revocable, single-account scope.
--   - The public edge fn (commercial-intake) is the ONLY anon path: it
--     validates the token with the service role, returns only non-sensitive
--     prefill (never FEIN), and inserts staged rows. Uniform 'invalid or
--     expired link' on every token failure (no enumeration).
--   - Staged rows are suggestions, never live data (Invariant 4).
-- Idempotent.

create table if not exists public.commercial_intake_links (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  agency_workspace_id uuid not null,
  submission_id uuid references public.commercial_submissions(id),
  token text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_submitted_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists idx_intake_links_account on public.commercial_intake_links(account_id);

create table if not exists public.commercial_intake_submissions (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.commercial_intake_links(id),
  account_id uuid not null references public.accounts(id),
  agency_workspace_id uuid not null,
  payload jsonb not null,
  client_note text,
  status text not null default 'pending' check (status in ('pending','applied','dismissed')),
  applied_by uuid,
  applied_at timestamptz,
  submitted_at timestamptz not null default now()
);
create index if not exists idx_intake_submissions_account
  on public.commercial_intake_submissions(account_id, status);
create index if not exists idx_intake_submissions_link on public.commercial_intake_submissions(link_id);

-- Tenancy autofill (same guard as the rest of the risk store).
drop trigger if exists trg_intake_links_workspace on public.commercial_intake_links;
create trigger trg_intake_links_workspace
  before insert or update of account_id, agency_workspace_id on public.commercial_intake_links
  for each row execute function public.commercial_fill_workspace();
drop trigger if exists trg_intake_submissions_workspace on public.commercial_intake_submissions;
create trigger trg_intake_submissions_workspace
  before insert or update of account_id, agency_workspace_id on public.commercial_intake_submissions
  for each row execute function public.commercial_fill_workspace();

-- Cross-account guard: a staged submission must belong to its link's account.
create or replace function public.intake_submission_check_link()
returns trigger language plpgsql set search_path to 'public'
as $$
begin
  if not exists (
    select 1 from public.commercial_intake_links l
    where l.id = new.link_id and l.account_id = new.account_id
  ) then
    raise exception 'link_id must belong to the same account as the staged submission';
  end if;
  return new;
end; $$;
drop trigger if exists trg_intake_submissions_link on public.commercial_intake_submissions;
create trigger trg_intake_submissions_link
  before insert or update of link_id, account_id on public.commercial_intake_submissions
  for each row execute function public.intake_submission_check_link();

-- RLS: staff + workspace. The public path NEVER touches these tables directly
-- (the edge fn uses the service role after its own token check).
alter table public.commercial_intake_links enable row level security;
drop policy if exists intake_links_select on public.commercial_intake_links;
create policy intake_links_select on public.commercial_intake_links for select to authenticated
  using (public.is_staff() and public.is_agency_member(agency_workspace_id));
drop policy if exists intake_links_update on public.commercial_intake_links;
create policy intake_links_update on public.commercial_intake_links for update to authenticated
  using (public.is_staff() and public.is_agency_member(agency_workspace_id))
  with check (public.is_staff() and public.is_agency_member(agency_workspace_id));
-- No INSERT policy: links are minted only by the RPC below (server-side token).
revoke all on public.commercial_intake_links from anon;

alter table public.commercial_intake_submissions enable row level security;
drop policy if exists intake_submissions_select on public.commercial_intake_submissions;
create policy intake_submissions_select on public.commercial_intake_submissions for select to authenticated
  using (public.is_staff() and public.is_agency_member(agency_workspace_id));
drop policy if exists intake_submissions_update on public.commercial_intake_submissions;
create policy intake_submissions_update on public.commercial_intake_submissions for update to authenticated
  using (public.is_staff() and public.is_agency_member(agency_workspace_id))
  with check (public.is_staff() and public.is_agency_member(agency_workspace_id));
-- No INSERT policy: staged rows arrive only through the edge fn (service role).
revoke all on public.commercial_intake_submissions from anon;

-- Server-minted link. SECURITY DEFINER so the token never exists client-side
-- before the row does; staff + workspace gated inside.
create or replace function public.create_commercial_intake_link(
  p_account_id uuid,
  p_submission_id uuid default null,
  p_days integer default 14
) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare
  v_ws uuid;
  v_token text;
  v_link_id uuid;
  v_expires timestamptz;
begin
  select agency_workspace_id into v_ws from public.accounts where id = p_account_id;
  if v_ws is null then raise exception 'account not found'; end if;
  if not (public.is_staff() and public.is_agency_member(v_ws)) then
    raise exception 'staff only';
  end if;
  if p_submission_id is not null and not exists (
    select 1 from public.commercial_submissions s
    where s.id = p_submission_id and s.account_id = p_account_id
  ) then
    raise exception 'submission does not belong to this account';
  end if;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  v_expires := now() + make_interval(days => greatest(1, least(coalesce(p_days, 14), 60)));

  insert into public.commercial_intake_links (account_id, submission_id, token, expires_at)
  values (p_account_id, p_submission_id, v_token, v_expires)
  returning id into v_link_id;

  return jsonb_build_object('link_id', v_link_id, 'token', v_token, 'expires_at', v_expires);
end; $$;
comment on function public.create_commercial_intake_link(uuid, uuid, integer) is
  'Mints a tokenized client-intake link (48-hex server randomness, expiring, revocable). Staff + workspace gated inside; SECURITY DEFINER.';
revoke execute on function public.create_commercial_intake_link(uuid, uuid, integer) from anon, public;
grant  execute on function public.create_commercial_intake_link(uuid, uuid, integer) to authenticated;
