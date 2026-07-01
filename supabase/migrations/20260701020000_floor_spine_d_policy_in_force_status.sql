-- ============================================================================
-- THE FLOOR — Spine D: policy_in_force_status view
-- Spec: docs/THE-FLOOR-HANDOFF-ARCHITECTURE.md §8 Spine D
-- Every Tier 3 client-facing send reads this view for live in-force + limits.
-- Staged only. Do not apply to prod until Brian clears Phase 0 blockers.
-- ============================================================================

CREATE OR REPLACE VIEW public.policy_in_force_status AS
SELECT
  p.id AS policy_id,
  p.account_id,
  a.agency_workspace_id,
  p.policy_number,
  p.carrier,
  p.line_of_business,
  p.status AS policy_status,
  p.effective_date,
  p.expiration_date,
  p.cancelled_at,
  p.cancellation_reason,
  p.premium,
  p.cgl_details,
  p.bap_details,
  p.coverage,
  p.property_details,
  p.updated_at AS policy_updated_at,
  CASE
    WHEN p.deleted_at IS NOT NULL THEN FALSE
    WHEN p.cancelled_at IS NOT NULL THEN FALSE
    WHEN lower(coalesce(p.status, '')) IN ('cancelled', 'expired', 'pending_cancel') THEN FALSE
    WHEN p.expiration_date IS NOT NULL AND p.expiration_date < CURRENT_DATE THEN FALSE
    WHEN p.effective_date IS NOT NULL AND p.effective_date > CURRENT_DATE THEN FALSE
    WHEN lower(coalesce(p.status, '')) IN ('active', 'bound', 'pending') THEN TRUE
    ELSE FALSE
  END AS in_force,
  NOW() AS evaluated_at
FROM public.policies p
LEFT JOIN public.accounts a ON a.id = p.account_id
WHERE p.deleted_at IS NULL;

COMMENT ON VIEW public.policy_in_force_status IS
  'Floor safety spine: live in-force flag and limit JSONB for Tier 3 sends. '
  'A policy cancelled this morning must read in_force=false even if paper is unchanged. '
  'Carrier-download reconciliation (Play 1) will extend this view when download processing lands.';

GRANT SELECT ON public.policy_in_force_status TO authenticated;
GRANT SELECT ON public.policy_in_force_status TO service_role;
