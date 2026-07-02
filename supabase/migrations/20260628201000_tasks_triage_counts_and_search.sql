-- Tasks Index: server-side cohort counts + paginated search (deleted_at scoped).
CREATE OR REPLACE FUNCTION public.get_task_triage_counts()
RETURNS TABLE(open_total integer, overdue integer, due_this_week integer, high_priority integer, completed integer)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH t AS (SELECT status::text AS status, priority::text AS priority, due_at FROM public.tasks WHERE deleted_at IS NULL)
  SELECT
    (SELECT count(*)::int FROM t WHERE status IN ('pending','in_progress')),
    (SELECT count(*)::int FROM t WHERE status IN ('pending','in_progress') AND due_at IS NOT NULL AND due_at < now()),
    (SELECT count(*)::int FROM t WHERE status IN ('pending','in_progress') AND due_at >= now() AND due_at < now() + interval '7 days'),
    (SELECT count(*)::int FROM t WHERE status IN ('pending','in_progress') AND priority IN ('high','urgent')),
    (SELECT count(*)::int FROM t WHERE status = 'completed');
$function$;
GRANT EXECUTE ON FUNCTION public.get_task_triage_counts() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.search_tasks(p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 250, p_offset integer DEFAULT 0, p_sort text DEFAULT 'due_asc'::text)
RETURNS TABLE(id uuid, title text, status text, priority text, due_at timestamp with time zone, entity_type text, account_id uuid, account_name text, created_at timestamp with time zone, completed_at timestamp with time zone)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE filter_q text; filter_cohort text;
BEGIN
  filter_q := p_filters->>'q'; filter_cohort := p_filters->>'cohort';
  RETURN QUERY
  SELECT t.id, t.title, t.status::text, t.priority::text, t.due_at, t.entity_type,
         COALESCE(t.account_id, t.customer_id), a.name, t.created_at, t.completed_at
  FROM public.tasks t
  LEFT JOIN public.accounts a ON a.id = COALESCE(t.account_id, t.customer_id)
  WHERE t.deleted_at IS NULL
    AND (filter_q IS NULL OR filter_q = '' OR t.title ILIKE '%' || filter_q || '%')
    AND (filter_cohort IS NULL OR filter_cohort = '' OR filter_cohort = 'all'
      OR (filter_cohort = 'overdue' AND t.status::text IN ('pending','in_progress') AND t.due_at IS NOT NULL AND t.due_at < now())
      OR (filter_cohort = 'due_this_week' AND t.status::text IN ('pending','in_progress') AND t.due_at >= now() AND t.due_at < now() + interval '7 days')
      OR (filter_cohort = 'high_priority' AND t.status::text IN ('pending','in_progress') AND t.priority::text IN ('high','urgent'))
      OR (filter_cohort = 'completed' AND t.status::text = 'completed'))
  ORDER BY
    CASE WHEN p_sort = 'due_asc' THEN t.due_at END ASC NULLS LAST,
    CASE WHEN p_sort = 'created_desc' THEN t.created_at END DESC NULLS LAST,
    t.id
  LIMIT p_limit OFFSET p_offset;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.search_tasks(jsonb, integer, integer, text) TO anon, authenticated, service_role;
