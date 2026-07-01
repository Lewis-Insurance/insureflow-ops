-- Phase 3: register send-id-card-email on Fence client_send_approvals surface check.

ALTER TABLE public.client_send_approvals
  DROP CONSTRAINT IF EXISTS client_send_approvals_surface_check;

ALTER TABLE public.client_send_approvals
  ADD CONSTRAINT client_send_approvals_surface_check
  CHECK (surface IN (
    'email-send',
    'send-sms',
    'send-coi-email',
    'send-id-card-email',
    'esign-create-request'
  ));

COMMENT ON CONSTRAINT client_send_approvals_surface_check ON public.client_send_approvals IS
  'Fence-registered send surfaces; Play 4 id.card.issue adds send-id-card-email (Phase 3).';
