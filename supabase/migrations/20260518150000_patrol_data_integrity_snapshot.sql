-- Patrol read-only data-integrity snapshot for SUP-007 (Overwatch Sentinel).
-- Multi-tenant CRM probes; service_role only (no exec_sql).
-- Rollback: DROP FUNCTION IF EXISTS public.patrol_data_integrity_snapshot(uuid);

CREATE OR REPLACE FUNCTION public.patrol_data_integrity_snapshot(p_agency_workspace_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_checks jsonb := '[]'::jsonb;
  v_count integer;
BEGIN
  -- Check 1: Accounts missing agency_workspace_id
  SELECT COUNT(*) INTO v_count
  FROM accounts a
  WHERE a.agency_workspace_id IS NULL
    AND a.deleted_at IS NULL
    AND (p_agency_workspace_id IS NULL);
  v_checks := v_checks || jsonb_build_object(
    'id', 'accounts_missing_agency_workspace',
    'label', 'Accounts missing agency workspace',
    'count', v_count,
    'severity', 'fail',
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END
  );

  -- Check 2: Leads with account_id but no matching account
  SELECT COUNT(*) INTO v_count
  FROM leads l
  LEFT JOIN accounts a ON a.id = l.account_id
  WHERE l.account_id IS NOT NULL
    AND a.id IS NULL
    AND l.deleted_at IS NULL;
  v_checks := v_checks || jsonb_build_object(
    'id', 'leads_orphan_account',
    'label', 'Leads with orphan account reference',
    'count', v_count,
    'severity', 'fail',
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END
  );

  -- Check 3: Policies missing or invalid account_id
  SELECT COUNT(*) INTO v_count
  FROM policies p
  LEFT JOIN accounts a ON a.id = p.account_id
  WHERE p.deleted_at IS NULL
    AND (p.account_id IS NULL OR a.id IS NULL)
    AND (
      p_agency_workspace_id IS NULL
      OR a.agency_workspace_id = p_agency_workspace_id
    );
  v_checks := v_checks || jsonb_build_object(
    'id', 'policies_missing_or_invalid_account',
    'label', 'Policies missing or invalid account',
    'count', v_count,
    'severity', 'fail',
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END
  );

  -- Check 4: Quotes with invalid account reference
  SELECT COUNT(*) INTO v_count
  FROM quotes q
  LEFT JOIN accounts a ON a.id = q.account_id
  WHERE q.deleted_at IS NULL
    AND a.id IS NULL;
  v_checks := v_checks || jsonb_build_object(
    'id', 'quotes_invalid_account',
    'label', 'Quotes with invalid account reference',
    'count', v_count,
    'severity', 'fail',
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END
  );

  -- Check 5: Tasks without account_id (no tenant linkage)
  SELECT COUNT(*) INTO v_count
  FROM tasks t
  WHERE t.account_id IS NULL
    AND t.deleted_at IS NULL
    AND (p_agency_workspace_id IS NULL);
  v_checks := v_checks || jsonb_build_object(
    'id', 'tasks_without_account',
    'label', 'Tasks without account (no workspace linkage)',
    'count', v_count,
    'severity', 'warn',
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'warn' END
  );

  -- Check 6: Tasks with orphan account or account missing workspace
  SELECT COUNT(*) INTO v_count
  FROM tasks t
  LEFT JOIN accounts a ON a.id = t.account_id
  WHERE t.deleted_at IS NULL
    AND t.account_id IS NOT NULL
    AND (a.id IS NULL OR a.agency_workspace_id IS NULL)
    AND (
      p_agency_workspace_id IS NULL
      OR a.agency_workspace_id = p_agency_workspace_id
    );
  v_checks := v_checks || jsonb_build_object(
    'id', 'tasks_orphan_or_unscoped_account',
    'label', 'Tasks with orphan or unscoped account',
    'count', v_count,
    'severity', 'fail',
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END
  );

  -- Check 7: Duplicate active workspace memberships
  SELECT COALESCE(SUM(dup.cnt - 1), 0)::integer INTO v_count
  FROM (
    SELECT COUNT(*) AS cnt
    FROM agency_workspace_memberships m
    WHERE m.status = 'active'
      AND (
        p_agency_workspace_id IS NULL
        OR m.agency_workspace_id = p_agency_workspace_id
      )
    GROUP BY m.user_id, m.agency_workspace_id
    HAVING COUNT(*) > 1
  ) dup;
  v_checks := v_checks || jsonb_build_object(
    'id', 'duplicate_active_workspace_memberships',
    'label', 'Duplicate active workspace memberships',
    'count', v_count,
    'severity', 'fail',
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END
  );

  -- Check 8: Staff profiles without active workspace membership
  SELECT COUNT(*) INTO v_count
  FROM profiles p
  WHERE p.is_staff = true
    AND p.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM agency_workspace_memberships m
      WHERE m.user_id = p.id
        AND m.status = 'active'
        AND (
          p_agency_workspace_id IS NULL
          OR m.agency_workspace_id = p_agency_workspace_id
        )
    );
  v_checks := v_checks || jsonb_build_object(
    'id', 'staff_without_workspace_membership',
    'label', 'Staff without active workspace membership',
    'count', v_count,
    'severity', 'fail',
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END
  );

  RETURN jsonb_build_object(
    'sampled_at', to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'agency_workspace_id', p_agency_workspace_id,
    'checks', v_checks
  );
END;
$$;

COMMENT ON FUNCTION public.patrol_data_integrity_snapshot(uuid) IS
  'Read-only multi-tenant CRM integrity snapshot for Overwatch SUP-007. Callable by service_role only.';

REVOKE ALL ON FUNCTION public.patrol_data_integrity_snapshot(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.patrol_data_integrity_snapshot(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.patrol_data_integrity_snapshot(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.patrol_data_integrity_snapshot(uuid) TO service_role;
