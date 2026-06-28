-- =====================================================================
-- Wave 4 · Business vs Personal classification (BIZ-0..BIZ-8)
-- =====================================================================
-- BIZ-5 exclusions; BIZ-2 Tier-1 auto-flip (named entity + commercial line) to
-- commercial_business (sets ONLY type; sync_account_types syncs account_type);
-- BIZ-4 commercial_business_accounts firmographics + business_type_id FK;
-- BIZ-8 soft-delete Blue Oak demo; BIZ-6 DQ view + guardrail trigger on policies
-- (auto-promotes ONLY clear business-name household accounts on a commercial-line
-- policy, skips sole-props + exclusions). Tier-2/3 -> review workbook (parked).
-- All reversible (cleanup.biz_reclass_snapshot). Date: 2026-06-28
-- =====================================================================

-- BIZ-5: false-positive / never-auto-flip exclusion list.
CREATE TABLE IF NOT EXISTS cleanup.reclass_exclusions (
  account_id uuid PRIMARY KEY, reason text NOT NULL, created_at timestamptz DEFAULT now()
);
ALTER TABLE cleanup.reclass_exclusions ENABLE ROW LEVEL SECURITY;
INSERT INTO cleanup.reclass_exclusions (account_id, reason)
SELECT id, 'agency-internal' FROM public.accounts WHERE name ILIKE 'Lewis %Lewis%Agency%'
UNION ALL SELECT '22222222-2222-4222-8222-222222222222', 'Blue Oak demo seed'
UNION ALL SELECT id, '%RANCH%/Branch surname FP' FROM public.accounts WHERE deleted_at IS NULL AND name IN ('Harry Branch','Shelia Branch')
UNION ALL SELECT id, 'trust/estate FP — route to review' FROM public.accounts WHERE deleted_at IS NULL AND name ILIKE 'Meredith Lapradd%Trustee%'
ON CONFLICT (account_id) DO NOTHING;

-- BIZ-2: snapshot, then flip Tier-1 (business name + commercial line, excl. exclusions/trust).
CREATE TABLE IF NOT EXISTS cleanup.biz_reclass_snapshot (
  account_id uuid PRIMARY KEY, old_type text, old_account_type text, captured_at timestamptz DEFAULT now()
);
ALTER TABLE cleanup.biz_reclass_snapshot ENABLE ROW LEVEL SECURITY;

INSERT INTO cleanup.biz_reclass_snapshot (account_id, old_type, old_account_type)
SELECT a.id, a.type::text, a.account_type::text
FROM public.accounts a
WHERE a.deleted_at IS NULL AND a.type::text='household'
  AND a.name ~* '\m(llc|inc|corp|corporation|pllc|llp|church|ministr|apostolic|baptist|advent|company|works|services|construction|cleaning|masonry|grain|productions|builders|apothecary|investments|tractor|plumbing|aluminum|properties|management|holdings|enterprises)\M'
  AND a.name !~* '\m(trust|trustee|estate)\M'
  AND EXISTS (SELECT 1 FROM public.policies p WHERE p.account_id=a.id AND p.deleted_at IS NULL AND p.line_category='commercial')
  AND a.id NOT IN (SELECT account_id FROM cleanup.reclass_exclusions)
ON CONFLICT (account_id) DO NOTHING;

UPDATE public.accounts SET type='commercial_business'
WHERE id IN (SELECT account_id FROM cleanup.biz_reclass_snapshot) AND type::text='household';

-- The existing sync_account_types trigger does NOT resolve 'commercial_business'
-- (pick_enum_label gap), so it never syncs account_type here. Set the legacy
-- account_type explicitly for consistency (type remains the authoritative column).
UPDATE public.accounts SET account_type='business'
WHERE id IN (SELECT account_id FROM cleanup.biz_reclass_snapshot) AND account_type::text <> 'business';

-- BIZ-4: firmographics record + entity-structure FK.
ALTER TABLE public.commercial_business_accounts ADD COLUMN IF NOT EXISTS business_type_id uuid REFERENCES public.business_types(id);

INSERT INTO public.commercial_business_accounts (account_id, legal_name, notes, created_at, updated_at)
SELECT a.id, a.name, 'Reclassified from household by PLAN-C BIZ-4 on 2026-06-28 (Tier-1 named entity + commercial line).', now(), now()
FROM public.accounts a
WHERE a.id IN (SELECT account_id FROM cleanup.biz_reclass_snapshot)
ON CONFLICT (account_id) DO NOTHING;

-- map entity suffix -> business_types (resolve by name; leave NULL if ambiguous).
UPDATE public.commercial_business_accounts c
SET business_type_id = bt.id, updated_at = now()
FROM public.accounts a
JOIN LATERAL (
  SELECT (SELECT id FROM public.business_types WHERE name = CASE
            WHEN a.name ~* '\m(church|ministr|apostolic|baptist|advent)\M' THEN 'Non-Profit'
            WHEN a.name ~* '\m(inc|corp|corporation)\M'                    THEN 'Corporation'
            WHEN a.name ~* '\m(llc|pllc)\M'                                THEN 'LLC'
            WHEN a.name ~* '\m(llp|lp|partnership)\M'                      THEN 'Partnership'
            ELSE NULL END) AS id
) bt ON true
WHERE c.account_id = a.id AND a.id IN (SELECT account_id FROM cleanup.biz_reclass_snapshot)
  AND bt.id IS NOT NULL AND c.business_type_id IS NULL;

-- BIZ-8: soft-delete the Blue Oak demo commercial_business account + its demo policies
-- (else the policies orphan on the soft-deleted account).
UPDATE public.accounts SET deleted_at = now()
WHERE id = '22222222-2222-4222-8222-222222222222' AND deleted_at IS NULL;
UPDATE public.policies SET deleted_at = now()
WHERE account_id = '22222222-2222-4222-8222-222222222222' AND deleted_at IS NULL;

-- BIZ-6a: standing data-quality view (residual household-with-commercial-line violators).
CREATE OR REPLACE VIEW public.v_business_type_violations
WITH (security_invoker = true) AS
SELECT a.id, a.name
FROM public.accounts a
WHERE a.deleted_at IS NULL AND a.type::text='household'
  AND EXISTS (
    SELECT 1 FROM public.policies p JOIN public.lob_crosswalk x ON x.raw_value = p.line_of_business
    WHERE p.account_id=a.id AND p.deleted_at IS NULL AND x.line_category='commercial')
  AND a.id NOT IN (SELECT account_id FROM cleanup.reclass_exclusions);

-- BIZ-6b: guardrail trigger on policies. Auto-promotes ONLY clear business-name
-- household accounts (LLC/Inc/Church/...) holding a new commercial-line policy;
-- sole-proprietors (personal names) and exclusions are NEVER auto-promoted.
CREATE OR REPLACE FUNCTION public.enforce_commercial_account_type()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_is_comm boolean;
BEGIN
  IF NEW.account_id IS NULL OR NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  SELECT (x.line_category = 'commercial') INTO v_is_comm
  FROM public.lob_crosswalk x WHERE x.raw_value = NEW.line_of_business;
  IF coalesce(v_is_comm, false) THEN
    UPDATE public.accounts a SET type = 'commercial_business'
    WHERE a.id = NEW.account_id AND a.type::text = 'household'
      AND a.name ~* '\m(llc|inc|corp|corporation|pllc|llp|church|ministr|apostolic|baptist|advent)\M'
      AND a.id NOT IN (SELECT account_id FROM cleanup.reclass_exclusions);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS zz_enforce_commercial_type ON public.policies;
CREATE TRIGGER zz_enforce_commercial_type
  AFTER INSERT OR UPDATE OF line_of_business, account_id ON public.policies
  FOR EACH ROW EXECUTE FUNCTION public.enforce_commercial_account_type();
