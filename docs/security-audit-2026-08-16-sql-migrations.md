# Security Audit: SQL Migrations — 2026-08-16

## Scope
All Supabase migrations in `supabase/migrations/`. Focused on SECURITY DEFINER functions, RLS gaps, overly permissive policies, and dangerous GRANTs.

## Excluded (already known)
- profiles_update_self (20250930183833)
- update_account_secure granted to anon (20250908231023)
- rollback_import_batch no auth guard (20251229100000)
- Predictive analytics RPCs (20251228200000)
- Renewal intelligence RPCs (20260204120000)
- recalculate_day_sheet_totals (20260108100000)
- perform_soft_delete cross-tenant (20260204000001)
- automation_platform_settings no RLS (20251228600000)
- admin_budget_alerts no RLS (20260410000009)

---

## HIGH Severity Findings

### 1. `communications` SELECT policy allows cross-tenant read

**File:** `supabase/migrations/20251230210000_fix_communications_rls.sql`, lines 22-25  
**Function/Object:** RLS policy `communications_select_policy` on `public.communications`  
**Vulnerability:** The SELECT policy uses `USING (true)` with role `authenticated`, allowing any authenticated user to read ALL communications (call logs, emails, SMS, notes, meetings) across ALL workspaces/tenants.  
**Attack chain:**
1. Attacker signs up or compromises any authenticated user account
2. Calls `supabase.from('communications').select('*')` 
3. Retrieves all communications for every customer across every tenant (names, emails, call content, meeting notes)

**Root cause:** Migration `20251225000002` created a proper `is_staff_or_admin()` SELECT policy. Migration `20251230210000` replaced it with `USING(true)`. The batch5a2 hardening (`20260628185655`) only fixed INSERT/UPDATE/DELETE policies — SELECT was never restored.

---

### 2. `get_or_create_dm_conversation` — no auth, no search_path, PUBLIC EXECUTE

**File:** `supabase/migrations/20260410000005_team_messaging.sql`, line 299  
**Function:** `public.get_or_create_dm_conversation(UUID, UUID, UUID)`  
**Vulnerability:** SECURITY DEFINER function with:
- No `SET search_path` (search_path injection)
- No `is_staff()` or `auth.uid()` check
- No explicit REVOKE (defaults to PUBLIC EXECUTE, including `anon`)

**Attack chain:**
1. Attacker uses the public Supabase anon key
2. Calls `rpc('get_or_create_dm_conversation', { p_user_id_1: attacker_uuid, p_user_id_2: victim_uuid, p_agency_workspace_id: any_workspace_uuid })`
3. Function (running as superuser, bypassing RLS) creates a team conversation in the target workspace and adds both users as participants
4. Achieves unauthorized conversation creation between arbitrary users in any workspace

---

### 3. `get_unread_message_counts` — no auth, no search_path, PUBLIC EXECUTE

**File:** `supabase/migrations/20260410000005_team_messaging.sql`, line 348  
**Function:** `public.get_unread_message_counts(UUID)`  
**Vulnerability:** SECURITY DEFINER function with:
- No `SET search_path`
- No auth check
- Accepts arbitrary `p_user_id` (not `auth.uid()`)
- No explicit REVOKE (PUBLIC EXECUTE)

**Attack chain:**
1. Attacker uses the anon key
2. Calls `rpc('get_unread_message_counts', { p_user_id: target_uuid })`
3. Retrieves all conversation UUIDs and unread counts for the target user
4. Leaks conversation participation metadata for any user

---

### 4. `queue_push_notification` — no auth, no search_path, PUBLIC EXECUTE

**File:** `supabase/migrations/20251228000005_mobile_push_notifications.sql`, line 366  
**Function:** `public.queue_push_notification(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, UUID, UUID)`  
**Vulnerability:** SECURITY DEFINER function with:
- No `SET search_path`
- No auth check
- No explicit REVOKE

**Attack chain:**
1. Attacker uses the anon key
2. Calls `rpc('queue_push_notification', { p_user_id: victim_uuid, p_title: 'Phishing', p_body: 'Click here...', p_category: 'system' })`
3. Inserts into `push_notification_queue` and `notification_history` as the definer (bypasses RLS)
4. Victim receives attacker-controlled push notification appearing as a system message

---

### 5. `mark_notifications_read` — no auth, no search_path, PUBLIC EXECUTE

**File:** `supabase/migrations/20251228000005_mobile_push_notifications.sql`, line 446  
**Function:** `public.mark_notifications_read(UUID, UUID[])`  
**Vulnerability:** SECURITY DEFINER function with no auth check, no search_path, PUBLIC EXECUTE.  
**Attack chain:**
1. Any caller marks all notifications as read for any user
2. Suppresses legitimate unread notification indicators for targeted users (DoS on notification visibility)

---

## MEDIUM Severity Findings

### 6. `intake_submissions` — SELECT/INSERT/UPDATE USING(true) to PUBLIC

**File:** `supabase/migrations/20251218204626_acord_form_automation_suite.sql`, lines 378-387  
**Object:** RLS policies on `public.intake_submissions`  
**Vulnerability:** Three policies (`intake_submissions_select`, `intake_submissions_insert`, `intake_submissions_update`) use `USING(true)` / `WITH CHECK(true)` with no `TO` role clause (defaults to PUBLIC). The `anon` role can:
- Read all intake form submissions (form field values, account_id references, access tokens)
- Insert arbitrary submissions  
- Update any submission's status or field values

**Note:** The comment in batch6b (`20260628192844`) explicitly flagged this as "Left OPEN" but never resolved. The separate `commercial_intake_submissions` table (20260705190000) IS properly secured — this is the legacy ACORD intake table.

---

### 7. `get_unread_notification_count` — no auth, PUBLIC EXECUTE

**File:** `supabase/migrations/20251228000005_mobile_push_notifications.sql`, line 432  
**Function:** `public.get_unread_notification_count(UUID)`  
**Vulnerability:** SECURITY DEFINER, no auth check, no search_path, PUBLIC EXECUTE. Leaks notification count for any user.

---

### 8. `calculate_goal_progress` — no auth, no search_path, PUBLIC EXECUTE

**File:** `supabase/migrations/20251228000004_goal_management.sql`, line 640  
**Function:** `public.calculate_goal_progress(UUID)`  
**Vulnerability:** SECURITY DEFINER function with no auth, no search_path, PUBLIC EXECUTE. Reads goal data AND performs `UPDATE goals SET status, progress_percentage` for any goal_id. Any caller can manipulate goal progress/status.

---

### 9. `refresh_leaderboard` — no auth, no search_path, PUBLIC EXECUTE

**File:** `supabase/migrations/20251228000004_goal_management.sql`, line 698  
**Function:** `public.refresh_leaderboard(UUID)`  
**Vulnerability:** SECURITY DEFINER, no auth, no search_path, PUBLIC EXECUTE. Performs `DELETE FROM leaderboard_entries` and `UPDATE leaderboards` for any leaderboard_id. Destructive operation accessible to anon.

---

### 10. `check_user_achievements` — no auth, no search_path, PUBLIC EXECUTE

**File:** `supabase/migrations/20251228000004_goal_management.sql`, line 720  
**Function:** `public.check_user_achievements(UUID, UUID)`  
**Vulnerability:** SECURITY DEFINER, no auth, no search_path, PUBLIC EXECUTE. Queries goals and `INSERT INTO user_achievements` for any user in any workspace. Can award arbitrary achievements.

---

### 11. `recalculate_all_ao_priorities` — SECURITY DEFINER without SET search_path

**File:** `supabase/migrations/20260107120001_ao_renewals_recalculate_function.sql`, line 21  
**Function:** `public.recalculate_all_ao_priorities()`  
**Vulnerability:** SECURITY DEFINER without `SET search_path = public`. Granted only to `service_role`, so the primary risk is search_path injection if an attacker can create objects in a schema earlier in the search_path of a privileged session.

---

## Recommended Fixes

### For findings 2-5, 7-10 (unguarded SECURITY DEFINER functions):
```sql
-- Template fix for each function:
CREATE OR REPLACE FUNCTION public.<function_name>(...)
...
SECURITY DEFINER
SET search_path = public  -- Add this
AS $$
BEGIN
  IF NOT public.is_staff() THEN  -- Add auth guard
    RAISE EXCEPTION 'permission denied: staff only' USING ERRCODE = '42501';
  END IF;
  ...
END;
$$;

-- Then restrict EXECUTE:
REVOKE EXECUTE ON FUNCTION public.<function_name>(...) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.<function_name>(...) TO authenticated, service_role;
```

### For finding 1 (communications SELECT):
```sql
DROP POLICY IF EXISTS "communications_select_policy" ON public.communications;
CREATE POLICY "communications_select_policy" ON public.communications
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agency_workspace_memberships m
      WHERE m.agency_workspace_id = communications.agency_workspace_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );
```

### For finding 6 (intake_submissions):
```sql
DROP POLICY IF EXISTS intake_submissions_select ON intake_submissions;
DROP POLICY IF EXISTS intake_submissions_insert ON intake_submissions;
DROP POLICY IF EXISTS intake_submissions_update ON intake_submissions;

CREATE POLICY intake_submissions_select ON intake_submissions
  FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY intake_submissions_insert ON intake_submissions
  FOR INSERT TO authenticated WITH CHECK (public.is_staff());
CREATE POLICY intake_submissions_update ON intake_submissions
  FOR UPDATE TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

REVOKE INSERT, UPDATE, DELETE ON intake_submissions FROM anon;
```

### For finding 11:
```sql
ALTER FUNCTION public.recalculate_all_ao_priorities() SET search_path = public;
```
