-- Phase-0 (7/n) — IDENTITY BRIDGE as a DOCUMENTED DERIVED PROJECTION from accounts (guardrail #3).
-- Levitate is hardwired to contacts.id (FK + the opt-out token re-verifies the row). contacts was
-- DELIBERATELY RETIRED in Wave 5 (26 inbound FKs re-pointed to accounts; they STAY on accounts).
-- This does NOT resurrect contacts as an entity — it materializes a one-way MARKETING-SEND PROJECTION
-- of emailable active accounts into contacts (source='phase0_account_projection', keyed back via
-- account_id ON DELETE CASCADE, regenerable, never hand-edited). accounts = single source of truth;
-- org_id == agency_workspace_id lives on the Levitate tables, not on the contact.
-- DOWN: DELETE FROM contacts WHERE source='phase0_account_projection';
CREATE UNIQUE INDEX IF NOT EXISTS uq_contacts_phase0_projection
  ON public.contacts (account_id) WHERE source = 'phase0_account_projection' AND deleted_at IS NULL;
INSERT INTO public.contacts (account_id, first_name, last_name, email, phone, household_id, state_code, source)
SELECT DISTINCT ON (t.contact_account_id)
  t.contact_account_id,
  split_part(btrim(t.contact_name), ' ', 1),
  regexp_replace(btrim(t.contact_name), '^\S+\s*', ''),
  t.contact_email, a.phone_e164, NULL::uuid, a.state, 'phase0_account_projection'
FROM public.v_phase0_crosssell_targets t
JOIN public.accounts a ON a.id = t.contact_account_id
WHERE t.reachable_email
ON CONFLICT (account_id) WHERE (source = 'phase0_account_projection' AND deleted_at IS NULL) DO NOTHING;
