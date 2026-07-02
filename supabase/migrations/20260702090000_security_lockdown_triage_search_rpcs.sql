-- Security lockdown for the triage/search RPCs shipped 2026-06-28 (code review 2026-07-01, finding P0-1).
--
-- Problem: 11 SECURITY DEFINER functions (owned by postgres, BYPASSRLS) had EXECUTE
-- granted to PUBLIC + anon and contained no staff guard, so the public anon key could
-- dump the full customer/policy/lead book (names, emails, phones, addresses).
--
-- This migration:
--   1. Recreates the 5 plpgsql search functions with an is_staff() guard
--      (bodies taken verbatim from live prod definitions, guard prepended).
--   2. Recreates the 6 sql count functions with WHERE public.is_staff()
--      (non-staff callers get zero rows instead of counts).
--   3. Revokes EXECUTE from PUBLIC and anon on all of them; re-grants to
--      authenticated + service_role (staff UI calls these as authenticated).
--   4. Adds SET search_path = public to the four SECURITY DEFINER functions
--      that were missing it (payment triggers + renewal sync), and guards
--      sync_policies_to_renewals with is_staff() (it was callable by any
--      authenticated user and performs a full-book write).
--
-- Finding P0-5 is also covered here (search_path + sync guard).

-- ---------------------------------------------------------------------------
-- 1. plpgsql search functions: prepend is_staff() guard
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.unified_customer_search(p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0, p_sort text DEFAULT 'updated_at_desc'::text)
 RETURNS TABLE(id uuid, account_id uuid, name text, display_name text, org_name text, type text, email text, phone text, primary_email text, primary_phone text, city text, state text, postal_code text, status text, notes_summary text, policies_count integer, balance numeric, last_contact_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, rank real, next_expiration_at date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  filter_q text;
  filter_type text;
  filter_city text;
  filter_state text;
  filter_cohort text;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'permission denied: staff only' USING ERRCODE = '42501';
  END IF;

  filter_q := p_filters->>'q';
  filter_type := p_filters->>'type';
  filter_city := p_filters->>'city';
  filter_state := p_filters->>'state';
  filter_cohort := p_filters->>'cohort';

  RETURN QUERY
  SELECT
    a.id,
    a.id as account_id,
    a.name,
    a.name as display_name,
    null::text as org_name,
    a.type::text as type,
    a.email,
    a.phone,
    a.email as primary_email,
    a.phone as primary_phone,
    a.city,
    a.state,
    a.zip_code as postal_code,
    a.account_status::text as status,
    a.notes as notes_summary,
    COALESCE((SELECT count(*)::int FROM public.policies pol WHERE pol.account_id = a.id), 0) as policies_count,
    null::numeric as balance,
    null::timestamp with time zone as last_contact_at,
    a.created_at,
    a.updated_at,
    CASE
      WHEN filter_q IS NOT NULL AND filter_q != '' THEN
        ts_rank(a.search_vector, plainto_tsquery('simple', filter_q))
      ELSE 0.0
    END as rank,
    (SELECT min(pol.expiration_date) FROM public.policies pol
       WHERE pol.account_id = a.id AND pol.deleted_at IS NULL AND pol.status = 'active') as next_expiration_at
  FROM public.accounts a
  WHERE
    a.deleted_at IS NULL
    AND (filter_q IS NULL OR filter_q = '' OR (
      a.search_vector @@ plainto_tsquery('simple', filter_q) OR
      a.name ILIKE '%' || filter_q || '%' OR
      a.email ILIKE '%' || filter_q || '%' OR
      a.phone ILIKE '%' || filter_q || '%' OR
      a.goes_by ILIKE '%' || filter_q || '%' OR
      EXISTS (SELECT 1 FROM public.account_aliases al
                WHERE al.account_id = a.id AND al.alias ILIKE '%' || filter_q || '%') OR
      (length(filter_q) >= 3 AND extensions.similarity(a.name, filter_q) > 0.3)
    ))
    AND (filter_type IS NULL OR filter_type = '' OR a.type::text = filter_type)
    AND (filter_city IS NULL OR filter_city = '' OR a.city ILIKE '%' || filter_city || '%')
    AND (filter_state IS NULL OR filter_state = '' OR a.state ILIKE '%' || filter_state || '%')
    AND (
      filter_cohort IS NULL OR filter_cohort = '' OR filter_cohort = 'all'
      OR (filter_cohort = 'renewals_30d' AND EXISTS (
            SELECT 1 FROM public.policies p WHERE p.account_id = a.id AND p.deleted_at IS NULL
              AND p.status = 'active' AND p.expiration_date >= current_date AND p.expiration_date < current_date + 30))
      OR (filter_cohort = 'renewals_60d' AND EXISTS (
            SELECT 1 FROM public.policies p WHERE p.account_id = a.id AND p.deleted_at IS NULL
              AND p.status = 'active' AND p.expiration_date >= current_date AND p.expiration_date < current_date + 60))
      OR (filter_cohort = 'overdue' AND EXISTS (
            SELECT 1 FROM public.policies p WHERE p.account_id = a.id AND p.deleted_at IS NULL
              AND p.status = 'active' AND p.expiration_date < current_date))
      OR (filter_cohort = 'no_active_policy' AND NOT EXISTS (
            SELECT 1 FROM public.policies p WHERE p.account_id = a.id AND p.deleted_at IS NULL
              AND p.status = 'active'))
      OR (filter_cohort = 'new_30d' AND a.created_at >= now() - interval '30 days')
    )
  ORDER BY
    CASE WHEN p_sort = 'rank_desc' AND filter_q IS NOT NULL AND filter_q != '' THEN
      ts_rank(a.search_vector, plainto_tsquery('simple', filter_q))
    END DESC NULLS LAST,
    CASE WHEN p_sort = 'name_asc' THEN a.name END ASC NULLS LAST,
    CASE WHEN p_sort = 'name_desc' THEN a.name END DESC NULLS LAST,
    CASE WHEN p_sort = 'updated_at_asc' THEN a.updated_at END ASC NULLS LAST,
    CASE WHEN p_sort = 'updated_at_desc' THEN a.updated_at END DESC NULLS LAST,
    a.id
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION public.search_policies(p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 250, p_offset integer DEFAULT 0, p_sort text DEFAULT 'expiration_asc'::text)
 RETURNS TABLE(id uuid, account_id uuid, named_insured text, policy_number text, carrier text, line text, status text, premium numeric, expiration_date date, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  filter_q text;
  filter_cohort text;
  filter_carrier text;
  filter_status text;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'permission denied: staff only' USING ERRCODE = '42501';
  END IF;

  filter_q := p_filters->>'q';
  filter_cohort := p_filters->>'cohort';
  filter_carrier := p_filters->>'carrier';
  filter_status := p_filters->>'status';

  RETURN QUERY
  SELECT
    pol.id,
    pol.account_id,
    COALESCE(NULLIF(btrim(pol.named_insured), ''), a.name, 'Unnamed') as named_insured,
    pol.policy_number,
    pol.carrier,
    COALESCE(pol.line_canonical, pol.line_of_business::text) as line,
    pol.status::text as status,
    pol.premium,
    pol.expiration_date,
    pol.created_at
  FROM public.policies pol
  LEFT JOIN public.accounts a ON a.id = pol.account_id
  WHERE
    pol.deleted_at IS NULL
    AND (filter_q IS NULL OR filter_q = '' OR (
      pol.policy_number ILIKE '%' || filter_q || '%' OR
      pol.carrier ILIKE '%' || filter_q || '%' OR
      pol.named_insured ILIKE '%' || filter_q || '%' OR
      a.name ILIKE '%' || filter_q || '%'
    ))
    AND (filter_carrier IS NULL OR filter_carrier = '' OR pol.carrier ILIKE '%' || filter_carrier || '%')
    AND (filter_status IS NULL OR filter_status = '' OR pol.status::text = filter_status)
    AND (
      filter_cohort IS NULL OR filter_cohort = '' OR filter_cohort = 'all'
      OR (filter_cohort = 'expiring_30d' AND pol.status = 'active' AND pol.expiration_date >= current_date AND pol.expiration_date < current_date + 30)
      OR (filter_cohort = 'lapsed' AND pol.status <> 'active')
      OR (filter_cohort = 'no_renewal_date' AND pol.expiration_date IS NULL)
      OR (filter_cohort = 'recently_bound' AND pol.created_at >= now() - interval '30 days')
    )
  ORDER BY
    CASE WHEN p_sort = 'expiration_asc' THEN pol.expiration_date END ASC NULLS LAST,
    CASE WHEN p_sort = 'expiration_desc' THEN pol.expiration_date END DESC NULLS LAST,
    CASE WHEN p_sort = 'premium_desc' THEN pol.premium END DESC NULLS LAST,
    CASE WHEN p_sort = 'created_desc' THEN pol.created_at END DESC NULLS LAST,
    pol.id
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION public.search_leads(p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 250, p_offset integer DEFAULT 0, p_sort text DEFAULT 'score_desc'::text)
 RETURNS TABLE(id uuid, first_name text, last_name text, company_name text, email text, phone text, status text, lead_score integer, insurance_types text[], current_carrier text, last_contact_at timestamp with time zone, next_follow_up_date date, account_id uuid, converted_account_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  filter_q text;
  filter_cohort text;
  filter_status text;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'permission denied: staff only' USING ERRCODE = '42501';
  END IF;

  filter_q := p_filters->>'q';
  filter_cohort := p_filters->>'cohort';
  filter_status := p_filters->>'status';

  RETURN QUERY
  SELECT
    l.id,
    l.first_name,
    l.last_name,
    l.company_name,
    l.email,
    l.phone,
    l.status::text as status,
    l.lead_score,
    l.insurance_types::text[] as insurance_types,
    l.current_carrier,
    l.last_contact_at,
    l.next_follow_up_date,
    l.account_id,
    l.converted_account_id,
    l.created_at,
    l.updated_at
  FROM public.leads l
  WHERE
    l.deleted_at IS NULL
    AND (filter_q IS NULL OR filter_q = '' OR (
      l.first_name ILIKE '%' || filter_q || '%' OR
      l.last_name ILIKE '%' || filter_q || '%' OR
      l.email ILIKE '%' || filter_q || '%' OR
      l.phone ILIKE '%' || filter_q || '%' OR
      l.company_name ILIKE '%' || filter_q || '%'
    ))
    AND (filter_status IS NULL OR filter_status = '' OR l.status::text = filter_status)
    AND (
      filter_cohort IS NULL OR filter_cohort = '' OR filter_cohort = 'all'
      OR (filter_cohort = 'new' AND l.status = 'new')
      OR (filter_cohort = 'hot' AND l.lead_score >= 70)
      OR (filter_cohort = 'qualified' AND l.status = 'qualified')
      OR (filter_cohort = 'quoted' AND l.status = 'quoted')
    )
  ORDER BY
    CASE WHEN p_sort = 'score_desc' THEN l.lead_score END DESC NULLS LAST,
    CASE WHEN p_sort = 'created_desc' THEN l.created_at END DESC NULLS LAST,
    CASE WHEN p_sort = 'name_asc' THEN l.last_name END ASC NULLS LAST,
    l.id
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION public.search_ao_renewals(p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 250, p_offset integer DEFAULT 0, p_sort text DEFAULT 'renewal_asc'::text)
 RETURNS TABLE(id uuid, account_id uuid, customer_name text, policy_number text, policy_type text, current_carrier text, renewal_date date, current_premium numeric, status text, moved_carrier text, best_alternative_carrier text, last_contact_date timestamp with time zone, follow_up_date date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  filter_q text;
  filter_cohort text;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'permission denied: staff only' USING ERRCODE = '42501';
  END IF;

  filter_q := p_filters->>'q';
  filter_cohort := p_filters->>'cohort';

  RETURN QUERY
  SELECT
    r.id,
    r.account_id,
    COALESCE(NULLIF(btrim(r.customer_name), ''), 'Unnamed') as customer_name,
    r.policy_number,
    r.policy_type,
    r.current_carrier,
    r.renewal_date,
    r.current_premium,
    r.status,
    r.moved_carrier,
    r.best_alternative_carrier,
    r.last_contact_date,
    r.follow_up_date
  FROM public.ao_renewals r
  WHERE
    (filter_q IS NULL OR filter_q = '' OR (
      r.customer_name ILIKE '%' || filter_q || '%' OR
      r.policy_number ILIKE '%' || filter_q || '%'
    ))
    AND (
      filter_cohort IS NULL OR filter_cohort = '' OR filter_cohort = 'all'
      OR (filter_cohort = 'not_started' AND r.status = 'pending')
      OR (filter_cohort = 'quote_out' AND r.status IN ('quoted','contacted'))
      OR (filter_cohort = 'bound_elsewhere' AND r.status = 'moved')
      OR (filter_cohort = 'lapsing_week' AND r.renewal_date >= current_date AND r.renewal_date < current_date + 7 AND r.status IN ('pending','contacted','quoted'))
    )
  ORDER BY
    CASE WHEN p_sort = 'renewal_asc' THEN r.renewal_date END ASC NULLS LAST,
    CASE WHEN p_sort = 'renewal_desc' THEN r.renewal_date END DESC NULLS LAST,
    r.id
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION public.search_tasks(p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 250, p_offset integer DEFAULT 0, p_sort text DEFAULT 'due_asc'::text)
 RETURNS TABLE(id uuid, title text, status text, priority text, due_at timestamp with time zone, entity_type text, account_id uuid, account_name text, created_at timestamp with time zone, completed_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  filter_q text;
  filter_cohort text;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'permission denied: staff only' USING ERRCODE = '42501';
  END IF;

  filter_q := p_filters->>'q';
  filter_cohort := p_filters->>'cohort';

  RETURN QUERY
  SELECT
    t.id,
    t.title,
    t.status::text AS status,
    t.priority::text AS priority,
    t.due_at,
    t.entity_type,
    COALESCE(t.account_id, t.customer_id) AS account_id,
    a.name AS account_name,
    t.created_at,
    t.completed_at
  FROM public.tasks t
  LEFT JOIN public.accounts a ON a.id = COALESCE(t.account_id, t.customer_id)
  WHERE
    t.deleted_at IS NULL
    AND (filter_q IS NULL OR filter_q = '' OR t.title ILIKE '%' || filter_q || '%')
    AND (
      filter_cohort IS NULL OR filter_cohort = '' OR filter_cohort = 'all'
      OR (filter_cohort = 'overdue' AND t.status::text IN ('pending','in_progress') AND t.due_at IS NOT NULL AND t.due_at < now())
      OR (filter_cohort = 'due_this_week' AND t.status::text IN ('pending','in_progress') AND t.due_at >= now() AND t.due_at < now() + interval '7 days')
      OR (filter_cohort = 'high_priority' AND t.status::text IN ('pending','in_progress') AND t.priority::text IN ('high','urgent'))
      OR (filter_cohort = 'completed' AND t.status::text = 'completed')
    )
  ORDER BY
    CASE WHEN p_sort = 'due_asc' THEN t.due_at END ASC NULLS LAST,
    CASE WHEN p_sort = 'created_desc' THEN t.created_at END DESC NULLS LAST,
    t.id
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. sql count functions: gate the outer SELECT on is_staff()
--    (non-staff callers get zero rows; staff behavior unchanged)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_customer_triage_counts()
 RETURNS TABLE(total integer, renewals_30d integer, renewals_60d integer, overdue integer, no_active_policy integer, new_30d integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH acc AS (
    SELECT id, created_at FROM public.accounts WHERE deleted_at IS NULL
  )
  SELECT
    (SELECT count(*)::int FROM acc),
    (SELECT count(*)::int FROM acc a WHERE EXISTS (
        SELECT 1 FROM public.policies p
        WHERE p.account_id = a.id AND p.deleted_at IS NULL AND p.status = 'active'
          AND p.expiration_date >= current_date AND p.expiration_date < current_date + 30)),
    (SELECT count(*)::int FROM acc a WHERE EXISTS (
        SELECT 1 FROM public.policies p
        WHERE p.account_id = a.id AND p.deleted_at IS NULL AND p.status = 'active'
          AND p.expiration_date >= current_date AND p.expiration_date < current_date + 60)),
    (SELECT count(*)::int FROM acc a WHERE EXISTS (
        SELECT 1 FROM public.policies p
        WHERE p.account_id = a.id AND p.deleted_at IS NULL AND p.status = 'active'
          AND p.expiration_date < current_date)),
    (SELECT count(*)::int FROM acc a WHERE NOT EXISTS (
        SELECT 1 FROM public.policies p
        WHERE p.account_id = a.id AND p.deleted_at IS NULL AND p.status = 'active')),
    (SELECT count(*)::int FROM acc WHERE created_at >= now() - interval '30 days')
  WHERE public.is_staff();
$function$;

CREATE OR REPLACE FUNCTION public.get_policy_triage_counts()
 RETURNS TABLE(total integer, expiring_30d integer, lapsed integer, no_renewal_date integer, recently_bound integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH p AS (SELECT status, expiration_date, created_at FROM public.policies WHERE deleted_at IS NULL)
  SELECT
    (SELECT count(*)::int FROM p),
    (SELECT count(*)::int FROM p WHERE status = 'active' AND expiration_date >= current_date AND expiration_date < current_date + 30),
    (SELECT count(*)::int FROM p WHERE status <> 'active'),
    (SELECT count(*)::int FROM p WHERE expiration_date IS NULL),
    (SELECT count(*)::int FROM p WHERE created_at >= now() - interval '30 days')
  WHERE public.is_staff();
$function$;

CREATE OR REPLACE FUNCTION public.get_lead_triage_counts()
 RETURNS TABLE(total integer, new_leads integer, hot integer, qualified integer, quoted integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH l AS (SELECT status, lead_score FROM public.leads WHERE deleted_at IS NULL)
  SELECT
    (SELECT count(*)::int FROM l),
    (SELECT count(*)::int FROM l WHERE status = 'new'),
    (SELECT count(*)::int FROM l WHERE lead_score >= 70),
    (SELECT count(*)::int FROM l WHERE status = 'qualified'),
    (SELECT count(*)::int FROM l WHERE status = 'quoted')
  WHERE public.is_staff();
$function$;

CREATE OR REPLACE FUNCTION public.get_ao_migration_counts()
 RETURNS TABLE(total integer, not_started integer, quote_out integer, bound_elsewhere integer, lapsing_week integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    (SELECT count(*)::int FROM public.ao_renewals),
    (SELECT count(*)::int FROM public.ao_renewals WHERE status = 'pending'),
    (SELECT count(*)::int FROM public.ao_renewals WHERE status IN ('quoted','contacted')),
    (SELECT count(*)::int FROM public.ao_renewals WHERE status = 'moved'),
    (SELECT count(*)::int FROM public.ao_renewals
       WHERE renewal_date >= current_date AND renewal_date < current_date + 7
         AND status IN ('pending','contacted','quoted'))
  WHERE public.is_staff();
$function$;

CREATE OR REPLACE FUNCTION public.get_task_triage_counts()
 RETURNS TABLE(open_total integer, overdue integer, due_this_week integer, high_priority integer, completed integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH t AS (SELECT status::text AS status, priority::text AS priority, due_at FROM public.tasks WHERE deleted_at IS NULL)
  SELECT
    (SELECT count(*)::int FROM t WHERE status IN ('pending','in_progress')),
    (SELECT count(*)::int FROM t WHERE status IN ('pending','in_progress') AND due_at IS NOT NULL AND due_at < now()),
    (SELECT count(*)::int FROM t WHERE status IN ('pending','in_progress') AND due_at >= now() AND due_at < now() + interval '7 days'),
    (SELECT count(*)::int FROM t WHERE status IN ('pending','in_progress') AND priority IN ('high','urgent')),
    (SELECT count(*)::int FROM t WHERE status = 'completed')
  WHERE public.is_staff();
$function$;

CREATE OR REPLACE FUNCTION public.get_needs_me_today()
 RETURNS TABLE(renewals_due integer, overdue_tasks integer, new_leads integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    (SELECT count(*)::int FROM public.policies
       WHERE deleted_at IS NULL AND status = 'active'
         AND expiration_date >= current_date AND expiration_date < current_date + 30),
    (SELECT count(*)::int FROM public.tasks
       WHERE status IN ('pending','in_progress') AND due_at IS NOT NULL AND due_at < now()),
    (SELECT count(*)::int FROM public.leads
       WHERE deleted_at IS NULL AND status = 'new')
  WHERE public.is_staff();
$function$;

-- ---------------------------------------------------------------------------
-- 3. sync_policies_to_renewals: add is_staff() guard + search_path
--    (body verbatim from live prod definition; full-book write must not be
--     callable by non-staff authenticated users)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_policies_to_renewals(days_ahead integer DEFAULT 90)
 RETURNS TABLE(synced_count integer, updated_count integer, new_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_updated INTEGER := 0;
  v_new INTEGER := 0;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'permission denied: staff only' USING ERRCODE = '42501';
  END IF;

  WITH upd AS (
    UPDATE public.renewals r SET
      policy_number   = p.policy_number,
      policy_type     = COALESCE(NULLIF(p.line_of_business, ''), 'other'),
      carrier         = COALESCE(c.name, p.carrier),
      renewal_date    = p.expiration_date,
      expiration_date = p.expiration_date,
      current_premium = p.premium,
      updated_at      = NOW()
    FROM public.policies p
    LEFT JOIN public.carriers c ON c.id = p.carrier_id
    WHERE r.policy_id = p.id
      AND r.status IN ('upcoming', 'in_progress')
      AND p.status IN ('active', 'pending')
      AND p.expiration_date IS NOT NULL
      AND r.renewal_date = p.expiration_date
      AND (
        r.expiration_date IS DISTINCT FROM p.expiration_date
        OR r.current_premium IS DISTINCT FROM p.premium
        OR r.policy_number   IS DISTINCT FROM p.policy_number
        OR r.policy_type     IS DISTINCT FROM COALESCE(NULLIF(p.line_of_business, ''), 'other')
        OR r.carrier         IS DISTINCT FROM COALESCE(c.name, p.carrier)
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_updated FROM upd;

  WITH ins AS (
    INSERT INTO public.renewals (
      account_id, policy_id, policy_number, policy_type, carrier,
      renewal_date, expiration_date, current_premium, renewal_premium,
      status, risk_level, created_at, updated_at
    )
    SELECT
      p.account_id, p.id, p.policy_number,
      COALESCE(NULLIF(p.line_of_business, ''), 'other'),
      COALESCE(c.name, p.carrier),
      p.expiration_date, p.expiration_date, p.premium, p.premium,
      'upcoming', 'low', NOW(), NOW()
    FROM public.policies p
    LEFT JOIN public.carriers c ON c.id = p.carrier_id
    WHERE p.status IN ('active', 'pending')
      AND p.account_id IS NOT NULL
      AND p.expiration_date IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.renewals r
        WHERE r.policy_id = p.id AND r.renewal_date = p.expiration_date
      )
    ON CONFLICT (policy_id, renewal_date) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_new FROM ins;

  RETURN QUERY SELECT (v_updated + v_new), v_updated, v_new;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. search_path on the remaining SECURITY DEFINER trigger functions
--    (trigger functions are not invoked via EXECUTE grants, but a missing
--     search_path on a definer function is still a hijack vector)
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.ensure_payment_day_sheet() SET search_path = public;
ALTER FUNCTION public.enforce_payment_paid_to() SET search_path = public;
ALTER FUNCTION public.auto_sync_policy_to_renewal() SET search_path = public;

-- ---------------------------------------------------------------------------
-- 5. Grants: strip PUBLIC + anon, keep authenticated (staff UI) + service_role
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.unified_customer_search(jsonb, integer, integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.search_policies(jsonb, integer, integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.search_leads(jsonb, integer, integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.search_ao_renewals(jsonb, integer, integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.search_tasks(jsonb, integer, integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_customer_triage_counts() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_policy_triage_counts() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_lead_triage_counts() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_ao_migration_counts() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_task_triage_counts() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_needs_me_today() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sync_policies_to_renewals(integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.unified_customer_search(jsonb, integer, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_policies(jsonb, integer, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_leads(jsonb, integer, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_ao_renewals(jsonb, integer, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_tasks(jsonb, integer, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_customer_triage_counts() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_policy_triage_counts() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_lead_triage_counts() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_ao_migration_counts() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_task_triage_counts() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_needs_me_today() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_policies_to_renewals(integer) TO authenticated, service_role;
