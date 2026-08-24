-- Add the Phase 1 Radar discriminator to the existing Tasks search surface.
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
  filter_radar boolean;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'permission denied: staff only' USING ERRCODE = '42501';
  END IF;

  filter_q := p_filters->>'q';
  filter_cohort := p_filters->>'cohort';
  filter_scope := p_filters->>'scope';
  filter_radar := COALESCE((p_filters->>'radar')::boolean, false);

  RETURN QUERY
  SELECT
    t.id,
    t.title,
    t.status::text AS status,
    t.priority::text AS priority,
    t.due_at,
    t.entity_type,
    COALESCE(t.account_id, c.account_id) AS account_id,
    COALESCE(a.name, ca.name) AS account_name,
    t.created_at,
    t.completed_at,
    t.assignee_id,
    NULLIF(TRIM(p.full_name), '') AS assignee_name
  FROM public.tasks t
  LEFT JOIN public.accounts a ON a.id = t.account_id
  LEFT JOIN public.customers c ON c.id = t.customer_id
  LEFT JOIN public.accounts ca ON ca.id = c.account_id
  LEFT JOIN public.profiles p ON p.id = t.assignee_id
  LEFT JOIN public.renewal_opportunities ro
    ON t.entity_type = 'renewal_opportunity' AND ro.id = t.entity_id
  WHERE
    t.deleted_at IS NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.agency_workspace_memberships awm
        WHERE awm.user_id = auth.uid()
          AND awm.status = 'active'
          AND awm.agency_workspace_id = COALESCE(a.agency_workspace_id, ca.agency_workspace_id, ro.agency_workspace_id)
      )
      -- Legacy general tasks have no tenant key. Keep only rows directly owned by
      -- the caller; unknown unscoped rows must never become office-wide work.
      OR (
        a.id IS NULL AND ca.id IS NULL AND ro.id IS NULL
        AND (t.assignee_id = auth.uid() OR t.created_by = auth.uid())
      )
    )
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
    AND (NOT filter_radar OR (t.category::text = 'renewal' AND t.source = 'wc_renewal_radar'))
  ORDER BY
    CASE WHEN p_sort = 'due_asc' THEN t.due_at END ASC NULLS LAST,
    CASE WHEN p_sort = 'created_desc' THEN t.created_at END DESC NULLS LAST,
    t.id
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.search_tasks(jsonb, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_tasks(jsonb, integer, integer, text) TO authenticated, service_role;
