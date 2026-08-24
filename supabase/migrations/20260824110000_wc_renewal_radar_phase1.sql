-- WC Renewal Radar Phase 1: cancel/SWO pre-lead facts and compliance receipts.
-- The radar stops at handed_off; the existing leads/tasks surfaces own all CRM work.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE FUNCTION public.normalize_radar_employer_name(p_value text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT regexp_replace(lower(replace(coalesce(p_value,''),'&',' and ')),'[^a-z0-9]','','g')
$$;

-- Composite uniqueness lets radar foreign keys prove tenant consistency.
ALTER TABLE public.leads ADD CONSTRAINT leads_id_workspace_radar_unique
  UNIQUE (id, agency_workspace_id);
ALTER TABLE public.accounts ADD CONSTRAINT accounts_id_workspace_radar_unique
  UNIQUE (id, agency_workspace_id);

CREATE TABLE public.radar_config (
  agency_workspace_id uuid PRIMARY KEY REFERENCES public.agency_workspaces(id) ON DELETE CASCADE,
  score_threshold smallint NOT NULL DEFAULT 70 CHECK (score_threshold BETWEEN 0 AND 100),
  producer_weekly_capacity integer NOT NULL DEFAULT 0 CHECK (producer_weekly_capacity >= 0),
  capacity_multiplier numeric(4,2) NOT NULL DEFAULT 2 CHECK (capacity_multiplier > 0),
  untouched_expiry_days smallint NOT NULL DEFAULT 14 CHECK (untouched_expiry_days > 0),
  class_allowlist text[] NOT NULL DEFAULT '{}',
  letter_template_ids uuid[] NOT NULL DEFAULT '{}',
  fallback_names text[] NOT NULL DEFAULT ARRAY['Brian Lewis', 'Landen Lewis'],
  sms_enabled boolean NOT NULL DEFAULT false,
  swo_source_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.poc_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_workspace_id uuid NOT NULL REFERENCES public.agency_workspaces(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('cancel', 'swo')),
  filename text NOT NULL,
  storage_path text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  row_count integer NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, agency_workspace_id),
  UNIQUE (agency_workspace_id, sha256)
);

CREATE TABLE public.poc_staging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_workspace_id uuid NOT NULL REFERENCES public.agency_workspaces(id) ON DELETE CASCADE,
  poc_upload_id uuid NOT NULL,
  row_number integer NOT NULL CHECK (row_number > 0),
  kind text NOT NULL CHECK (kind IN ('cancel', 'swo')),
  employer_name text,
  fein text,
  county text,
  policy_number text,
  carrier text,
  expiration_date date,
  class_code text,
  estimated_premium numeric(14,2),
  agency_of_record text,
  peo_client boolean NOT NULL DEFAULT false,
  raw_row jsonb NOT NULL DEFAULT '{}',
  source_row_hash text NOT NULL CHECK (source_row_hash ~ '^[a-f0-9]{64}$'),
  parse_errors text[] NOT NULL DEFAULT '{}',
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (poc_upload_id, row_number),
  UNIQUE (agency_workspace_id, source_row_hash),
  FOREIGN KEY (poc_upload_id, agency_workspace_id)
    REFERENCES public.poc_uploads(id, agency_workspace_id) ON DELETE CASCADE
);

CREATE INDEX poc_staging_unprocessed_idx
  ON public.poc_staging (agency_workspace_id, created_at)
  WHERE processed_at IS NULL AND cardinality(parse_errors) = 0;

CREATE TABLE public.renewal_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_workspace_id uuid NOT NULL REFERENCES public.agency_workspaces(id) ON DELETE CASCADE,
  employer_name text NOT NULL,
  county text,
  fein text,
  policy_number text,
  carrier text,
  expiration_date date,
  kind text NOT NULL CHECK (kind IN ('cancel', 'swo')),
  class_code text,
  estimated_premium numeric(14,2),
  source text NOT NULL,
  source_row_hash text NOT NULL CHECK (source_row_hash ~ '^[a-f0-9]{64}$'),
  last_verified_at timestamptz,
  poc_upload_id uuid,
  agency_of_record text,
  peo_client boolean NOT NULL DEFAULT false,
  exclusion text NOT NULL DEFAULT 'none'
    CHECK (exclusion IN ('none', 'peo', 'own_client', 'lewis_aor', 'class')),
  dedup_key text NOT NULL,
  radar_score smallint CHECK (radar_score BETWEEN 0 AND 100),
  score_factors jsonb NOT NULL DEFAULT '{}',
  scored_at timestamptz,
  lead_id uuid,
  stage text NOT NULL DEFAULT 'new'
    CHECK (stage IN ('new', 'queued', 'tasked', 'handed_off', 'expired', 'excluded')),
  expiration_reason text CHECK (expiration_reason IS NULL OR expiration_reason = 'capacity_overflow'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (stage <> 'handed_off' OR lead_id IS NOT NULL),
  CHECK (stage <> 'excluded' OR exclusion <> 'none'),
  UNIQUE (agency_workspace_id, source_row_hash),
  UNIQUE (id, agency_workspace_id),
  UNIQUE (agency_workspace_id, dedup_key),
  FOREIGN KEY (poc_upload_id, agency_workspace_id)
    REFERENCES public.poc_uploads(id, agency_workspace_id) ON DELETE SET NULL (poc_upload_id),
  FOREIGN KEY (lead_id, agency_workspace_id)
    REFERENCES public.leads(id, agency_workspace_id) ON DELETE SET NULL (lead_id)
);

CREATE INDEX renewal_opportunities_queue_idx
  ON public.renewal_opportunities (agency_workspace_id, stage, radar_score DESC)
  WHERE exclusion = 'none';
CREATE INDEX renewal_opportunities_employer_trgm_idx
  ON public.renewal_opportunities USING gin (employer_name gin_trgm_ops);
CREATE INDEX renewal_opportunities_lead_idx
  ON public.renewal_opportunities (lead_id) WHERE lead_id IS NOT NULL;

CREATE FUNCTION public.enforce_radar_handoff_terminal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.stage = 'handed_off' AND NEW.stage IS DISTINCT FROM OLD.stage THEN
    RAISE EXCEPTION 'renewal opportunity % is terminal after handed_off', OLD.id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER renewal_opportunities_handoff_terminal
BEFORE UPDATE ON public.renewal_opportunities
FOR EACH ROW EXECUTE FUNCTION public.enforce_radar_handoff_terminal();

CREATE FUNCTION public.radar_create_task_if_capacity(p_opportunity_id uuid, p_created_by uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.renewal_opportunities%ROWTYPE; c public.radar_config%ROWTYPE; used integer;
BEGIN
  SELECT * INTO v FROM public.renewal_opportunities WHERE id=p_opportunity_id FOR UPDATE;
  IF NOT FOUND OR v.stage NOT IN ('new','queued') OR v.exclusion <> 'none' OR v.radar_score IS NULL THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v.agency_workspace_id::text, 8142026));
  SELECT * INTO c FROM public.radar_config WHERE agency_workspace_id=v.agency_workspace_id;
  IF NOT FOUND OR cardinality(c.class_allowlist)=0 OR v.radar_score < c.score_threshold THEN RETURN false; END IF;
  SELECT count(*) INTO used FROM public.tasks t
    JOIN public.renewal_opportunities ro ON ro.id=t.entity_id
    WHERE ro.agency_workspace_id=v.agency_workspace_id AND t.source='wc_renewal_radar'
      AND t.entity_type='renewal_opportunity' AND t.created_at >= now()-interval '7 days';
  IF used >= floor(c.producer_weekly_capacity*c.capacity_multiplier) THEN RETURN false; END IF;
  INSERT INTO public.tasks(title,description,category,source,entity_type,entity_id,related_lead_id,metadata,dedupe_key,priority,status,created_by)
  VALUES ((CASE WHEN v.kind='swo' THEN 'SWO' ELSE 'Cancellation' END)||' workers compensation advisory: '||v.employer_name,
    'State records indicate this employer''s workers compensation coverage may require timely review.',
    'renewal','wc_renewal_radar','renewal_opportunity',v.id,NULL,
    jsonb_build_object('radar_kind',v.kind,'opportunity_id',v.id,'hedge',true,'letter_first',true,
      'letter_artifact',jsonb_build_object('version','radar-letter-v1','delivery','physical_mail','employer_name',v.employer_name,
        'body','State records indicate your workers compensation coverage may require timely review. A licensed Lewis Insurance agent is available to discuss an advisory review.')),
    'wc_renewal_radar:'||v.id,'high','pending',p_created_by)
  ON CONFLICT (dedupe_key) DO NOTHING;
  UPDATE public.renewal_opportunities SET stage='tasked',updated_at=now() WHERE id=v.id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.radar_create_task_if_capacity(uuid,uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.radar_create_task_if_capacity(uuid,uuid) TO service_role;

CREATE TABLE public.compliance_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_workspace_id uuid NOT NULL REFERENCES public.agency_workspaces(id) ON DELETE CASCADE,
  opportunity_id uuid,
  contact_id uuid,
  channel text NOT NULL CHECK (channel IN ('email', 'sms', 'letter')),
  destination text NOT NULL,
  dnc_phone text NOT NULL,
  recipient_timezone text NOT NULL,
  licensed_agent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  license_number text NOT NULL CHECK (btrim(license_number) <> ''),
  pewc boolean NOT NULL DEFAULT false,
  pewc_phone text,
  dnc_national_at timestamptz,
  dnc_fdacs_at timestamptz,
  hours_ok boolean NOT NULL DEFAULT false,
  fresh_through timestamptz NOT NULL,
  passed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'failed' CHECK (status IN ('passed', 'failed')),
  failure_reasons jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status = 'passed' AND passed OR status = 'failed' AND NOT passed),
  CHECK (channel <> 'sms' OR NOT passed OR (pewc AND pewc_phone = destination)),
  CHECK (NOT passed OR (fresh_through >= created_at AND fresh_through <= created_at + interval '7 days')),
  CHECK (NOT passed OR hours_ok),
  CHECK (NOT passed OR (
    dnc_national_at BETWEEN created_at - interval '31 days' AND created_at
    AND dnc_fdacs_at BETWEEN created_at - interval '31 days' AND created_at
  )),
  FOREIGN KEY (opportunity_id, agency_workspace_id)
    REFERENCES public.renewal_opportunities(id, agency_workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id, agency_workspace_id)
    REFERENCES public.accounts(id, agency_workspace_id) ON DELETE SET NULL (contact_id)
);

CREATE INDEX compliance_checks_lookup_idx
  ON public.compliance_checks (agency_workspace_id, opportunity_id, created_at DESC);
CREATE INDEX compliance_checks_destination_idx
  ON public.compliance_checks (agency_workspace_id, destination, created_at DESC);

-- The canonical book comes from accounts/policies. Canopy's normalized insured FEIN
-- is included when that pull is linked to the same account.
CREATE VIEW public.own_book_employers
WITH (security_invoker = true)
AS
SELECT DISTINCT
  a.agency_workspace_id,
  a.id AS account_id,
  COALESCE(NULLIF(p.named_insured, ''), NULLIF(a.name_display, ''), a.name) AS employer_name,
  public.normalize_radar_employer_name(COALESCE(NULLIF(p.named_insured, ''), NULLIF(a.name_display, ''), a.name)) AS normalized_employer_name,
  COALESCE(NULLIF(p.fein, ''), NULLIF(cni.fein, '')) AS fein,
  p.policy_number,
  p.carrier,
  p.id AS policy_id
FROM public.accounts a
JOIN public.policies p ON p.account_id = a.id AND p.deleted_at IS NULL
LEFT JOIN public.canopy_pulls cpull ON cpull.account_id = a.id
LEFT JOIN public.canopy_policies cpol ON cpol.pull_id = cpull.id
  AND NULLIF(regexp_replace(upper(cpol.policy_number), '[^A-Z0-9]', '', 'g'), '')
      = NULLIF(regexp_replace(upper(p.policy_number), '[^A-Z0-9]', '', 'g'), '')
LEFT JOIN public.canopy_named_insureds cni ON cni.policy_id = cpol.id AND cni.is_primary IS TRUE
WHERE a.agency_workspace_id IS NOT NULL
  AND a.deleted_at IS NULL;

-- Return one JSON value so PostgREST's row limit cannot truncate large agency books.
-- The payload intentionally contains only the fields used by Radar's two match keys.
CREATE FUNCTION public.radar_own_book_match_keys(p_agency_workspace_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    jsonb_agg(DISTINCT jsonb_build_object(
      'policy_number', book.policy_number,
      'carrier', book.carrier,
      'normalized_employer_name', book.normalized_employer_name,
      'fein', book.fein
    )),
    '[]'::jsonb
  )
  FROM public.own_book_employers AS book
  WHERE book.agency_workspace_id = p_agency_workspace_id;
$$;

REVOKE ALL ON FUNCTION public.radar_own_book_match_keys(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.radar_own_book_match_keys(uuid) TO service_role;

-- A radar queue row still travels through the existing marketing governor.
ALTER TABLE public.marketing_send_queue
  DROP CONSTRAINT IF EXISTS marketing_send_queue_source_type_check;
ALTER TABLE public.marketing_send_queue
  ADD CONSTRAINT marketing_send_queue_source_type_check
  CHECK (source_type IN ('campaign', 'automation', 'manual', 'system', 'wc_renewal_radar'));
ALTER TABLE public.marketing_send_queue
  ADD COLUMN compliance_check_id uuid REFERENCES public.compliance_checks(id) ON DELETE RESTRICT;
ALTER TABLE public.marketing_send_queue
  ADD COLUMN agency_workspace_id uuid REFERENCES public.agency_workspaces(id) ON DELETE CASCADE,
  ADD COLUMN radar_lead_id uuid,
  ADD COLUMN normalized_destination text,
  ADD CONSTRAINT radar_queue_workspace_required
    CHECK (source_type <> 'wc_renewal_radar' OR (agency_workspace_id IS NOT NULL AND radar_lead_id IS NOT NULL AND compliance_check_id IS NOT NULL)),
  ADD CONSTRAINT radar_queue_lead_source_consistent
    CHECK (radar_lead_id IS NULL OR source_type='wc_renewal_radar'),
  ADD FOREIGN KEY (radar_lead_id,agency_workspace_id)
    REFERENCES public.leads(id,agency_workspace_id) ON DELETE RESTRICT;
ALTER TABLE public.marketing_send_queue
  DROP CONSTRAINT IF EXISTS marketing_send_queue_status_check;
ALTER TABLE public.marketing_send_queue
  ADD CONSTRAINT marketing_send_queue_status_check CHECK (status IN (
    'pending','claimed','processing','sent','delivered','failed','cancelled',
    'suppressed','rate_limited','preference_stale','delivery_unknown'
  ));
ALTER TABLE public.communication_evidence
  ADD COLUMN compliance_check_id uuid REFERENCES public.compliance_checks(id) ON DELETE RESTRICT,
  ADD COLUMN license_number text;
CREATE UNIQUE INDEX marketing_send_queue_compliance_check_idx
  ON public.marketing_send_queue (compliance_check_id)
  WHERE compliance_check_id IS NOT NULL;

CREATE FUNCTION public.enforce_radar_queue_provenance() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.renewal_opportunities%ROWTYPE; c public.compliance_checks%ROWTYPE;
BEGIN
  IF TG_OP='UPDATE' AND OLD.source_type='wc_renewal_radar' AND
    (NEW.source_type,NEW.source_id,NEW.agency_workspace_id,NEW.radar_lead_id,NEW.compliance_check_id)
      IS DISTINCT FROM (OLD.source_type,OLD.source_id,OLD.agency_workspace_id,OLD.radar_lead_id,OLD.compliance_check_id) THEN
    RAISE EXCEPTION 'Radar queue provenance is immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.source_type<>'wc_renewal_radar' THEN
    SELECT ro.* INTO o
    FROM public.renewal_opportunities ro
    JOIN public.leads l ON l.id=ro.lead_id AND l.agency_workspace_id=ro.agency_workspace_id
    WHERE ro.stage='handed_off'
      AND ro.agency_workspace_id=coalesce(NEW.agency_workspace_id,public.get_agency_from_legacy_org(NEW.org_id))
      AND (
      (NEW.to_contact_id IS NOT NULL AND l.account_id=NEW.to_contact_id)
      OR (l.account_id IS NULL AND NEW.channel='email' AND lower(btrim(l.email))=lower(btrim(NEW.to_email)))
      OR (l.account_id IS NULL AND NEW.channel='sms'
          AND regexp_replace(coalesce(l.phone,''),'[^0-9]','','g')=regexp_replace(coalesce(NEW.to_phone,''),'[^0-9]','','g'))
    ) LIMIT 1;
    IF o.id IS NOT NULL THEN
      IF TG_OP='INSERT' THEN
        RAISE EXCEPTION 'Radar-derived recipient requires guarded enqueue provenance' USING ERRCODE='23514';
      END IF;
      NEW.status := 'suppressed';
      NEW.last_error := 'Suppressed: Radar-derived recipient requires guarded enqueue provenance';
      NEW.processor_id := NULL;
      NEW.claimed_at := NULL;
      NEW.claim_expires_at := NULL;
      RETURN NEW;
    END IF;
  ELSE
    SELECT * INTO o FROM public.renewal_opportunities WHERE id=NEW.source_id AND agency_workspace_id=NEW.agency_workspace_id;
    SELECT * INTO c FROM public.compliance_checks WHERE id=NEW.compliance_check_id AND agency_workspace_id=NEW.agency_workspace_id;
    IF o.id IS NULL OR o.stage<>'handed_off' OR o.lead_id IS DISTINCT FROM NEW.radar_lead_id OR c.id IS NULL
       OR NOT c.passed OR c.opportunity_id IS DISTINCT FROM o.id OR c.licensed_agent_id IS DISTINCT FROM NEW.from_user_id THEN
      RAISE EXCEPTION 'invalid Radar queue provenance' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER marketing_send_queue_radar_provenance
BEFORE INSERT OR UPDATE ON public.marketing_send_queue FOR EACH ROW EXECUTE FUNCTION public.enforce_radar_queue_provenance();

CREATE FUNCTION public.enqueue_guarded_radar_touch(
  p_compliance_check_id uuid,
  p_lead_id uuid,
  p_channel text,
  p_destination text,
  p_from_user_id uuid,
  p_idempotency_key text,
  p_payload jsonb,
  p_automation_step_id uuid DEFAULT NULL,
  p_automation_enrollment_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.compliance_checks%ROWTYPE;
  o public.renewal_opportunities%ROWTYPE;
  l public.leads%ROWTYPE;
  legacy_org uuid;
  queue_id uuid;
  normalized_destination text;
BEGIN
  SELECT * INTO c FROM public.compliance_checks WHERE id=p_compliance_check_id FOR SHARE;
  SELECT * INTO o FROM public.renewal_opportunities WHERE id=c.opportunity_id FOR SHARE;
  SELECT * INTO l FROM public.leads WHERE id=p_lead_id FOR SHARE;
  normalized_destination := CASE WHEN p_channel='sms'
    THEN CASE WHEN regexp_replace(coalesce(p_destination,''),'[^0-9]','','g') ~ '^1[0-9]{10}$'
      THEN '+'||regexp_replace(p_destination,'[^0-9]','','g')
      WHEN regexp_replace(coalesce(p_destination,''),'[^0-9]','','g') ~ '^[0-9]{10}$'
      THEN '+1'||regexp_replace(p_destination,'[^0-9]','','g') ELSE '' END
    ELSE lower(btrim(coalesce(p_destination,''))) END;
  IF c.id IS NULL OR NOT c.passed OR c.status<>'passed' OR c.fresh_through<now()
     OR c.channel<>p_channel OR c.destination<>normalized_destination
     OR c.licensed_agent_id<>p_from_user_id OR o.id IS NULL OR o.stage<>'handed_off'
     OR o.lead_id<>l.id OR o.agency_workspace_id<>l.agency_workspace_id
     OR c.opportunity_id<>o.id OR c.agency_workspace_id<>o.agency_workspace_id
     OR c.contact_id IS DISTINCT FROM l.account_id
     OR p_channel NOT IN ('email','sms') OR btrim(coalesce(p_idempotency_key,''))='' THEN
    RAISE EXCEPTION 'invalid or stale guarded Radar touch' USING ERRCODE='23514';
  END IF;
  SELECT legacy_org_id INTO legacy_org FROM public.agency_workspace_legacy_org_map
  WHERE agency_workspace_id=o.agency_workspace_id ORDER BY migrated_at DESC LIMIT 1;
  IF legacy_org IS NULL THEN RAISE EXCEPTION 'Radar workspace has no legacy marketing org mapping' USING ERRCODE='23514'; END IF;

  INSERT INTO public.marketing_send_queue(
    org_id,agency_workspace_id,radar_lead_id,compliance_check_id,idempotency_key,
    priority,scheduled_for,channel,classification,from_user_id,to_contact_id,to_account_id,
    to_email,to_phone,source_type,source_id,automation_step_id,automation_enrollment_id
  ) VALUES (
    legacy_org,o.agency_workspace_id,l.id,c.id,p_idempotency_key,
    5,now(),p_channel,'marketing',p_from_user_id,l.account_id,l.account_id,
    CASE WHEN p_channel='email' THEN normalized_destination END,
    CASE WHEN p_channel='sms' THEN normalized_destination END,
    'wc_renewal_radar',o.id,p_automation_step_id,p_automation_enrollment_id
  ) RETURNING id INTO queue_id;

  INSERT INTO public.marketing_send_queue_payloads(
    queue_id,org_id,channel,email_subject,email_body_html,email_body_text,sms_message,
    template_id,template_version_id,unsubscribe_url,merge_context,compliance_validated
  ) VALUES (
    queue_id,legacy_org,p_channel,p_payload->>'email_subject',p_payload->>'email_body_html',
    p_payload->>'email_body_text',p_payload->>'sms_message',
    nullif(p_payload->>'template_id','')::uuid,nullif(p_payload->>'template_version_id','')::uuid,
    p_payload->>'unsubscribe_url',coalesce(p_payload->'merge_context','{}'::jsonb),true
  );
  RETURN queue_id;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_guarded_radar_touch(uuid,uuid,text,text,uuid,text,jsonb,uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_guarded_radar_touch(uuid,uuid,text,text,uuid,text,jsonb,uuid,uuid)
  TO service_role;

-- The governor has no read-then-update fallback: claiming must be atomic or it
-- fails closed. SKIP LOCKED permits concurrent workers without duplicate sends.
CREATE OR REPLACE FUNCTION public.claim_marketing_queue_items(
  p_processor_id text,
  p_batch_size integer,
  p_expires_at timestamptz
)
RETURNS SETOF public.marketing_send_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF btrim(coalesce(p_processor_id, '')) = '' OR p_batch_size < 1 OR p_batch_size > 500
     OR p_expires_at <= now() OR p_expires_at > now() + interval '15 minutes' THEN
    RAISE EXCEPTION 'invalid marketing queue claim parameters' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT q.id
    FROM public.marketing_send_queue q
    WHERE q.status IN ('pending', 'rate_limited')
      AND q.scheduled_for <= now()
      AND (q.next_retry_at IS NULL OR q.next_retry_at <= now())
    ORDER BY q.priority, q.scheduled_for, q.id
    FOR UPDATE SKIP LOCKED
    LIMIT p_batch_size
  )
  UPDATE public.marketing_send_queue q
  SET status = 'claimed', processor_id = p_processor_id, claimed_at = now(),
      claim_expires_at = p_expires_at, updated_at = now()
  FROM candidates c
  WHERE q.id = c.id
  RETURNING q.*;
END $$;
REVOKE ALL ON FUNCTION public.claim_marketing_queue_items(text,integer,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_marketing_queue_items(text,integer,timestamptz)
  TO service_role;

CREATE FUNCTION public.reserve_radar_send_attempt(p_queue_id uuid,p_compliance_check_id uuid,p_normalized_phone text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q public.marketing_send_queue%ROWTYPE; c public.compliance_checks%ROWTYPE; used integer;
BEGIN
  IF p_normalized_phone !~ '^\+[1-9][0-9]{7,14}$' THEN RETURN jsonb_build_object('allowed',false,'reason','invalid_phone'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_normalized_phone,8142026));
  SELECT * INTO q FROM public.marketing_send_queue WHERE id=p_queue_id FOR UPDATE;
  SELECT * INTO c FROM public.compliance_checks WHERE id=p_compliance_check_id;
  IF NOT FOUND OR NOT c.passed OR c.fresh_through < now() OR c.dnc_phone<>p_normalized_phone THEN
    RETURN jsonb_build_object('allowed',false,'reason','invalid_compliance_check');
  END IF;
  IF q.compliance_check_id IS DISTINCT FROM c.id OR q.source_type<>'wc_renewal_radar'
     OR q.agency_workspace_id IS DISTINCT FROM c.agency_workspace_id THEN
    RETURN jsonb_build_object('allowed',false,'reason','queue_receipt_mismatch');
  END IF;
  SELECT coalesce(sum(attempts),0) INTO used FROM public.marketing_send_queue
    WHERE normalized_destination=p_normalized_phone AND last_attempt_at >= now()-interval '24 hours';
  IF used >= 3 THEN RETURN jsonb_build_object('allowed',false,'reason','attempt_cap','attempts',used); END IF;
  UPDATE public.marketing_send_queue SET normalized_destination=p_normalized_phone,attempts=coalesce(attempts,0)+1,last_attempt_at=now() WHERE id=q.id;
  RETURN jsonb_build_object('allowed',true,'attempts',used+1);
END $$;
REVOKE ALL ON FUNCTION public.reserve_radar_send_attempt(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_radar_send_attempt(uuid,uuid,text) TO service_role;

ALTER TABLE public.radar_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poc_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poc_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renewal_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_checks ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.is_radar_workspace_member(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agency_workspace_memberships m
    WHERE m.agency_workspace_id = p_workspace_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
  ) AND public.is_staff();
$$;

REVOKE ALL ON FUNCTION public.is_radar_workspace_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_radar_workspace_member(uuid) TO authenticated;

CREATE FUNCTION public.configure_radar(p_workspace_id uuid,p_class_allowlist text[],p_score_threshold smallint DEFAULT 70,p_weekly_capacity integer DEFAULT 0)
RETURNS public.radar_config LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result public.radar_config;
BEGIN
  IF NOT public.is_staff() OR cardinality(p_class_allowlist)=0 OR p_score_threshold NOT BETWEEN 0 AND 100 OR p_weekly_capacity<0 OR NOT EXISTS(
    SELECT 1 FROM public.agency_workspace_memberships WHERE agency_workspace_id=p_workspace_id AND user_id=auth.uid() AND status='active' AND role IN ('owner','admin')
  ) THEN RAISE EXCEPTION 'invalid config or admin access required' USING ERRCODE='42501'; END IF;
  INSERT INTO public.radar_config(agency_workspace_id,class_allowlist,score_threshold,producer_weekly_capacity)
  VALUES(p_workspace_id,p_class_allowlist,p_score_threshold,p_weekly_capacity)
  ON CONFLICT(agency_workspace_id) DO UPDATE SET class_allowlist=excluded.class_allowlist,score_threshold=excluded.score_threshold,
    producer_weekly_capacity=excluded.producer_weekly_capacity,updated_at=now() RETURNING * INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.configure_radar(uuid,text[],smallint,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.configure_radar(uuid,text[],smallint,integer) TO authenticated;

CREATE POLICY radar_config_staff ON public.radar_config
  FOR SELECT TO authenticated USING (public.is_radar_workspace_member(agency_workspace_id));
CREATE POLICY poc_uploads_staff ON public.poc_uploads
  FOR SELECT TO authenticated USING (public.is_radar_workspace_member(agency_workspace_id));
CREATE POLICY poc_staging_staff ON public.poc_staging
  FOR SELECT TO authenticated USING (public.is_radar_workspace_member(agency_workspace_id));
CREATE POLICY renewal_opportunities_staff ON public.renewal_opportunities
  FOR SELECT TO authenticated USING (public.is_radar_workspace_member(agency_workspace_id));
CREATE POLICY compliance_checks_staff ON public.compliance_checks
  FOR SELECT TO authenticated USING (public.is_radar_workspace_member(agency_workspace_id));

REVOKE ALL ON public.radar_config, public.poc_uploads, public.poc_staging,
  public.renewal_opportunities, public.compliance_checks FROM anon;
GRANT SELECT ON public.radar_config, public.poc_uploads, public.poc_staging,
  public.renewal_opportunities, public.compliance_checks, public.own_book_employers TO authenticated;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('radar-poc-uploads','radar-poc-uploads',false,20000000,ARRAY['text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
ON CONFLICT (id) DO UPDATE SET public=false,file_size_limit=20000000,
  allowed_mime_types=ARRAY['text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
CREATE POLICY radar_poc_storage_staff_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='radar-poc-uploads' AND public.is_radar_workspace_member((storage.foldername(name))[1]::uuid));
CREATE POLICY radar_poc_storage_staff_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='radar-poc-uploads' AND public.is_radar_workspace_member((storage.foldername(name))[1]::uuid));

CREATE FUNCTION public.handoff_radar_opportunity(p_opportunity_id uuid,p_account_id uuid,p_first_name text,p_last_name text,p_email text DEFAULT NULL,p_phone text DEFAULT NULL,p_existing_lead_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.renewal_opportunities%ROWTYPE; result_id uuid;
BEGIN
  SELECT * INTO o FROM public.renewal_opportunities WHERE id=p_opportunity_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_radar_workspace_member(o.agency_workspace_id) THEN RAISE EXCEPTION 'not found or forbidden' USING ERRCODE='42501'; END IF;
  IF o.stage='handed_off' THEN RETURN o.lead_id; END IF;
  IF o.stage NOT IN ('tasked','queued') THEN RAISE EXCEPTION 'opportunity is not eligible for handoff' USING ERRCODE='23514'; END IF;
  IF p_account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=p_account_id AND agency_workspace_id=o.agency_workspace_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'account workspace mismatch' USING ERRCODE='23503';
  END IF;
  IF p_existing_lead_id IS NOT NULL THEN
    SELECT id INTO result_id FROM public.leads WHERE id=p_existing_lead_id AND agency_workspace_id=o.agency_workspace_id
      AND (p_account_id IS NULL OR account_id IS NULL OR account_id=p_account_id) FOR UPDATE;
    IF result_id IS NULL THEN RAISE EXCEPTION 'lead workspace mismatch' USING ERRCODE='23503'; END IF;
    UPDATE public.leads SET
      account_id=COALESCE(p_account_id,account_id),
      metadata=(CASE WHEN jsonb_typeof(metadata)='object' THEN metadata ELSE '{}'::jsonb END)
        || jsonb_build_object('radar_opportunity_id',o.id),
      updated_at=now()
    WHERE id=result_id;
  ELSE
    IF nullif(btrim(p_first_name),'') IS NULL OR nullif(btrim(p_last_name),'') IS NULL THEN RAISE EXCEPTION 'lead name required' USING ERRCODE='22023'; END IF;
    INSERT INTO public.leads(agency_workspace_id,account_id,first_name,last_name,email,phone,company_name,status,lead_source,source_id,created_by,metadata)
    VALUES(o.agency_workspace_id,p_account_id,btrim(p_first_name),btrim(p_last_name),nullif(btrim(p_email),''),nullif(btrim(p_phone),''),o.employer_name,'new','wc_renewal_radar',o.id::text,auth.uid(),jsonb_build_object('radar_opportunity_id',o.id)) RETURNING id INTO result_id;
  END IF;
  UPDATE public.renewal_opportunities SET lead_id=result_id,stage='handed_off',updated_at=now() WHERE id=o.id;
  UPDATE public.tasks SET related_lead_id=result_id,updated_at=now() WHERE source='wc_renewal_radar' AND entity_type='renewal_opportunity' AND entity_id=o.id;
  RETURN result_id;
END $$;
REVOKE ALL ON FUNCTION public.handoff_radar_opportunity(uuid,uuid,text,text,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.handoff_radar_opportunity(uuid,uuid,text,text,text,text,uuid) TO authenticated;

COMMENT ON TABLE public.renewal_opportunities IS
  'WC Radar pre-lead facts only. CRM ownership transfers to leads at terminal handed_off.';
COMMENT ON TABLE public.compliance_checks IS
  'Immutable receipts written by radar-compliance-guard; license facts live here, not on agents.';
COMMENT ON VIEW public.own_book_employers IS
  'Derived own-book exclusion surface over canonical accounts/policies with Canopy FEIN when linked.';
COMMENT ON FUNCTION public.radar_create_task_if_capacity(uuid,uuid) IS
  'Creates the deterministic physical-letter artifact inside task metadata; no physical-mail provider/product exists in the live platform.';

-- Run at both possible UTC offsets; the edge function executes only when New York local hour is 08.
SELECT cron.unschedule('radar-swo-pull-08-et') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='radar-swo-pull-08-et');
SELECT cron.schedule('radar-swo-pull-08-et','0 12,13 * * *',$$
  SELECT net.http_post(
    url := 'https://lrqajzwcmdwahnjyidgv.supabase.co/functions/v1/radar-swo-pull',
    headers := internal.get_cron_headers(),
    body := '{}'::jsonb
  );
$$);
