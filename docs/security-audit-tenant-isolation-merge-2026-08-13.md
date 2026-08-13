# Security Audit: Tenant Isolation & Account Merge Logic

**Date:** 2026-08-13
**Scope:** Account merge system, tenant isolation, role self-modification, workspace creation
**Auditor:** Automated security review

---

## Executive Summary

The merge system is **well-hardened** with proper EXECUTE restrictions and `is_staff()` gates on every public-facing wrapper. However, several **MEDIUM and LOW** severity findings exist around **cross-tenant merge** (no workspace boundary check in the merge engine), **profile self-modification** (users can update their own `role`/`is_staff` columns), and **missing `agency_workspace_id`** in frontend account-creation code. No CRITICAL findings were identified.

---

## 1. Account Merge Security

### 1.1 `_do_account_merge` Access Control — PASS

**Latest definition:** `supabase/migrations/20260702171500_master_coi_merge_allowlist.sql` (lines 24-270)

The function is `SECURITY DEFINER` with explicit lockdown:

```sql
REVOKE ALL ON FUNCTION public._do_account_merge(uuid, uuid[], text, boolean) FROM public;
REVOKE ALL ON FUNCTION public._do_account_merge(uuid, uuid[], text, boolean) FROM anon;
REVOKE ALL ON FUNCTION public._do_account_merge(uuid, uuid[], text, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public._do_account_merge(uuid, uuid[], text, boolean) TO postgres;
GRANT EXECUTE ON FUNCTION public._do_account_merge(uuid, uuid[], text, boolean) TO service_role;
```

**Verdict:** Correctly restricted. No authenticated user can call `_do_account_merge` directly. Only `postgres` and `service_role` can EXECUTE it, and it is reached only via the SECURITY DEFINER wrappers below.

### 1.2 `merge_accounts_manual` — PASS (with caveat, see 1.6)

**File:** `supabase/migrations/20260629160000_merge_ux_preview_and_shared_path.sql` (lines 87-115)

- Has `is_staff()` guard at entry (line 96-98)
- `SECURITY DEFINER` + `SET search_path TO 'public'`
- EXECUTE revoked from `anon` and `public`; granted to `authenticated`
- Calls `_do_account_merge` internally (which it can reach as SECURITY DEFINER running as `postgres`)

### 1.3 `relgraph_merge_duplicate_group` — PASS (with caveat, see 1.6)

**File:** `supabase/migrations/20260629160000_merge_ux_preview_and_shared_path.sql` (lines 52-84)

- Has `is_staff()` guard at entry (line 62-64)
- `SECURITY DEFINER` + `SET search_path TO 'public'`
- Validates group exists, is not already merged, is accounts-type, and survivor is in group
- EXECUTE revoked from `anon` and `public`; granted to `authenticated`

### 1.4 `preview_merge` — PASS

**File:** `supabase/migrations/20260629240000_relgraph_v2_merge_consolidation.sql` (lines 268-326)

- Has `is_staff()` guard at entry (line 285-287)
- Calls `_do_account_merge(..., false)` — pure compute, no mutations
- `SECURITY DEFINER` + `SET search_path TO 'public'`

### 1.5 `unmerge_account` — PASS (with caveat, see 1.6)

**File:** `supabase/migrations/20260629104000_merge_hardening_t7_unmerge.sql` (lines 8-101)

- Has `is_staff()` guard at entry (line 30-32)
- Validates merge history exists, is account type, not already unmerged, single-loser only
- EXECUTE revoked from `anon` and `public`; granted to `authenticated`

### 1.6 Cross-Tenant Merge — FINDING (MEDIUM)

**Severity:** MEDIUM
**Finding:** The merge engine does NOT check `agency_workspace_id` boundaries.

**Attack chain:**
1. A staff user in Workspace A calls `merge_accounts_manual(survivor_from_A, [loser_from_B])`.
2. The `is_staff()` gate passes (the user is staff).
3. `_do_account_merge` verifies the survivor is active and the losers are active, but never checks that all accounts belong to the same workspace.
4. The loser's child data (policies, quotes, renewals, documents, notes) is reparented to the survivor — effectively moving Workspace B's data into Workspace A.

**Evidence:**
- `_do_account_merge` (lines 51-59 of the consolidation migration) checks `p_survivor is null`, `p_survivor = any(p_losers)`, `deleted_at is null` — but never `agency_workspace_id`.
- `assert_mergeable` (migration `20260629101000`) checks cross-type, conflicting TIN, DOB, FEIN, and Jr/Sr suffix — but never workspace.
- `merge_accounts_manual` and `relgraph_merge_duplicate_group` do not add workspace checks either.

**Mitigating factors:**
- In a single-tenant deployment (only one agency workspace), this is not exploitable.
- The `accounts` SELECT RLS policy does have a workspace membership check, but the merge function runs as SECURITY DEFINER (bypassing RLS), so accounts from another workspace are visible to the merge body.
- The `duplicate_groups` table does not appear to have an `agency_workspace_id` column, so cross-workspace groups can theoretically be suggested.

**Recommendation:** Add a workspace-boundary check at the top of `_do_account_merge`:
```sql
IF p_apply THEN
  PERFORM 1 FROM public.accounts
  WHERE id = ANY(p_survivor || p_losers) AND deleted_at IS NULL
  GROUP BY agency_workspace_id
  HAVING COUNT(DISTINCT agency_workspace_id) > 1;
  IF FOUND THEN
    RAISE EXCEPTION '_do_account_merge: cross-workspace merge blocked';
  END IF;
END IF;
```

### 1.7 Non-staff User Merge — PASS

**Finding:** No code path allows a non-staff user to trigger a merge. All four entry points (`merge_accounts_manual`, `relgraph_merge_duplicate_group`, `preview_merge`, `unmerge_account`) check `is_staff()` and raise an exception if the check fails. `_do_account_merge` itself is not callable by `authenticated` role.

### 1.8 `list_recent_merges` — PASS

**File:** `supabase/migrations/20260629161000_merge_ux_recent_merges.sql`

- Staff-gated: `(auth.uid() is null or public.is_staff())`
- Revoked from `anon` and `public`

---

## 2. Frontend Merge/Unmerge Calls

### 2.1 Merge RPCs in Frontend — PASS (relies on server-side guards)

**Files examined:**
- `src/hooks/useRelationshipGraph.ts` — Calls `merge_accounts_manual`, `preview_merge`, `relgraph_merge_duplicate_group`, `unmerge_account`, `list_recent_merges`
- `src/pages/MergeCustomersPage.tsx` — Calls `mergeAccountsManual` from the hook
- `src/pages/DuplicatesReviewPage.tsx` — Calls `useDuplicateGroups().merge` and `unmergeAccount`

**Finding:** The frontend does NOT validate workspace context before calling merge RPCs. It trusts the server-side `is_staff()` guard entirely. This is acceptable because:
1. The merge RPCs are SECURITY DEFINER with staff gates
2. The frontend cannot bypass server-side checks

**However:** The frontend also does not prevent a user from selecting accounts from different workspaces in the merge UI. The `MergeCustomersPage` fetches accounts by ID from the `accounts` table (line 41-48) with no workspace filter. If the accounts RLS allows the user to see accounts from multiple workspaces (via the `is_staff` fallback), they could select cross-workspace pairs. This ties back to Finding 1.6.

---

## 3. Tenant Isolation in Frontend Queries

### 3.1 `useCustomers` — FINDING (LOW)

**File:** `src/hooks/useCustomers.ts`

**Finding:** The `createCustomer` function (lines 78-116) inserts into `accounts` without setting `agency_workspace_id`:

```typescript
const { data, error } = await supabase
  .from('accounts')
  .insert([{
    name: customerData.name,
    email: customerData.email,
    // ... no agency_workspace_id
  }])
```

**Impact:** The new account will have `agency_workspace_id = NULL`, making it an orphan not scoped to any workspace. The accounts INSERT RLS policy (`accounts_insert_scoped`) requires workspace membership OR `is_staff=true`, so:
- Staff users can insert orphan accounts (no workspace).
- Non-staff workspace members would need to specify the workspace ID that matches their membership.
- The `is_staff` fallback allows the INSERT to succeed even without a workspace ID.

**Severity:** LOW — The account is orphaned but still only accessible to staff. However, it creates data integrity issues and could lead to accounts being invisible to non-staff workspace members.

**Recommendation:** Always pass `agency_workspace_id` from the active workspace context when creating accounts.

### 3.2 `usePolicies` — PASS (RLS-dependent)

**File:** `src/hooks/usePolicies.ts`

The policy queries do not filter by `agency_workspace_id` directly, but policies are scoped to accounts which are workspace-scoped. The account-child RLS (policies via `account_id` FK) combined with the accounts RLS creates an implicit workspace boundary.

**Note:** The `usePolicyStats` function (lines 171-248) fetches ALL policies without any filter — it relies entirely on RLS. Since the `is_staff` fallback in accounts RLS allows staff to see all workspaces, staff users see stats for all tenants mixed together.

### 3.3 `useLeads` — PASS (RLS-dependent)

**File:** `src/hooks/useLeads.ts`

Leads have their own `agency_workspace_id` column with workspace-scoped RLS (sec005 migration). The frontend does not add workspace filters but the RLS policy correctly enforces isolation.

### 3.4 `is_staff` Fallback in Accounts RLS — FINDING (MEDIUM)

**File:** `supabase/migrations/20260628172446_batch1d_accounts_rls_and_anon_revoke.sql`

**Finding:** The accounts RLS policies all include an `is_staff` fallback:

```sql
CREATE POLICY accounts_select_scoped ON public.accounts
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      EXISTS (SELECT 1 FROM public.agency_workspace_memberships m
              WHERE m.user_id = auth.uid() AND m.status = 'active'
                AND m.agency_workspace_id = accounts.agency_workspace_id)
      OR EXISTS (SELECT 1 FROM public.profiles pr
                 WHERE pr.id = auth.uid() AND COALESCE(pr.is_staff, false) = true)
    )
  );
```

The `is_staff` branch has **no workspace scoping**. Any user with `is_staff=true` can see, insert into, update, and delete accounts across ALL workspaces. This was an intentional design decision (documented in the migration comment: "all 8 staff (incl. Tamrah Tyre, who lacks an f1f07037 membership) see all 1,714 active accounts via the is_staff branch -> zero lockout").

**Severity:** MEDIUM in a multi-tenant context. In the current single-agency deployment, all staff should see everything. But when a second agency is onboarded, staff users in Agency A will see Agency B's accounts and vice versa, violating tenant isolation.

**Recommendation:** When multi-tenancy is needed, remove the `is_staff` fallback from data-access RLS policies and ensure all staff have proper workspace memberships.

---

## 4. User Role Self-Modification

### 4.1 Profile Update RLS — FINDING (HIGH)

**File:** `supabase/migrations/20250930183833_373db4d5-294b-423d-ab67-a57c3112efcf.sql` (lines 33-37)

**Finding:** The `profiles_update_self` policy allows users to update their own profile with no column restrictions:

```sql
CREATE POLICY "profiles_update_self"
ON profiles FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());
```

**Attack chain:**
1. An authenticated user (role=`customer`, `is_staff=false`) calls:
   ```
   supabase.from('profiles').update({ role: 'admin', is_staff: true }).eq('id', user.id)
   ```
2. The RLS policy passes (`id = auth.uid()`).
3. The user is now `admin` + `is_staff=true`.
4. All `is_staff()` checks pass. The user can now:
   - Access all accounts across all workspaces (via the `is_staff` RLS fallback)
   - Call all staff-gated RPCs (merge, search, triage, etc.)
   - Access the admin UI

**Severity:** HIGH — This is a privilege escalation vulnerability. Any authenticated user can grant themselves admin + staff privileges.

**Mitigating factors:**
- The `admin-update-user` edge function uses `requireActiveProvisionedAdmin` for server-side role changes, suggesting the intention was to restrict role changes to admin edge functions only. However, the RLS policy on the `profiles` table does not enforce this restriction.
- The `profiles_all_staff` policy also allows staff to modify ANY profile, which is intentional for admin workflows.

**Recommendation:** Add column restrictions to `profiles_update_self` to prevent users from modifying security-sensitive columns:
```sql
CREATE POLICY "profiles_update_self"
ON profiles FOR UPDATE
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  -- Block self-escalation: these columns unchanged
  AND role = (SELECT role FROM profiles WHERE id = auth.uid())
  AND is_staff = (SELECT is_staff FROM profiles WHERE id = auth.uid())
);
```
Or use a trigger to prevent modifications to `role`, `is_staff`, `status`, `deleted_at`, `deleted_by` outside of service_role context.

### 4.2 Agency Workspace Memberships — PASS

**File:** `supabase/migrations/20251228000000_m0_agency_workspace_foundation.sql` (lines 329-333)

The `memberships_update` policy requires `is_agency_admin(agency_workspace_id)`:

```sql
CREATE POLICY "memberships_update" ON agency_workspace_memberships
  FOR UPDATE USING (
    is_agency_admin(agency_workspace_id)
    AND (role != 'owner' OR is_agency_owner(agency_workspace_id))
  );
```

A non-admin user cannot update their own membership role. Only workspace admins can update memberships, and only owners can change the owner role. This is correctly implemented.

**However:** Combined with Finding 4.1, if a user escalates their profile to `admin`+`is_staff`, they would pass `is_agency_admin` (since `is_staff` is checked in some code paths) and could then modify workspace memberships.

### 4.3 Frontend Role Update — PASS (edge function gated)

**File:** `src/hooks/useAgencyWorkspace.ts` (lines 413-440)

The `updateMember` mutation updates memberships via the Supabase client, which is properly gated by the `memberships_update` RLS policy. The `admin-update-user` edge function (lines 68-78) requires `requireActiveProvisionedAdmin`.

---

## 5. Workspace Creation/Joining

### 5.1 `create_workspace` Edge Function — FINDING (LOW)

**File:** `supabase/functions/create_workspace/index.ts`

**Finding:** This edge function creates a "workspace" (the `workspaces` table — a document processing workspace, NOT an `agency_workspaces` tenant). Any authenticated user can call it. It:

1. Requires authentication via `requireAuth` (line 24)
2. Creates a record in the `workspaces` table (not `agency_workspaces`)
3. Sets `created_by` to the authenticated user
4. Uploads documents to Parseur for processing
5. Triggers `analyze-workspace` in the background

**Severity:** LOW — This is not the tenant workspace creation flow. It creates document-processing workspaces, not agency tenants. Access is properly authenticated.

### 5.2 Agency Workspace Creation — PASS

**File:** `src/hooks/useAgencyWorkspace.ts` (lines 266-287)

Agency workspace creation goes through the Supabase client directly:
```typescript
const { data, error } = await supabase
  .from('agency_workspaces')
  .insert({ ...input, owner_id: user?.id })
  .select().single();
```

The `agency_workspaces_insert` RLS policy (foundation migration line 309-310) requires `owner_id = auth.uid()`, which means:
- Any authenticated user can create a workspace where they are the owner
- This is by design (self-service agency onboarding)

The `auto_create_owner_membership` trigger automatically creates an owner membership for the creator.

**Assessment:** Correct behavior — workspace creation is intentionally open to authenticated users.

---

## Summary of Findings

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1.6 | Cross-tenant merge: `_do_account_merge` does not check `agency_workspace_id` boundaries | **MEDIUM** | Open |
| 3.1 | `useCustomers.createCustomer` does not set `agency_workspace_id` | **LOW** | Open |
| 3.4 | `is_staff` fallback in accounts RLS bypasses workspace isolation | **MEDIUM** | Open (by design for single-tenant) |
| 4.1 | `profiles_update_self` RLS allows users to set their own `role` and `is_staff` (privilege escalation) | **HIGH** | Open |
| 5.1 | `create_workspace` function creates doc-processing workspaces, not tenant workspaces (not a real issue) | **LOW** | Informational |

### Priority Remediation Order

1. **Finding 4.1 (HIGH):** Fix immediately — profile self-update privilege escalation. A column-restriction policy or trigger on `profiles` would close this.
2. **Finding 1.6 + 3.4 (MEDIUM):** Address before multi-tenant onboarding. The `is_staff` RLS fallback and missing workspace check in the merge engine compound to allow cross-tenant data access and data movement.
3. **Finding 3.1 (LOW):** Add `agency_workspace_id` to the customer creation flow to prevent orphan accounts.
