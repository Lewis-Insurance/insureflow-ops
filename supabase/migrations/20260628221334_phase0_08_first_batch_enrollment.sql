-- Phase-0 (8/n) — first-batch campaign + enrollment (PLAN-INT-C §5 Option A: 90 email-reachable
-- home-only -> auto households). One enrollment per household; idempotent. No mint/queue/send.
WITH camp AS (
  INSERT INTO public.phase0_campaign (agency_workspace_id, key, name, play, status, email_template_key, coverage_gap_rule_key)
  VALUES ('f1f07037-3032-45f8-93ca-72c0f47e4fbb','phase0_crosssell_2026q3',
          'Phase-0 Cross-Sell 2026Q3 — Home-only to Auto','home_only_sell_auto','active',
          'phase0_home_only_sell_auto','auto_no_home')
  ON CONFLICT (agency_workspace_id, key) DO UPDATE SET status = EXCLUDED.status, updated_at = now()
  RETURNING id, key
)
INSERT INTO public.phase0_enrollment
  (agency_workspace_id, campaign_id, household_key, household_id, play, contact_account_id, contact_email, contact_name, idempotency_key)
SELECT t.agency_workspace_id, camp.id, t.household_key, t.household_id, t.play,
       t.contact_account_id, t.contact_email, t.contact_name, camp.key || ':' || t.household_key
FROM public.v_phase0_crosssell_targets t CROSS JOIN camp
WHERE t.play = 'home_only_sell_auto' AND t.reachable_email
ON CONFLICT (idempotency_key) DO NOTHING;
