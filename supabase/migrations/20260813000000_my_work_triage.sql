-- My Work triage: producer-scoped counts and search filters.
-- Rollback-safe: CREATE OR REPLACE functions; GRANT/REVOKE matches 20260702090000.

-- ---------------------------------------------------------------------------
-- get_my_needs_me_today: same shape as get_needs_me_today, scoped to the caller
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_needs_me_today()
 RETURNS TABLE(renewals_due integer, overdue_tasks integer, new_leads integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    -- Agency-wide book renewals (same definition as get_needs_me_today; no producer filter).
    (SELECT count(*)::int FROM public.policies
       WHERE deleted_at IS NULL AND status = 'active'
         AND expiration_date >= current_date AND expiration_date < current_date + 30),
    -- Open overdue tasks assigned to me or unassigned (claimable from the pool).
    (SELECT count(*)::int FROM public.tasks
       WHERE deleted_at IS NULL
         AND status IN ('pending','in_progress')
         AND due_at IS NOT NULL AND due_at < now()
         AND (assignee_id = auth.uid() OR assignee_id IS NULL)),
    -- New leads assigned to me or unassigned (matches search_leads scope=mine).
    (SELECT count(*)::int FROM public.leads
       WHERE deleted_at IS NULL AND status = 'new'
         AND (assigned_to = auth.uid() OR assigned_to IS NULL))
  WHERE public.is_staff();
$function$;

-- ---------------------------------------------------------------------------
-- search_tasks: add scope=mine filter (assignee = caller OR unassigned)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_tasks(p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 250, p_offset integer DEFAULT 0, p_sort text DEFAULT 'due_asc'::text)
 RETURNS TABLE(id uuid, title text, status text, priority text, due_at timestamp with time zone, entity_type text, account_id uuid, account_name text, created_at timestamp with time zone, completed_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  filter_q text;
  filter_cohort text;
  filter_scope text;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'permission denied: staff only' USING ERRCODE = '42501';
  END IF;

  filter_q := p_filters->>'q';
  filter_cohort := p_filters->>'cohort';
  filter_scope := p_filters->>'scope';

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
    AND (
      filter_scope IS NULL OR filter_scope = '' OR filter_scope <> 'mine'
      OR (t.assignee_id = auth.uid() OR t.assignee_id IS NULL)
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
-- search_leads: add scope=mine filter (assigned to caller OR unassigned)
-- ---------------------------------------------------------------------------
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
  filter_scope text;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'permission denied: staff only' USING ERRCODE = '42501';
  END IF;

  filter_q := p_filters->>'q';
  filter_cohort := p_filters->>'cohort';
  filter_status := p_filters->>'status';
  filter_scope := p_filters->>'scope';

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
    AND (
      filter_scope IS NULL OR filter_scope = '' OR filter_scope <> 'mine'
      OR (l.assigned_to = auth.uid() OR l.assigned_to IS NULL)
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

-- ---------------------------------------------------------------------------
-- Grants: strip PUBLIC + anon, keep authenticated + service_role
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_my_needs_me_today() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.search_tasks(jsonb, integer, integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.search_leads(jsonb, integer, integer, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_my_needs_me_today() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_tasks(jsonb, integer, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_leads(jsonb, integer, integer, text) TO authenticated, service_role;
