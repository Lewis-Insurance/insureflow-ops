-- Phase-0 (6/n) — DEFAULT-SAFE fire-gate posture (PLAN-INT-B §6.1) + governor config row (§3.1) +
-- LATENT BUG FIX: sender_pause_state.scope_type CHECK allowed only ('user','org') but the governor's
-- checkGlobalPause queries scope_type='global' -> the global kill switch could never be set.
ALTER TABLE public.sender_pause_state DROP CONSTRAINT sender_pause_state_scope_type_check;
ALTER TABLE public.sender_pause_state ADD CONSTRAINT sender_pause_state_scope_type_check
  CHECK (scope_type = ANY (ARRAY['user'::text,'org'::text,'global'::text]));
INSERT INTO public.sender_pause_state (org_id, scope_type, scope_id, is_paused, marketing_paused, paused_reason, paused_at)
SELECT 'f1f07037-3032-45f8-93ca-72c0f47e4fbb','global','f1f07037-3032-45f8-93ca-72c0f47e4fbb',true,true,
       'Phase-0 default-safe: global send pause ON until explicit human go-live (PLAN-INT-B §6.1)', now()
WHERE NOT EXISTS (SELECT 1 FROM public.sender_pause_state WHERE scope_type='global');
INSERT INTO public.marketing_governor_config (org_id)
SELECT 'f1f07037-3032-45f8-93ca-72c0f47e4fbb'
WHERE NOT EXISTS (SELECT 1 FROM public.marketing_governor_config);
