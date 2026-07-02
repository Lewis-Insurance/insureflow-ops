-- =====================================================================
-- Batch 1C — Wave 5 party model (Option A)  [Brian APPROVED]
-- =====================================================================
-- Adopt the account-centric party layer (insured_profiles/_emails/_phones/_addresses),
-- re-point all 26 FKs off the dead `contacts` table onto accounts(id), and deprecate
-- `contacts`. Re-verified live 2026-06-28: contacts = 0 rows; call_sessions.contact_id
-- all NULL; all 26 dependent FK columns empty -> PHASE 2 is pure DDL, zero rows move.
--
-- Corrects the parked DRAFT: accounts has NO first_name/last_name columns (only `name`),
-- so PHASE 1 populates display_name/org_name/type from accounts and backfills the
-- contact-detail tables from accounts.email / phone_e164 / address_*.
--
-- Reversal: DELETE FROM insured_* (they were empty); re-point the 26 FKs back to
-- contacts(id) with the original delete rules; uncomment is via symmetric ALTERs.
-- 2026-06-28
-- =====================================================================

-- ---------------------------------------------------------------------
-- PHASE 1 — populate the account-centric party layer
-- ---------------------------------------------------------------------
INSERT INTO public.insured_profiles (account_id, display_name, org_name, type, status, created_at, updated_at)
SELECT a.id, a.name,
       CASE WHEN a.type::text <> 'household' THEN a.name END,
       a.type::text, 'active', now(), now()
FROM public.accounts a
WHERE a.deleted_at IS NULL
ON CONFLICT (account_id) DO NOTHING;

INSERT INTO public.insured_emails (account_id, email, is_primary, created_at, updated_at)
SELECT a.id, lower(btrim(a.email)), true, now(), now()
FROM public.accounts a
WHERE a.deleted_at IS NULL AND nullif(btrim(a.email), '') IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.insured_phones (account_id, e164, is_primary, created_at, updated_at)
SELECT a.id, a.phone_e164, true, now(), now()
FROM public.accounts a
WHERE a.deleted_at IS NULL AND a.phone_e164 IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.insured_addresses (account_id, line1, line2, city, state, postal_code, is_primary, created_at, updated_at)
SELECT a.id, btrim(a.address_line1), nullif(btrim(a.address_line2), ''),
       nullif(btrim(a.city), ''), nullif(btrim(a.state), ''), nullif(btrim(a.zip_code), ''),
       true, now(), now()
FROM public.accounts a
WHERE a.deleted_at IS NULL
  AND nullif(btrim(a.address_line1), '') IS NOT NULL
  AND nullif(btrim(a.city), '')          IS NOT NULL  -- insured_addresses requires line1+city+state+postal_code
  AND nullif(btrim(a.state), '')         IS NOT NULL
  AND nullif(btrim(a.zip_code), '')      IS NOT NULL
ON CONFLICT DO NOTHING;

UPDATE public.insured_profiles ip SET
  primary_email_id   = (SELECT e.id  FROM public.insured_emails    e  WHERE e.account_id  = ip.account_id ORDER BY e.created_at  LIMIT 1),
  primary_phone_id   = (SELECT p.id  FROM public.insured_phones    p  WHERE p.account_id  = ip.account_id ORDER BY p.created_at  LIMIT 1),
  primary_address_id = (SELECT ad.id FROM public.insured_addresses ad WHERE ad.account_id = ip.account_id ORDER BY ad.created_at LIMIT 1),
  updated_at = now()
WHERE ip.deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- PHASE 2 — re-point all 26 contacts FKs onto accounts(id), preserving delete-rule.
-- Columns keep their name (contact_id) to minimise app churn. Tables EMPTY -> no data moves.
-- ---------------------------------------------------------------------

-- NO ACTION (10)
ALTER TABLE public.accounts                     DROP CONSTRAINT accounts_contact_id_fkey;
ALTER TABLE public.accounts                     ADD  CONSTRAINT accounts_contact_account_fkey                     FOREIGN KEY (contact_id)         REFERENCES public.accounts(id) ON DELETE NO ACTION;
ALTER TABLE public.businesses                   DROP CONSTRAINT businesses_primary_contact_id_fkey;
ALTER TABLE public.businesses                   ADD  CONSTRAINT businesses_primary_account_fkey                   FOREIGN KEY (primary_contact_id) REFERENCES public.accounts(id) ON DELETE NO ACTION;
ALTER TABLE public.call_sessions                DROP CONSTRAINT call_sessions_contact_id_fkey;
ALTER TABLE public.call_sessions                ADD  CONSTRAINT call_sessions_contact_account_fkey                FOREIGN KEY (contact_id)         REFERENCES public.accounts(id) ON DELETE NO ACTION;
ALTER TABLE public.client_portal_users          DROP CONSTRAINT client_portal_users_contact_id_fkey;
ALTER TABLE public.client_portal_users          ADD  CONSTRAINT client_portal_users_contact_account_fkey          FOREIGN KEY (contact_id)         REFERENCES public.accounts(id) ON DELETE NO ACTION;
ALTER TABLE public.commercial_business_accounts DROP CONSTRAINT commercial_business_accounts_primary_contact_id_fkey;
ALTER TABLE public.commercial_business_accounts ADD  CONSTRAINT commercial_business_accounts_primary_account_fkey FOREIGN KEY (primary_contact_id) REFERENCES public.accounts(id) ON DELETE NO ACTION;
ALTER TABLE public.household_accounts           DROP CONSTRAINT household_accounts_head_contact_id_fkey;
ALTER TABLE public.household_accounts           ADD  CONSTRAINT household_accounts_head_account_fkey              FOREIGN KEY (head_contact_id)    REFERENCES public.accounts(id) ON DELETE NO ACTION;
ALTER TABLE public.household_accounts           DROP CONSTRAINT household_accounts_spouse_contact_id_fkey;
ALTER TABLE public.household_accounts           ADD  CONSTRAINT household_accounts_spouse_account_fkey            FOREIGN KEY (spouse_contact_id)  REFERENCES public.accounts(id) ON DELETE NO ACTION;
ALTER TABLE public.portal_invitations           DROP CONSTRAINT portal_invitations_contact_id_fkey;
ALTER TABLE public.portal_invitations           ADD  CONSTRAINT portal_invitations_contact_account_fkey           FOREIGN KEY (contact_id)         REFERENCES public.accounts(id) ON DELETE NO ACTION;
ALTER TABLE public.sms_messages                 DROP CONSTRAINT sms_messages_contact_id_fkey;
ALTER TABLE public.sms_messages                 ADD  CONSTRAINT sms_messages_contact_account_fkey                 FOREIGN KEY (contact_id)         REFERENCES public.accounts(id) ON DELETE NO ACTION;
ALTER TABLE public.tickets                      DROP CONSTRAINT tickets_contact_id_fkey;
ALTER TABLE public.tickets                      ADD  CONSTRAINT tickets_contact_account_fkey                      FOREIGN KEY (contact_id)         REFERENCES public.accounts(id) ON DELETE NO ACTION;

-- CASCADE (9)
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

-- SET NULL (7)
ALTER TABLE public.communication_evidence DROP CONSTRAINT communication_evidence_to_contact_id_fkey;
ALTER TABLE public.communication_evidence ADD  CONSTRAINT communication_evidence_to_account_fkey   FOREIGN KEY (to_contact_id)      REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.consent_ledger         DROP CONSTRAINT consent_ledger_contact_id_fkey;
ALTER TABLE public.consent_ledger         ADD  CONSTRAINT consent_ledger_account_fkey              FOREIGN KEY (contact_id)         REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.households             DROP CONSTRAINT households_primary_contact_id_fkey;
ALTER TABLE public.households             ADD  CONSTRAINT households_primary_contact_account_fkey  FOREIGN KEY (primary_contact_id) REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.marketing_send_queue   DROP CONSTRAINT marketing_send_queue_to_contact_id_fkey;
ALTER TABLE public.marketing_send_queue   ADD  CONSTRAINT marketing_send_queue_to_account_fkey     FOREIGN KEY (to_contact_id)      REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.nps_responses          DROP CONSTRAINT nps_responses_contact_id_fkey;
ALTER TABLE public.nps_responses          ADD  CONSTRAINT nps_responses_account_fkey               FOREIGN KEY (contact_id)         REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.review_requests        DROP CONSTRAINT review_requests_contact_id_fkey;
ALTER TABLE public.review_requests        ADD  CONSTRAINT review_requests_account_fkey             FOREIGN KEY (contact_id)         REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.reviews                DROP CONSTRAINT reviews_contact_id_fkey;
ALTER TABLE public.reviews                ADD  CONSTRAINT reviews_account_fkey                     FOREIGN KEY (contact_id)         REFERENCES public.accounts(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- PHASE 3 — deprecate contacts (DROP deferred to a later release with no readers)
-- ---------------------------------------------------------------------
COMMENT ON TABLE public.contacts IS 'DEPRECATED 2026-06-28 (Batch 1C) — party layer is accounts + insured_*. Zero inbound FKs. Pending DROP after a release with no readers.';
