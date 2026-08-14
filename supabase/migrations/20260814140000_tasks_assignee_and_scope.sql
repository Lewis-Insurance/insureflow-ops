-- Tasks assignee column in search + scope filters (mine / unclaimed / office).
-- search_tasks return type changes require DROP + CREATE (CREATE OR REPLACE cannot add columns).
-- Rollback-safe: DROP IF EXISTS guards; GRANT/REVOKE matches 20260813000000.

-- ---------------------------------------------------------------------------
-- search_tasks: assignee columns + extended scope filter
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.search_tasks(jsonb, integer, integer, text);

CREATE FUNCTION public.search_tasks(p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 250, p_offset integer DEFAULT 0, p_sort text DEFAULT 'due_asc'::text)
 RETURNS TABLE(id uuid, title text, status text, priority text, due_at timestamp with time zone, entity_type text, account_id uuid, account_name text, created_at timestamp with time zone, completed_at timestamp with time zone, assignee_id uuid, assignee_name text)
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
    t.completed_at,
    t.assignee_id,
    NULLIF(TRIM(p.full_name), '') AS assignee_name
  FROM public.tasks t
  LEFT JOIN public.accounts a ON a.id = COALESCE(t.account_id, t.customer_id)
  LEFT JOIN public.profiles p ON p.id = t.assignee_id
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
      filter_scope IS NULL OR filter_scope = '' OR filter_scope = 'office'
      OR (filter_scope = 'mine' AND (t.assignee_id = auth.uid() OR t.assignee_id IS NULL))
      OR (filter_scope = 'unclaimed' AND t.assignee_id IS NULL)
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
-- get_task_triage_counts: optional scope param with same filter logic
-- Drop the zero-arg overload so callers cannot hit agency-wide counts by accident.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_task_triage_counts();

CREATE OR REPLACE FUNCTION public.get_task_triage_counts(p_scope text DEFAULT 'office')
 RETURNS TABLE(open_total integer, overdue integer, due_this_week integer, high_priority integer, completed integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH t AS (
    SELECT status::text AS status, priority::text AS priority, due_at
    FROM public.tasks
    WHERE deleted_at IS NULL
      AND (
        p_scope IS NULL OR p_scope = '' OR p_scope = 'office'
        OR (p_scope = 'mine' AND (assignee_id = auth.uid() OR assignee_id IS NULL))
        OR (p_scope = 'unclaimed' AND assignee_id IS NULL)
      )
  )
  SELECT
    (SELECT count(*)::int FROM t WHERE status IN ('pending','in_progress')),
    (SELECT count(*)::int FROM t WHERE status IN ('pending','in_progress') AND due_at IS NOT NULL AND due_at < now()),
    (SELECT count(*)::int FROM t WHERE status IN ('pending','in_progress') AND due_at >= now() AND due_at < now() + interval '7 days'),
    (SELECT count(*)::int FROM t WHERE status IN ('pending','in_progress') AND priority IN ('high','urgent')),
    (SELECT count(*)::int FROM t WHERE status = 'completed')
  WHERE public.is_staff();
$function$;

-- ---------------------------------------------------------------------------
-- Grants: strip PUBLIC + anon, keep authenticated + service_role
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.search_tasks(jsonb, integer, integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_task_triage_counts(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.search_tasks(jsonb, integer, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_task_triage_counts(text) TO authenticated, service_role;
