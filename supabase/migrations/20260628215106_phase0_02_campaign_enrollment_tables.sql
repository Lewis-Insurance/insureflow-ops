-- Phase-0 (2/n) — lean campaign + enrollment (PLAN-INT-C §3.2). One row per household.
-- RLS: is_staff() scoped (mirrors coverage_gap_opportunities post-Batch-5); service_role bypasses.
CREATE TABLE public.phase0_campaign (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_workspace_id uuid NOT NULL,
  key text NOT NULL, name text NOT NULL,
  play text NOT NULL CHECK (play IN ('home_only_sell_auto','auto_only_sell_home','umbrella_add','rec_sell_auto')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','archived')),
  email_template_key text NOT NULL, coverage_gap_rule_key text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_workspace_id, key)
);
CREATE TABLE public.phase0_enrollment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_workspace_id uuid NOT NULL,
  campaign_id uuid NOT NULL REFERENCES public.phase0_campaign(id),
  household_key text NOT NULL, household_id uuid, play text NOT NULL,
  contact_account_id uuid NOT NULL, contact_email text NOT NULL, contact_name text,
  status text NOT NULL DEFAULT 'enrolled'
    CHECK (status IN ('enrolled','minting','ready_to_send','queued','sent','converted','suppressed','cancelled','failed')),
  canopy_invite_id uuid, canopy_link_url text, minted_at timestamptz,
  send_queue_id uuid, queued_at timestamptz, sent_at timestamptz,
  converted_at timestamptz, converted_policy_id uuid,
  idempotency_key text NOT NULL, suppressed_reason text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, household_key), UNIQUE (idempotency_key)
);
CREATE INDEX phase0_enrollment_status_idx ON public.phase0_enrollment (status);
CREATE INDEX phase0_enrollment_campaign_play_idx ON public.phase0_enrollment (campaign_id, play);
CREATE INDEX phase0_enrollment_contact_account_idx ON public.phase0_enrollment (contact_account_id);
ALTER TABLE public.phase0_campaign   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phase0_enrollment ENABLE ROW LEVEL SECURITY;
CREATE POLICY phase0_campaign_staff   ON public.phase0_campaign   FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY phase0_enrollment_staff ON public.phase0_enrollment FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
REVOKE INSERT, UPDATE, DELETE ON public.phase0_campaign, public.phase0_enrollment FROM anon;
