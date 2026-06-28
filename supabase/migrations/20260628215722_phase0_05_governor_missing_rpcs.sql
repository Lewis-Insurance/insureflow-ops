-- Phase-0 (5/n) — the 2 RPCs the marketing-send-governor expects but that are MISSING (PLAN-INT-B §3.5).
CREATE OR REPLACE FUNCTION public.claim_marketing_queue_items(p_processor_id text, p_limit int DEFAULT 50)
RETURNS SETOF public.marketing_send_queue
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  UPDATE public.marketing_send_queue q
     SET status = 'claimed', processor_id = p_processor_id,
         claimed_at = now(), claim_expires_at = now() + interval '5 minutes'
   WHERE q.id IN (
     SELECT s.id FROM public.marketing_send_queue s
      WHERE s.status = 'pending' AND s.scheduled_for <= now()
      ORDER BY s.priority ASC, s.scheduled_for ASC
      FOR UPDATE SKIP LOCKED LIMIT GREATEST(p_limit, 0))
  RETURNING q.*;
END $$;
CREATE OR REPLACE FUNCTION public.increment_contact_frequency(
  p_org_id uuid, p_contact_id uuid, p_household_id uuid, p_classification text, p_channel text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.contact_send_frequency
    (org_id, contact_id, household_id, date, marketing_count, relationship_count, transactional_count, email_count, sms_count)
  VALUES (p_org_id, p_contact_id, p_household_id, current_date,
    CASE WHEN p_classification='marketing' THEN 1 ELSE 0 END,
    CASE WHEN p_classification='relationship' THEN 1 ELSE 0 END,
    CASE WHEN p_classification='transactional' THEN 1 ELSE 0 END,
    CASE WHEN p_channel='email' THEN 1 ELSE 0 END,
    CASE WHEN p_channel='sms' THEN 1 ELSE 0 END)
  ON CONFLICT (org_id, contact_id, date) DO UPDATE SET
    marketing_count = public.contact_send_frequency.marketing_count + EXCLUDED.marketing_count,
    relationship_count = public.contact_send_frequency.relationship_count + EXCLUDED.relationship_count,
    transactional_count = public.contact_send_frequency.transactional_count + EXCLUDED.transactional_count,
    email_count = public.contact_send_frequency.email_count + EXCLUDED.email_count,
    sms_count = public.contact_send_frequency.sms_count + EXCLUDED.sms_count, updated_at = now();
END $$;
REVOKE EXECUTE ON FUNCTION public.claim_marketing_queue_items(text, int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_marketing_queue_items(text, int) TO service_role;
REVOKE EXECUTE ON FUNCTION public.increment_contact_frequency(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.increment_contact_frequency(uuid, uuid, uuid, text, text) TO service_role;
