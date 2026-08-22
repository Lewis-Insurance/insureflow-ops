# Security Review Findings — 2026-08-15

Validation of SECURITY DEFINER RPC findings against migration source code.

---

## Finding 1: `get_account_insurance_profile` — SECURITY DEFINER with no auth guard

**Status: CONFIRMED**

**Migration:** `supabase/migrations/20251228200000_predictive_analytics_suite.sql` (lines 626–690)

**Evidence:**

```sql
CREATE OR REPLACE FUNCTION get_account_insurance_profile(
  p_account_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ...
BEGIN
  -- Get active policy lines
  SELECT ...
  FROM policies p
  WHERE p.account_id = p_account_id
    AND p.status = 'active'
    AND p.deleted_at IS NULL;
  ...
END;
$$;
```

**Grant (line 832–833):**
```sql
GRANT EXECUTE ON FUNCTION get_account_insurance_profile TO authenticated;
GRANT EXECUTE ON FUNCTION get_account_insurance_profile TO service_role;
```

**Auth guard inside function body:** NONE. No `is_staff()` check, no workspace membership check. Any authenticated user can call this with any `account_id` and retrieve the full insurance profile (lines held, premium totals, coverage flags) for any account in the system.

**Later fixes:** No subsequent migration recreates or hardens this function. Searched all migrations — only appears in `20251228200000`.

---

## Finding 2: `get_upcoming_renewals` — SECURITY DEFINER with no auth guard

**Status: CONFIRMED**

**Migration:** `supabase/migrations/20251228200000_predictive_analytics_suite.sql` (lines 577–623)

**Evidence:**

```sql
CREATE OR REPLACE FUNCTION get_upcoming_renewals(
  p_agency_workspace_id UUID,
  p_days_ahead INT DEFAULT 60,
  p_account_id UUID DEFAULT NULL
)
RETURNS TABLE (...)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT ...
  FROM policies p
  JOIN accounts a ON p.account_id = a.id
  LEFT JOIN carriers c ON p.carrier_id = c.id
  WHERE a.agency_workspace_id = p_agency_workspace_id
    AND p.status = 'active'
    ...
END;
$$;
```

**Grant (line 830–831):**
```sql
GRANT EXECUTE ON FUNCTION get_upcoming_renewals TO authenticated;
GRANT EXECUTE ON FUNCTION get_upcoming_renewals TO service_role;
```

**Auth guard inside function body:** NONE. No `is_staff()` check, no workspace membership verification. Any authenticated user can pass any `agency_workspace_id` and enumerate all upcoming renewals (policy numbers, account names, premiums, carrier names, expiration dates) for any workspace.

**Later fixes:** No subsequent migration addresses this function. Only appears in `20251228200000`.

---

## Finding 3: `list_coverage_gap_opportunities` — SECURITY DEFINER with no auth guard

**Status: CONFIRMED**

**Migration:** `supabase/migrations/20251228200000_predictive_analytics_suite.sql` (lines 772–826)

**Evidence:**

```sql
CREATE OR REPLACE FUNCTION list_coverage_gap_opportunities(
  p_agency_workspace_id UUID,
  p_status TEXT DEFAULT NULL,
  p_severity TEXT DEFAULT NULL,
  p_account_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 100,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (...)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT ...
  FROM coverage_gap_opportunities cgo
  JOIN accounts a ON cgo.account_id = a.id
  WHERE a.agency_workspace_id = p_agency_workspace_id
    ...
END;
$$;
```

**Grant (line 835–836):**
```sql
GRANT EXECUTE ON FUNCTION list_coverage_gap_opportunities TO authenticated;
GRANT EXECUTE ON FUNCTION list_coverage_gap_opportunities TO service_role;
```

**Auth guard inside function body:** NONE. Any authenticated user can enumerate all coverage gap opportunities (account names, opportunity keys, estimated premiums, rationale) for any workspace.

**Later fixes:** No subsequent migration addresses this function. Only appears in `20251228200000`.

---

## Finding 4: `aggregate_renewal_risk_indicators`, `calculate_renewal_risk_scores`, `refresh_renewal_intelligence`

**Status: CONFIRMED**

**Migration:** `supabase/migrations/20260204120000_renewal_intelligence_sync.sql`

**Evidence:**

All four functions in this file are SECURITY DEFINER with no auth guards:

```sql
-- Line 100
$$ LANGUAGE plpgsql SECURITY DEFINER;  -- sync_policies_to_renewals (fixed in 20260702090000)

-- Line 175
$$ LANGUAGE plpgsql SECURITY DEFINER;  -- aggregate_renewal_risk_indicators

-- Line 271
$$ LANGUAGE plpgsql SECURITY DEFINER;  -- calculate_renewal_risk_scores

-- Line 310
$$ LANGUAGE plpgsql SECURITY DEFINER;  -- refresh_renewal_intelligence
```

**Grants (lines 315–318):**
```sql
GRANT EXECUTE ON FUNCTION public.sync_policies_to_renewals(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aggregate_renewal_risk_indicators() TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_renewal_risk_scores() TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_renewal_intelligence(INTEGER) TO authenticated;
```

**Auth guard inside function bodies:** NONE for `aggregate_renewal_risk_indicators`, `calculate_renewal_risk_scores`, `refresh_renewal_intelligence`. No `is_staff()`, no workspace membership check.

**Later fixes:**
- `sync_policies_to_renewals` was **FIXED** in `20260702090000_security_lockdown_triage_search_rpcs.sql` — prepended `is_staff()` guard and revoked PUBLIC/anon.
- `aggregate_renewal_risk_indicators` — **NOT FIXED**. Any authenticated user can trigger a full-book write updating all renewal records.
- `calculate_renewal_risk_scores` — **NOT FIXED**. Any authenticated user can trigger risk recalculation on all renewals.
- `refresh_renewal_intelligence` — **NOT FIXED**. Any authenticated user can run the full pipeline (sync + aggregate + score) across all workspaces.

None of the three unfixed functions have `SET search_path` either.

---

## Finding 5: `recalculate_day_sheet_totals` — SECURITY DEFINER with no auth guard

**Status: CONFIRMED**

**Migration:** `supabase/migrations/20260108100000_fix_day_sheet_totals.sql` (lines 82–130)

**Evidence:**

```sql
CREATE OR REPLACE FUNCTION recalculate_day_sheet_totals(p_day_sheet_id UUID DEFAULT NULL)
RETURNS TABLE (...)
AS $$
DECLARE
    ds_record RECORD;
    v_totals RECORD;
    v_old_total NUMERIC;
BEGIN
    FOR ds_record IN
        SELECT ds.id, ds.sheet_date, ds.grand_total
        FROM day_sheets ds
        WHERE ds.deleted_at IS NULL
          AND (p_day_sheet_id IS NULL OR ds.id = p_day_sheet_id)
    LOOP
        ...
        UPDATE day_sheets SET ...
        ...
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Grant (line 135):**
```sql
GRANT EXECUTE ON FUNCTION recalculate_day_sheet_totals(UUID) TO authenticated;
```

**Auth guard inside function body:** NONE. No `is_staff()`, no workspace scoping. When called with `NULL`, any authenticated user can trigger a recalculation that writes to **all** day sheets across all workspaces. No `SET search_path` either.

**Later fixes:** The function is referenced in `20260108110000_auto_link_payments_to_day_sheets.sql` only as a one-shot data fix call (`SELECT recalculate_day_sheet_totals(NULL);`). No migration recreates or hardens the function.

---

## Finding 6: `perform_soft_delete` — SECURITY DEFINER with role check but no workspace scoping

**Status: CONFIRMED (partial — has role check, lacks workspace scoping)**

**Migration:** `supabase/migrations/20260204000001_harden_soft_delete_functions.sql` (lines 11–59)

**Evidence:**

```sql
CREATE OR REPLACE FUNCTION public.perform_soft_delete(
  p_table_name TEXT,
  p_record_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted BOOLEAN := FALSE;
  v_allowed_tables TEXT[] := ARRAY[
    'accounts', 'policies', 'quotes', 'tasks',
    'documents', 'communications', 'contacts'
  ];
BEGIN
  -- Enforce allowlist to prevent arbitrary table updates
  IF p_table_name IS NULL OR NOT (p_table_name = ANY(v_allowed_tables)) THEN
    RAISE EXCEPTION 'Soft delete not allowed for table %', p_table_name;
  END IF;

  -- Require staff or admin role
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND (
        profiles.role IN ('admin', 'staff', 'owner', 'producer', 'csr', 'accounting')
        OR profiles.is_staff = TRUE
      )
  ) THEN
    RAISE EXCEPTION 'Insufficient privileges to delete records';
  END IF;

  -- Perform the soft delete
  EXECUTE format(
    'UPDATE public.%I SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING TRUE',
    p_table_name
  ) INTO v_deleted USING p_record_id;
  ...
END;
$$;
```

**Grants (lines 108–112):**
```sql
REVOKE ALL ON FUNCTION public.perform_soft_delete(TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_soft_deleted(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.perform_soft_delete(TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_soft_deleted(TEXT, UUID) TO authenticated;
```

**Auth guard inside function body:** YES — checks `profiles.role` and `is_staff`. Also has a table allowlist.

**Workspace scoping:** NONE. The function does not verify that the caller has membership in the workspace that owns the record being deleted. A staff user in Workspace A can soft-delete records belonging to Workspace B.

**Later fixes:** No subsequent migration addresses this gap. Only appears in `20260204000001`.

---

## Finding 7: `automation_platform_settings` table — no RLS

**Status: CONFIRMED**

**Migration:** `supabase/migrations/20251228600000_automation_platform_foundation.sql` (lines 855–885)

**Evidence:**

```sql
CREATE TABLE IF NOT EXISTS automation_platform_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    max_events_per_minute INT NOT NULL DEFAULT 100,
    max_gateway_calls_per_minute INT NOT NULL DEFAULT 50,
    dispatcher_batch_size INT NOT NULL DEFAULT 50,
    dispatcher_interval_seconds INT NOT NULL DEFAULT 15,
    max_retry_attempts INT NOT NULL DEFAULT 10,
    features JSONB NOT NULL DEFAULT '{ ... }',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id)
);
```

**RLS enabled:** NO. There is no `ALTER TABLE automation_platform_settings ENABLE ROW LEVEL SECURITY;` anywhere in the migration. The migration explicitly enables RLS for 5 other tables (`automation_event_outbox`, `automation_requests`, `automation_api_keys`, `service_tickets`, `service_ticket_messages`) but NOT for `automation_platform_settings`.

**RLS policies:** NONE.

**Impact:** Any authenticated user (or anon, if default grants are permissive) can read and potentially modify global automation settings (kill switches, rate limits, feature flags).

**Later fixes:** No subsequent migration adds RLS to this table. Only appears in `20251228600000`.

---

## Finding 8: `admin_budget_alerts` table — no RLS

**Status: CONFIRMED**

**Migration:** `supabase/migrations/20260410000009_enhanced_admin_system.sql` (lines 267–275)

**Evidence:**

```sql
CREATE TABLE IF NOT EXISTS public.admin_budget_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES public.admin_budgets(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('spend_spike', 'token_spike', 'error_spike', 'threshold_reached')),
  current_value NUMERIC(15, 4),
  threshold_value NUMERIC(15, 4),
  notified_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
```

**RLS enabled:** NO. The migration enables RLS on `admin_permissions`, `user_usage_metrics`, `admin_impersonations`, `admin_audit_log`, and `admin_budgets` (lines 331–393) but **NOT** on `admin_budget_alerts`.

**RLS policies:** NONE for `admin_budget_alerts`.

**Impact:** Any authenticated user can read (and potentially write) budget alert records, which may reveal spending/token usage patterns and internal thresholds.

**Later fixes:** No subsequent migration adds RLS to this table. Only appears in `20260410000009`.

---

## Summary

| # | Function/Table | Issue | Status | Fixed? |
|---|---|---|---|---|
| 1 | `get_account_insurance_profile` | SECURITY DEFINER, no auth guard, granted to authenticated | CONFIRMED | NO |
| 2 | `get_upcoming_renewals` | SECURITY DEFINER, no auth guard, granted to authenticated | CONFIRMED | NO |
| 3 | `list_coverage_gap_opportunities` | SECURITY DEFINER, no auth guard, granted to authenticated | CONFIRMED | NO |
| 4a | `sync_policies_to_renewals` | SECURITY DEFINER, no auth guard | ALREADY FIXED | Yes — `20260702090000` |
| 4b | `aggregate_renewal_risk_indicators` | SECURITY DEFINER, no auth guard, granted to authenticated | CONFIRMED | NO |
| 4c | `calculate_renewal_risk_scores` | SECURITY DEFINER, no auth guard, granted to authenticated | CONFIRMED | NO |
| 4d | `refresh_renewal_intelligence` | SECURITY DEFINER, no auth guard, granted to authenticated | CONFIRMED | NO |
| 5 | `recalculate_day_sheet_totals` | SECURITY DEFINER, no auth guard, no workspace scope, write to all day sheets | CONFIRMED | NO |
| 6 | `perform_soft_delete` | Has role check ✓, but no workspace scoping — cross-tenant delete possible | CONFIRMED (partial) | NO |
| 7 | `automation_platform_settings` | No RLS enabled, no policies | CONFIRMED | NO |
| 8 | `admin_budget_alerts` | No RLS enabled, no policies | CONFIRMED | NO |
