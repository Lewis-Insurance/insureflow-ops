-- Exercises the Haven policy feed against COL's real policy shapes, then leaves
-- pages on the table for the receiver-side validator to judge.
--
-- The values are the ones actually on the COL and GSMS accounts in InsureFlow —
-- including the ones that are awkward: a null premium, a policy number with
-- spaces in it, a lowercase carrier suffix.

BEGIN;

INSERT INTO public.accounts (id, name, account_type) VALUES
  ('be76fd41-de02-4274-ba6a-d26b7fb7e94f', 'Circle of Life Assisted Living Communities', 'business'),
  ('45892ec6-70ff-4e82-9a8f-abbdb6f578bd', 'Homewood Property Company LLC', 'business'),
  ('11c98512-dad1-49be-bb90-5cf1620c58fb', 'The Plantation on Summers LLC', 'business'),
  ('43b472e2-6ad4-4e3b-a3e4-4bf06ca0de41', 'Gsms Developers Inc', 'business'),
  ('f7d4d6e9-e604-40e7-8c58-6173d3029eb4', 'Grande Cypress ALF LLC', 'business');

INSERT INTO public.policies
  (id, account_id, policy_number, carrier, line_of_business, named_insured, effective_date, expiration_date, premium, status)
VALUES
  ('a0000000-0000-4000-8000-000000000001', 'be76fd41-de02-4274-ba6a-d26b7fb7e94f',
   'NSC101045', 'National Fire & Marine Insurance Company', 'General Liability',
   'Circle of Life Assisted Living Communities', '2026-04-08', '2027-04-08', 239893.00, 'active'),
  ('a0000000-0000-4000-8000-000000000002', '45892ec6-70ff-4e82-9a8f-abbdb6f578bd',
   ' 09-7590181384-S-03', 'International Catastrophe Insurance Managers, LLC (ICAT)', 'Property',
   'Homewood Property Company LLC', '2026-07-14', '2027-07-14', 24024.52, 'active'),
  -- No premium recorded on the source row. Must travel as JSON null, not 0.
  ('a0000000-0000-4000-8000-000000000003', '11c98512-dad1-49be-bb90-5cf1620c58fb',
   '54-940036-00', 'Auto-Owners', 'auto',
   'The Plantation on Summers LLC', '2025-12-11', '2026-12-11', NULL, 'active'),
  ('a0000000-0000-4000-8000-000000000004', '43b472e2-6ad4-4e3b-a3e4-4bf06ca0de41',
   '09-7591201044-s-00', 'Bass Underwriting', 'Property',
   'Gsms Developers Inc', '2026-05-14', '2027-05-14', 14962.18, 'active'),
  -- On an account the integration does NOT approve. Publishing must refuse.
  ('a0000000-0000-4000-8000-000000000005', 'f7d4d6e9-e604-40e7-8c58-6173d3029eb4',
   'GC-UNAPPROVED-1', 'Normandy Insurance Company', 'Workers Comp',
   'Grande Cypress ALF LLC', '2025-07-19', '2026-07-19', 1000.00, 'active'),
  -- No policy number. Publishing must refuse rather than ship a quarantine.
  ('a0000000-0000-4000-8000-000000000006', 'be76fd41-de02-4274-ba6a-d26b7fb7e94f',
   NULL, 'Unknown', 'Umbrella', 'Circle of Life', '2026-01-01', '2027-01-01', 500.00, 'active');

-- Token below is the synthetic one the harness uses; its SHA-256 is stored, the
-- token itself never is.
INSERT INTO public.haven_feed_integrations (id, name, token_hash, approved_account_ids, enabled)
VALUES (
  'bbbbbbbb-1111-4000-8000-000000000001',
  'Haven (contract fixture)',
  encode(sha256('hvn_0000000000000000000000000000000000000000000000000000000000000001'::bytea), 'hex'),
  ARRAY['be76fd41-de02-4274-ba6a-d26b7fb7e94f',
        '45892ec6-70ff-4e82-9a8f-abbdb6f578bd',
        '11c98512-dad1-49be-bb90-5cf1620c58fb',
        '43b472e2-6ad4-4e3b-a3e4-4bf06ca0de41']::uuid[],
  true
);

COMMIT;
