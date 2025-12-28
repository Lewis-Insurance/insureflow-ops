-- ============================================================================
-- FIX: CEO DIGEST LINE_OF_BUSINESS COLUMN NAME
-- ============================================================================
-- The quotes table has 'line_of_business' NOT 'policy_type'
-- Two places in the RPC were using the wrong column name:
--   1. top_opportunities query (line 406)
--   2. aging_quotes query (line 425)
-- ============================================================================

-- Drop and recreate the function with correct column names
CREATE OR REPLACE FUNCTION get_ceo_digest_facts_all_agencies(
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ,
  p_timezone TEXT DEFAULT 'America/New_York',
  p_include_pii BOOLEAN DEFAULT FALSE,
  p_thresholds JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_meta JSONB;
  v_kpis JSONB;
  v_deltas JSONB;
  v_funnel JSONB;
  v_lists JSONB;
  v_service_ops JSONB;
  v_integration_health JSONB;
  v_alerts JSONB := '[]'::JSONB;
  v_missing_data JSONB := '[]'::JSONB;
  v_by_agency JSONB := '[]'::JSONB;

  -- Thresholds with defaults
  v_leads_drop_pct INTEGER;
  v_quotes_drop_pct INTEGER;
  v_overdue_tasks_critical INTEGER;
  v_aging_quotes_days INTEGER;
  v_canopy_reconnects_critical INTEGER;
  v_canopy_errors_critical INTEGER;

  -- Temp variables
  v_prev_period_start TIMESTAMPTZ;
  v_prev_period_end TIMESTAMPTZ;
  v_week_label TEXT;
  v_agency_count INTEGER := 0;

  -- Current period counts (AGGREGATED across all agencies)
  v_leads_new INTEGER := 0;
  v_leads_contacted INTEGER := 0;
  v_leads_qualified INTEGER := 0;
  v_leads_quoted INTEGER := 0;
  v_leads_won INTEGER := 0;
  v_leads_lost INTEGER := 0;
  v_quotes_created INTEGER := 0;
  v_quotes_open INTEGER := 0;
  v_quotes_won INTEGER := 0;
  v_quotes_lost INTEGER := 0;
  v_policies_bound INTEGER := 0;
  v_premium_written NUMERIC := 0;
  v_tasks_created INTEGER := 0;
  v_tasks_completed INTEGER := 0;
  v_tasks_overdue INTEGER := 0;

  -- Previous period counts
  v_prev_leads_new INTEGER := 0;
  v_prev_quotes_created INTEGER := 0;
  v_prev_policies_bound INTEGER := 0;
  v_prev_premium_written NUMERIC := 0;

  -- Integration health (aggregated)
  v_canopy_pulls INTEGER := 0;
  v_canopy_successful INTEGER := 0;
  v_canopy_errors INTEGER := 0;
  v_canopy_reconnects INTEGER := 0;
  v_canopy_servicing_pending INTEGER := 0;
  v_canopy_policies_synced INTEGER := 0;
BEGIN
  -- Parse thresholds with defaults
  v_leads_drop_pct := COALESCE((p_thresholds->>'leads_drop_pct')::INTEGER, 25);
  v_quotes_drop_pct := COALESCE((p_thresholds->>'quotes_drop_pct')::INTEGER, 25);
  v_overdue_tasks_critical := COALESCE((p_thresholds->>'overdue_tasks_critical')::INTEGER, 10);
  v_aging_quotes_days := COALESCE((p_thresholds->>'aging_quotes_days')::INTEGER, 7);
  v_canopy_reconnects_critical := COALESCE((p_thresholds->>'canopy_reconnects_critical')::INTEGER, 3);
  v_canopy_errors_critical := COALESCE((p_thresholds->>'canopy_errors_critical')::INTEGER, 5);

  -- Calculate previous period (same duration)
  v_prev_period_end := p_period_start - INTERVAL '1 second';
  v_prev_period_start := v_prev_period_end - (p_period_end - p_period_start);

  -- Generate week label
  v_week_label := 'Week of ' || TO_CHAR(p_period_start AT TIME ZONE p_timezone, 'Mon DD') ||
                  '-' || TO_CHAR(p_period_end AT TIME ZONE p_timezone, 'DD, YYYY');

  -- Count agency workspaces
  SELECT COUNT(*) INTO v_agency_count FROM agency_workspaces;

  -- ============================================================================
  -- AGGREGATE METRICS ACROSS ALL AGENCIES
  -- ============================================================================

  -- Leads metrics (ALL agencies)
  BEGIN
    SELECT
      COALESCE(COUNT(*) FILTER (WHERE l.created_at >= p_period_start AND l.created_at < p_period_end), 0),
      COALESCE(COUNT(*) FILTER (WHERE l.status = 'contacted' AND l.updated_at >= p_period_start AND l.updated_at < p_period_end), 0),
      COALESCE(COUNT(*) FILTER (WHERE l.status = 'qualified' AND l.updated_at >= p_period_start AND l.updated_at < p_period_end), 0),
      COALESCE(COUNT(*) FILTER (WHERE l.status = 'quoted' AND l.updated_at >= p_period_start AND l.updated_at < p_period_end), 0),
      COALESCE(COUNT(*) FILTER (WHERE l.status = 'won' AND l.updated_at >= p_period_start AND l.updated_at < p_period_end), 0),
      COALESCE(COUNT(*) FILTER (WHERE l.status = 'lost' AND l.updated_at >= p_period_start AND l.updated_at < p_period_end), 0)
    INTO v_leads_new, v_leads_contacted, v_leads_qualified, v_leads_quoted, v_leads_won, v_leads_lost
    FROM leads l
    JOIN accounts a ON l.account_id = a.id
    WHERE l.deleted_at IS NULL;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_missing_data := v_missing_data || '"leads"'::JSONB;
  END;

  -- Quotes metrics (ALL agencies) - FIXED: Using correct enum values
  BEGIN
    SELECT
      COALESCE(COUNT(*) FILTER (WHERE created_at >= p_period_start AND created_at < p_period_end), 0),
      COALESCE(COUNT(*) FILTER (WHERE status = 'open' AND updated_at >= p_period_start AND updated_at < p_period_end), 0),
      COALESCE(COUNT(*) FILTER (WHERE status = 'won' AND updated_at >= p_period_start AND updated_at < p_period_end), 0),
      COALESCE(COUNT(*) FILTER (WHERE status = 'lost' AND updated_at >= p_period_start AND updated_at < p_period_end), 0)
    INTO v_quotes_created, v_quotes_open, v_quotes_won, v_quotes_lost
    FROM quotes;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_missing_data := v_missing_data || '"quotes"'::JSONB;
  END;

  -- Policies metrics (ALL agencies)
  BEGIN
    SELECT
      COALESCE(COUNT(*), 0),
      COALESCE(SUM(premium), 0)
    INTO v_policies_bound, v_premium_written
    FROM policies p
    WHERE p.created_at >= p_period_start
      AND p.created_at < p_period_end
      AND p.status::TEXT IN ('active', 'bound', 'pending')
      AND p.deleted_at IS NULL;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_missing_data := v_missing_data || '"policies"'::JSONB;
  END;

  -- Tasks metrics (ALL agencies)
  BEGIN
    SELECT
      COALESCE(COUNT(*) FILTER (WHERE created_at >= p_period_start AND created_at < p_period_end), 0),
      COALESCE(COUNT(*) FILTER (WHERE completed_at >= p_period_start AND completed_at < p_period_end), 0),
      COALESCE(COUNT(*) FILTER (WHERE status = 'pending' AND due_at < NOW()), 0)
    INTO v_tasks_created, v_tasks_completed, v_tasks_overdue
    FROM tasks;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_missing_data := v_missing_data || '"tasks"'::JSONB;
  END;

  -- ============================================================================
  -- PREVIOUS PERIOD METRICS (for deltas)
  -- ============================================================================

  BEGIN
    SELECT COALESCE(COUNT(*), 0)
    INTO v_prev_leads_new
    FROM leads l
    WHERE l.created_at >= v_prev_period_start
      AND l.created_at < v_prev_period_end
      AND l.deleted_at IS NULL;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  BEGIN
    SELECT COALESCE(COUNT(*), 0)
    INTO v_prev_quotes_created
    FROM quotes q
    WHERE q.created_at >= v_prev_period_start
      AND q.created_at < v_prev_period_end;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  BEGIN
    SELECT COALESCE(COUNT(*), 0), COALESCE(SUM(premium), 0)
    INTO v_prev_policies_bound, v_prev_premium_written
    FROM policies p
    WHERE p.created_at >= v_prev_period_start
      AND p.created_at < v_prev_period_end
      AND p.status::TEXT IN ('active', 'bound', 'pending')
      AND p.deleted_at IS NULL;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  -- ============================================================================
  -- CANOPY INTEGRATION HEALTH (ALL agencies)
  -- ============================================================================

  BEGIN
    SELECT
      COALESCE(COUNT(*), 0),
      COALESCE(COUNT(*) FILTER (WHERE status = 'complete'), 0),
      COALESCE(COUNT(*) FILTER (WHERE status = 'error'), 0)
    INTO v_canopy_pulls, v_canopy_successful, v_canopy_errors
    FROM canopy_pulls cp
    WHERE cp.created_at >= p_period_start
      AND cp.created_at < p_period_end;

    SELECT COALESCE(COUNT(*), 0)
    INTO v_canopy_reconnects
    FROM canopy_monitorings cm
    WHERE cm.status = 'reconnect_required';

    SELECT COALESCE(COUNT(*), 0)
    INTO v_canopy_servicing_pending
    FROM canopy_servicing_actions csa
    WHERE csa.status IN ('pending', 'waiting_confirmation');

    SELECT COALESCE(COUNT(*), 0)
    INTO v_canopy_policies_synced
    FROM canopy_policies cpol
    JOIN canopy_pulls cp ON cpol.pull_id = cp.id
    WHERE cp.status = 'complete';

  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_missing_data := v_missing_data || '"canopy"'::JSONB;
    v_canopy_pulls := NULL;
  END;

  -- ============================================================================
  -- PER-AGENCY BREAKDOWN
  -- ============================================================================

  BEGIN
    SELECT COALESCE(jsonb_agg(agency_data ORDER BY premium_written DESC), '[]'::JSONB)
    INTO v_by_agency
    FROM (
      SELECT
        jsonb_build_object(
          'agency_workspace_id', aw.id,
          'agency_name', CASE WHEN p_include_pii THEN aw.name ELSE LEFT(aw.name, 3) || '***' END,
          'leads_new', COALESCE((
            SELECT COUNT(*)
            FROM leads l
            JOIN accounts a ON l.account_id = a.id
            WHERE a.agency_workspace_id = aw.id
              AND l.created_at >= p_period_start
              AND l.created_at < p_period_end
              AND l.deleted_at IS NULL
          ), 0),
          'quotes_created', COALESCE((
            SELECT COUNT(*)
            FROM quotes q
            JOIN accounts a ON q.account_id = a.id
            WHERE a.agency_workspace_id = aw.id
              AND q.created_at >= p_period_start
              AND q.created_at < p_period_end
          ), 0),
          'policies_bound', COALESCE((
            SELECT COUNT(*)
            FROM policies p
            JOIN accounts a ON p.account_id = a.id
            WHERE a.agency_workspace_id = aw.id
              AND p.created_at >= p_period_start
              AND p.created_at < p_period_end
              AND p.status::TEXT IN ('active', 'bound', 'pending')
              AND p.deleted_at IS NULL
          ), 0),
          'premium_written', COALESCE((
            SELECT SUM(p.premium)
            FROM policies p
            JOIN accounts a ON p.account_id = a.id
            WHERE a.agency_workspace_id = aw.id
              AND p.created_at >= p_period_start
              AND p.created_at < p_period_end
              AND p.status::TEXT IN ('active', 'bound', 'pending')
              AND p.deleted_at IS NULL
          ), 0),
          'tasks_overdue', COALESCE((
            SELECT COUNT(*)
            FROM tasks t
            WHERE t.agency_workspace_id = aw.id
              AND t.status = 'pending'
              AND t.due_at < NOW()
          ), 0)
        ) AS agency_data,
        COALESCE((
          SELECT SUM(p.premium)
          FROM policies p
          JOIN accounts a ON p.account_id = a.id
          WHERE a.agency_workspace_id = aw.id
            AND p.created_at >= p_period_start
            AND p.created_at < p_period_end
            AND p.status::TEXT IN ('active', 'bound', 'pending')
            AND p.deleted_at IS NULL
        ), 0) AS premium_written
      FROM agency_workspaces aw
    ) subq;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_by_agency := '[]'::JSONB;
  END;

  -- ============================================================================
  -- BUILD JSON STRUCTURES
  -- ============================================================================

  -- Meta
  v_meta := jsonb_build_object(
    'period_start', p_period_start,
    'period_end', p_period_end,
    'timezone', p_timezone,
    'week_label', v_week_label,
    'generated_at', NOW(),
    'scope', 'all_agencies',
    'agency_count', v_agency_count
  );

  -- KPIs (aggregated) - using correct field names
  v_kpis := jsonb_build_object(
    'leads_new', v_leads_new,
    'leads_contacted', v_leads_contacted,
    'leads_qualified', v_leads_qualified,
    'leads_quoted', v_leads_quoted,
    'leads_won', v_leads_won,
    'leads_lost', v_leads_lost,
    'quotes_created', v_quotes_created,
    'quotes_open', v_quotes_open,
    'quotes_won', v_quotes_won,
    'quotes_lost', v_quotes_lost,
    'policies_bound', v_policies_bound,
    'premium_written', v_premium_written,
    'tasks_created', v_tasks_created,
    'tasks_completed', v_tasks_completed,
    'tasks_overdue', v_tasks_overdue
  );

  -- Calculate deltas
  v_deltas := jsonb_build_object(
    'leads_new', jsonb_build_object(
      'current', v_leads_new,
      'previous', v_prev_leads_new,
      'change', v_leads_new - v_prev_leads_new,
      'change_pct', CASE WHEN v_prev_leads_new > 0
        THEN ROUND(((v_leads_new::NUMERIC - v_prev_leads_new) / v_prev_leads_new * 100)::NUMERIC, 1)
        ELSE NULL END
    ),
    'quotes_created', jsonb_build_object(
      'current', v_quotes_created,
      'previous', v_prev_quotes_created,
      'change', v_quotes_created - v_prev_quotes_created,
      'change_pct', CASE WHEN v_prev_quotes_created > 0
        THEN ROUND(((v_quotes_created::NUMERIC - v_prev_quotes_created) / v_prev_quotes_created * 100)::NUMERIC, 1)
        ELSE NULL END
    ),
    'policies_bound', jsonb_build_object(
      'current', v_policies_bound,
      'previous', v_prev_policies_bound,
      'change', v_policies_bound - v_prev_policies_bound,
      'change_pct', CASE WHEN v_prev_policies_bound > 0
        THEN ROUND(((v_policies_bound::NUMERIC - v_prev_policies_bound) / v_prev_policies_bound * 100)::NUMERIC, 1)
        ELSE NULL END
    ),
    'premium_written', jsonb_build_object(
      'current', v_premium_written,
      'previous', v_prev_premium_written,
      'change', v_premium_written - v_prev_premium_written,
      'change_pct', CASE WHEN v_prev_premium_written > 0
        THEN ROUND(((v_premium_written - v_prev_premium_written) / v_prev_premium_written * 100)::NUMERIC, 1)
        ELSE NULL END
    )
  );

  -- Build funnel
  v_funnel := jsonb_build_object(
    'leads', jsonb_build_object(
      'new', v_leads_new,
      'contacted', v_leads_contacted,
      'qualified', v_leads_qualified,
      'quoted', v_leads_quoted,
      'won', v_leads_won,
      'lost', v_leads_lost
    ),
    'quotes', jsonb_build_object(
      'created', v_quotes_created,
      'open', v_quotes_open,
      'won', v_quotes_won,
      'lost', v_quotes_lost
    )
  );

  -- Build lists (top opportunities, aging items, top agents, top carriers - ALL agencies)
  -- FIXED: Using q.line_of_business instead of q.policy_type
  v_lists := jsonb_build_object(
    'top_opportunities', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB)
      FROM (
        SELECT
          q.id,
          CASE WHEN p_include_pii THEN a.name
               ELSE LEFT(a.name, 1) || '***' END AS account_name,
          q.line_of_business,
          q.premium,
          q.status::TEXT,
          '/quotes/' || q.id AS deep_link
        FROM quotes q
        JOIN accounts a ON q.account_id = a.id
        WHERE q.status = 'open'
          AND q.premium > 0
        ORDER BY q.premium DESC
        LIMIT 10
      ) t
    ),
    'aging_quotes', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB)
      FROM (
        SELECT
          q.id,
          CASE WHEN p_include_pii THEN a.name
               ELSE LEFT(a.name, 1) || '***' END AS account_name,
          q.line_of_business,
          q.premium,
          EXTRACT(DAY FROM NOW() - q.created_at)::INTEGER AS days_old,
          '/quotes/' || q.id AS deep_link
        FROM quotes q
        JOIN accounts a ON q.account_id = a.id
        WHERE q.status = 'open'
          AND q.created_at < NOW() - (v_aging_quotes_days || ' days')::INTERVAL
        ORDER BY q.created_at ASC
        LIMIT 10
      ) t
    ),
    'top_agents', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB)
      FROM (
        SELECT
          p.id AS agent_id,
          CASE WHEN p_include_pii THEN p.full_name
               ELSE SPLIT_PART(p.full_name, ' ', 1) || ' ' || LEFT(SPLIT_PART(p.full_name, ' ', 2), 1) || '.' END AS agent_name,
          aw.name AS agency_name,
          COUNT(pol.id) AS policies_this_week,
          COALESCE(SUM(pol.premium), 0)::NUMERIC AS premium_written
        FROM profiles p
        JOIN agency_workspace_memberships m ON m.user_id = p.id
        JOIN agency_workspaces aw ON aw.id = m.agency_workspace_id
        LEFT JOIN policies pol ON pol.created_by = p.id
          AND pol.created_at >= p_period_start
          AND pol.created_at < p_period_end
          AND pol.deleted_at IS NULL
        WHERE m.role IN ('producer', 'admin', 'owner')
          AND m.status = 'active'
        GROUP BY p.id, p.full_name, aw.name
        ORDER BY premium_written DESC
        LIMIT 10
      ) t
    ),
    'top_carriers', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB)
      FROM (
        SELECT
          c.id AS carrier_id,
          c.name AS carrier_name,
          COUNT(pol.id) AS policies_this_week,
          COALESCE(SUM(pol.premium), 0)::NUMERIC AS premium_written
        FROM carriers c
        JOIN policies pol ON pol.carrier_id = c.id
        WHERE pol.created_at >= p_period_start
          AND pol.created_at < p_period_end
          AND pol.deleted_at IS NULL
        GROUP BY c.id, c.name
        ORDER BY premium_written DESC
        LIMIT 10
      ) t
    ),
    'top_lines_of_business', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB)
      FROM (
        SELECT
          pol.line_of_business,
          COUNT(pol.id) AS policies_this_week,
          COALESCE(SUM(pol.premium), 0)::NUMERIC AS premium_written
        FROM policies pol
        WHERE pol.created_at >= p_period_start
          AND pol.created_at < p_period_end
          AND pol.deleted_at IS NULL
          AND pol.line_of_business IS NOT NULL
        GROUP BY pol.line_of_business
        ORDER BY premium_written DESC
        LIMIT 10
      ) t
    )
  );

  -- Service/Ops backlog (ALL agencies)
  v_service_ops := jsonb_build_object(
    'overdue_tasks', v_tasks_overdue,
    'tasks_by_priority', (
      SELECT COALESCE(jsonb_object_agg(priority, cnt), '{}'::JSONB)
      FROM (
        SELECT priority, COUNT(*) AS cnt
        FROM tasks
        WHERE status = 'pending'
        GROUP BY priority
      ) t
    ),
    'tasks_by_category', (
      SELECT COALESCE(jsonb_object_agg(entity_type, cnt), '{}'::JSONB)
      FROM (
        SELECT COALESCE(entity_type, 'other') AS entity_type, COUNT(*) AS cnt
        FROM tasks
        WHERE status = 'pending'
        GROUP BY entity_type
      ) t
    ),
    'overdue_tasks_list', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB)
      FROM (
        SELECT
          t.id,
          t.title,
          t.priority,
          t.due_at,
          EXTRACT(DAY FROM NOW() - t.due_at)::INTEGER AS days_overdue,
          '/' || t.entity_type || 's/' || t.entity_id AS deep_link,
          aw.name AS agency_name
        FROM tasks t
        LEFT JOIN agency_workspaces aw ON aw.id = t.agency_workspace_id
        WHERE t.status = 'pending'
          AND t.due_at < NOW()
        ORDER BY t.due_at ASC
        LIMIT 15
      ) t
    )
  );

  -- Integration health (aggregated)
  v_integration_health := jsonb_build_object(
    'canopy', CASE WHEN v_canopy_pulls IS NOT NULL THEN jsonb_build_object(
      'available', TRUE,
      'pulls_this_week', v_canopy_pulls,
      'successful_pulls', v_canopy_successful,
      'failed_pulls', v_canopy_errors,
      'reconnects_required', v_canopy_reconnects,
      'servicing_pending', v_canopy_servicing_pending,
      'total_policies_synced', v_canopy_policies_synced,
      'error_rate_pct', CASE WHEN v_canopy_pulls > 0
        THEN ROUND((v_canopy_errors::NUMERIC / v_canopy_pulls * 100)::NUMERIC, 1)
        ELSE 0 END
    ) ELSE jsonb_build_object('available', FALSE, 'missing', TRUE) END
  );

  -- ============================================================================
  -- GENERATE ALERTS
  -- ============================================================================

  -- Alert: Leads drop
  IF v_prev_leads_new > 0 AND
     ((v_prev_leads_new - v_leads_new)::NUMERIC / v_prev_leads_new * 100) >= v_leads_drop_pct THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'severity', 'warning',
      'category', 'leads',
      'title', 'Significant drop in new leads (org-wide)',
      'message', 'New leads dropped by ' ||
        ROUND(((v_prev_leads_new - v_leads_new)::NUMERIC / v_prev_leads_new * 100)::NUMERIC, 1) ||
        '% compared to last week (' || v_leads_new || ' vs ' || v_prev_leads_new || ')',
      'evidence', jsonb_build_object('current', v_leads_new, 'previous', v_prev_leads_new)
    ));
  END IF;

  -- Alert: Quotes drop
  IF v_prev_quotes_created > 0 AND
     ((v_prev_quotes_created - v_quotes_created)::NUMERIC / v_prev_quotes_created * 100) >= v_quotes_drop_pct THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'severity', 'warning',
      'category', 'quotes',
      'title', 'Significant drop in quotes (org-wide)',
      'message', 'Quotes created dropped by ' ||
        ROUND(((v_prev_quotes_created - v_quotes_created)::NUMERIC / v_prev_quotes_created * 100)::NUMERIC, 1) ||
        '% compared to last week (' || v_quotes_created || ' vs ' || v_prev_quotes_created || ')',
      'evidence', jsonb_build_object('current', v_quotes_created, 'previous', v_prev_quotes_created)
    ));
  END IF;

  -- Alert: Critical overdue tasks (org-wide)
  IF v_tasks_overdue >= v_overdue_tasks_critical THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'severity', 'critical',
      'category', 'operations',
      'title', 'Critical backlog of overdue tasks (org-wide)',
      'message', v_tasks_overdue || ' tasks are overdue across all agencies (threshold: ' || v_overdue_tasks_critical || ')',
      'evidence', jsonb_build_object('overdue_count', v_tasks_overdue, 'threshold', v_overdue_tasks_critical)
    ));
  END IF;

  -- Alert: Canopy reconnects required
  IF v_canopy_reconnects IS NOT NULL AND v_canopy_reconnects >= v_canopy_reconnects_critical THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'severity', 'critical',
      'category', 'integration',
      'title', 'Canopy connections need attention',
      'message', v_canopy_reconnects || ' Canopy connections require reconnection',
      'evidence', jsonb_build_object('reconnects', v_canopy_reconnects, 'threshold', v_canopy_reconnects_critical)
    ));
  END IF;

  -- Alert: Canopy errors
  IF v_canopy_errors IS NOT NULL AND v_canopy_errors >= v_canopy_errors_critical THEN
    v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
      'severity', 'warning',
      'category', 'integration',
      'title', 'Elevated Canopy sync errors',
      'message', v_canopy_errors || ' Canopy pulls failed this week',
      'evidence', jsonb_build_object('errors', v_canopy_errors, 'total', v_canopy_pulls, 'threshold', v_canopy_errors_critical)
    ));
  END IF;

  -- ============================================================================
  -- BUILD FINAL RESULT
  -- ============================================================================

  v_result := jsonb_build_object(
    'meta', v_meta,
    'kpis', v_kpis,
    'deltas_vs_previous_week', v_deltas,
    'funnel', v_funnel,
    'lists', v_lists,
    'service_ops', v_service_ops,
    'integration_health', v_integration_health,
    'alerts', v_alerts,
    'by_agency', v_by_agency,
    'missing_data', v_missing_data
  );

  RETURN v_result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_ceo_digest_facts_all_agencies TO service_role;

COMMENT ON FUNCTION get_ceo_digest_facts_all_agencies IS
  'Computes aggregated metrics across ALL agency workspaces for CEO-level digest. Fixed: line_of_business column name.';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
