-- Phase-0 (3/n) — dedicated canopy_invites table (PLAN-INT-A §5.1 chosen path). One open invite
-- per account (partial-unique). The webhook keeps linking real pulls to accounts by account_id.
CREATE TABLE public.canopy_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_workspace_id uuid NOT NULL DEFAULT 'f1f07037-3032-45f8-93ca-72c0f47e4fbb',
  account_id uuid NOT NULL,
  widget_id text, public_alias text, public_url text, consent_token text,
  pull_type text NOT NULL DEFAULT 'attach_account_invite',
  status text NOT NULL DEFAULT 'invite_minted'
    CHECK (status IN ('invite_minted','sent','pending','processing','authenticated','complete','expired','archived')),
  invite_expires_at timestamptz, phase0_enrollment_id uuid, canopy_pull_id text, batch_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE UNIQUE INDEX uq_canopy_open_invite_per_account ON public.canopy_invites (account_id)
  WHERE status IN ('invite_minted','sent','pending','processing','authenticated') AND deleted_at IS NULL;
CREATE INDEX canopy_invites_account_idx ON public.canopy_invites (account_id);
CREATE INDEX canopy_invites_status_idx  ON public.canopy_invites (status) WHERE deleted_at IS NULL;
ALTER TABLE public.canopy_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY canopy_invites_staff ON public.canopy_invites FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
REVOKE INSERT, UPDATE, DELETE ON public.canopy_invites FROM anon;
