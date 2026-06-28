-- ############################################################################
-- ###  WAVE 5 · MODEL-5 — PARTY MODEL (Option A)  ###  DRAFT — DO NOT APPLY  ###
-- ############################################################################
-- STATUS: PARKED for Brian's approval. This file is NOT in supabase/migrations/
-- and has NOT been applied. It re-points the person/consent/comms layer off the
-- dead `contacts` table onto the account-centric `insured_*` model.
--
-- WHY SAFE (validated live 2026-06-28): contacts = 0 rows; every one of the 23
-- dependent tables is EMPTY except call_sessions = 5 (all contact_id NULL).
-- accounts.contact_id is NULL on all rows. So the 26-FK re-point is PURE DDL —
-- zero rows move, zero live sends break (nothing is live yet).
--
-- GATES THE ENTIRE outbound stack (SMS/voice/consent/portal/marketing/tickets/
-- reviews). Adopt before building those, so they key off account_id from day one.
--
-- PRE-APPLY CHECKLIST (re-verify at apply time — counts drift):
--   1. SELECT count(*) FROM contacts;                              -- expect 0
--   2. SELECT count(*) FROM call_sessions WHERE contact_id IS NOT NULL; -- expect 0
--   3. Confirm insured_profiles/_emails/_phones/_addresses column names below.
--   4. Run on a branch first; snapshot the (empty) contacts table.
-- ############################################################################

BEGIN;

-- ========================================================================
-- PHASE 1 — populate the account-centric party layer (one row per active account)
-- ========================================================================
INSERT INTO public.insured_profiles (account_id, display_name, first_name, last_name, org_name, type, status, created_at, updated_at)
SELECT a.id, a.name, a.first_name, a.last_name,
       CASE WHEN a.type::text <> 'household' THEN a.name END,
       a.type::text, 'active', now(), now()
FROM public.accounts a
WHERE a.deleted_at IS NULL
ON CONFLICT (account_id) DO NOTHING;
-- then backfill insured_emails/phones/addresses from accounts.email / phone_e164 /
-- address columns, and set insured_profiles.primary_email_id/phone_id/address_id.
-- (left as an explicit per-column step — verify insured_* columns before running.)

-- ========================================================================
-- PHASE 2 — re-point all 26 contacts FKs onto accounts(id), preserving delete-rule.
-- Columns keep their name (contact_id) to minimise app churn; renaming each to
-- account_id is the cleaner long-term option (do it in one pass if preferred).
-- All tables are EMPTY (except call_sessions=5 NULL) so no data moves.
-- ========================================================================

-- NO ACTION
ALTER TABLE public.accounts                     DROP CONSTRAINT accounts_contact_id_fkey;
ALTER TABLE public.accounts                     ADD  CONSTRAINT accounts_contact_account_fkey                     FOREIGN KEY (contact_id)        REFERENCES public.accounts(id) ON DELETE NO ACTION;
ALTER TABLE public.businesses                   DROP CONSTRAINT businesses_primary_contact_id_fkey;
ALTER TABLE public.businesses                   ADD  CONSTRAINT businesses_primary_account_fkey                   FOREIGN KEY (primary_contact_id) REFERENCES public.accounts(id) ON DELETE NO ACTION;
ALTER TABLE public.call_sessions                DROP CONSTRAINT call_sessions_contact_id_fkey;
ALTER TABLE public.call_sessions                ADD  CONSTRAINT call_sessions_contact_account_fkey                FOREIGN KEY (contact_id)        REFERENCES public.accounts(id) ON DELETE NO ACTION;
ALTER TABLE public.client_portal_users          DROP CONSTRAINT client_portal_users_contact_id_fkey;
ALTER TABLE public.client_portal_users          ADD  CONSTRAINT client_portal_users_contact_account_fkey          FOREIGN KEY (contact_id)        REFERENCES public.accounts(id) ON DELETE NO ACTION;
ALTER TABLE public.commercial_business_accounts DROP CONSTRAINT commercial_business_accounts_primary_contact_id_fkey;
ALTER TABLE public.commercial_business_accounts ADD  CONSTRAINT commercial_business_accounts_primary_account_fkey FOREIGN KEY (primary_contact_id) REFERENCES public.accounts(id) ON DELETE NO ACTION;
ALTER TABLE public.household_accounts           DROP CONSTRAINT household_accounts_head_contact_id_fkey;
ALTER TABLE public.household_accounts           ADD  CONSTRAINT household_accounts_head_account_fkey              FOREIGN KEY (head_contact_id)   REFERENCES public.accounts(id) ON DELETE NO ACTION;
ALTER TABLE public.household_accounts           DROP CONSTRAINT household_accounts_spouse_contact_id_fkey;
ALTER TABLE public.household_accounts           ADD  CONSTRAINT household_accounts_spouse_account_fkey            FOREIGN KEY (spouse_contact_id) REFERENCES public.accounts(id) ON DELETE NO ACTION;
ALTER TABLE public.portal_invitations           DROP CONSTRAINT portal_invitations_contact_id_fkey;
ALTER TABLE public.portal_invitations           ADD  CONSTRAINT portal_invitations_contact_account_fkey           FOREIGN KEY (contact_id)        REFERENCES public.accounts(id) ON DELETE NO ACTION;
ALTER TABLE public.sms_messages                 DROP CONSTRAINT sms_messages_contact_id_fkey;
ALTER TABLE public.sms_messages                 ADD  CONSTRAINT sms_messages_contact_account_fkey                 FOREIGN KEY (contact_id)        REFERENCES public.accounts(id) ON DELETE NO ACTION;
ALTER TABLE public.tickets                      DROP CONSTRAINT tickets_contact_id_fkey;
ALTER TABLE public.tickets                      ADD  CONSTRAINT tickets_contact_account_fkey                      FOREIGN KEY (contact_id)        REFERENCES public.accounts(id) ON DELETE NO ACTION;

-- CASCADE
ALTER TABLE public.communication_preferences        DROP CONSTRAINT communication_preferences_contact_id_fkey;
ALTER TABLE public.communication_preferences        ADD  CONSTRAINT communication_preferences_account_fkey        FOREIGN KEY (contact_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
ALTER TABLE public.consent_evidence                 DROP CONSTRAINT consent_evidence_contact_id_fkey;
ALTER TABLE public.consent_evidence                 ADD  CONSTRAINT consent_evidence_account_fkey                 FOREIGN KEY (contact_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
ALTER TABLE public.contact_send_frequency           DROP CONSTRAINT contact_send_frequency_contact_id_fkey;
ALTER TABLE public.contact_send_frequency           ADD  CONSTRAINT contact_send_frequency_account_fkey           FOREIGN KEY (contact_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
ALTER TABLE public.contact_tags                     DROP CONSTRAINT contact_tags_contact_id_fkey;
ALTER TABLE public.contact_tags                     ADD  CONSTRAINT contact_tags_account_fkey                     FOREIGN KEY (contact_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
ALTER TABLE public.marketing_automation_enrollments DROP CONSTRAINT marketing_automation_enrollments_contact_id_fkey;
ALTER TABLE public.marketing_automation_enrollments ADD  CONSTRAINT marketing_automation_enrollments_account_fkey FOREIGN KEY (contact_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
ALTER TABLE public.marketing_review_requests        DROP CONSTRAINT marketing_review_requests_contact_id_fkey;
ALTER TABLE public.marketing_review_requests        ADD  CONSTRAINT marketing_review_requests_account_fkey        FOREIGN KEY (contact_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
ALTER TABLE public.marketing_survey_fatigue         DROP CONSTRAINT marketing_survey_fatigue_contact_id_fkey;
ALTER TABLE public.marketing_survey_fatigue         ADD  CONSTRAINT marketing_survey_fatigue_account_fkey         FOREIGN KEY (contact_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
ALTER TABLE public.marketing_survey_sends           DROP CONSTRAINT marketing_survey_sends_contact_id_fkey;
ALTER TABLE public.marketing_survey_sends           ADD  CONSTRAINT marketing_survey_sends_account_fkey           FOREIGN KEY (contact_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
ALTER TABLE public.twilio_consents                  DROP CONSTRAINT twilio_consents_contact_id_fkey;
ALTER TABLE public.twilio_consents                  ADD  CONSTRAINT twilio_consents_account_fkey                  FOREIGN KEY (contact_id) REFERENCES public.accounts(id) ON DELETE CASCADE;

-- SET NULL
ALTER TABLE public.communication_evidence DROP CONSTRAINT communication_evidence_to_contact_id_fkey;
ALTER TABLE public.communication_evidence ADD  CONSTRAINT communication_evidence_to_account_fkey FOREIGN KEY (to_contact_id)  REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.consent_ledger         DROP CONSTRAINT consent_ledger_contact_id_fkey;
ALTER TABLE public.consent_ledger         ADD  CONSTRAINT consent_ledger_account_fkey         FOREIGN KEY (contact_id)    REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.households             DROP CONSTRAINT households_primary_contact_id_fkey;  -- (already deprecated; HH uses primary_account_id)
ALTER TABLE public.households             ADD  CONSTRAINT households_primary_contact_account_fkey FOREIGN KEY (primary_contact_id) REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.marketing_send_queue   DROP CONSTRAINT marketing_send_queue_to_contact_id_fkey;
ALTER TABLE public.marketing_send_queue   ADD  CONSTRAINT marketing_send_queue_to_account_fkey   FOREIGN KEY (to_contact_id) REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.nps_responses          DROP CONSTRAINT nps_responses_contact_id_fkey;
ALTER TABLE public.nps_responses          ADD  CONSTRAINT nps_responses_account_fkey          FOREIGN KEY (contact_id)    REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.review_requests        DROP CONSTRAINT review_requests_contact_id_fkey;
ALTER TABLE public.review_requests        ADD  CONSTRAINT review_requests_account_fkey        FOREIGN KEY (contact_id)    REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.reviews                DROP CONSTRAINT reviews_contact_id_fkey;
ALTER TABLE public.reviews                ADD  CONSTRAINT reviews_account_fkey                FOREIGN KEY (contact_id)    REFERENCES public.accounts(id) ON DELETE SET NULL;

-- ========================================================================
-- PHASE 3 — deprecate contacts (POINT OF NO RETURN — keep as the final step)
-- ========================================================================
-- After confirming 0 inbound FKs remain (re-run the MODEL-5 census), snapshot the
-- (empty) contacts table, then:
COMMENT ON TABLE public.contacts IS 'DEPRECATED 2026-06 — party layer is accounts + insured_*. Pending DROP.';
-- DROP TABLE public.contacts;   -- deferred to a final, separate migration after a release with no readers.

COMMIT;
-- ROLLBACK to undo (this whole file is one transaction).
