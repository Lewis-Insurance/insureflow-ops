# Security Audit Report — 2026-08-16

> Focus: business logic flaws, race conditions, API security, access control

---

## CRITICAL Findings

### 1. RLS Disabled on ALL Financial Tables (CRITICAL)

**Files:**
- `supabase/migrations/20251230200000_fix_payment_methods_and_seed.sql` (line 45)
- `supabase/migrations/20251230230000_disable_day_sheets_rls.sql` (lines 11-34)

**Vulnerability:** Row Level Security is explicitly disabled on ALL financial/payment tables and was **never re-enabled**. The migration `20260625023008_security_fix_enable_rls_financial_tables` is referenced in comments (see `20260626120000_fix_payment_methods_select_rls_global.sql` line 5) but does not exist in the migrations directory. Only `payment_methods` had RLS re-enabled via a subsequent fix.

**Affected tables (RLS DISABLED):**
- `premium_payments`
- `day_sheets`
- `escrow_deposits`
- `bank_accounts`
- `bank_statements`
- `bank_statement_lines`
- `reconciliation_adjustments`
- `payment_audit_log`
- `payment_attachments`

**Attack chain:**
1. Any authenticated user (including a customer portal user) can query `premium_payments` via PostgREST: `GET /rest/v1/premium_payments?select=*`
2. They can read ALL payment records across ALL agencies (no org_id filtering enforced at DB level)
3. They can INSERT arbitrary payment records (adding fake payments to any day sheet)
4. They can UPDATE payment status to "voided" or "nsf" on records belonging to other agencies
5. They can read bank account details (`bank_accounts`), reconciliation data, and full audit trails

**Impact:** Complete financial data breach. Any authenticated user can read, modify, or forge payment records for any agency in the system.

---

### 2. `recalculate_day_sheet_totals` RPC — No Authorization, Cross-Tenant Write (HIGH)

**File:** `supabase/migrations/20260108100000_fix_day_sheet_totals.sql` (lines 82-135)

**Vulnerability:** The `recalculate_day_sheet_totals(UUID)` function is:
- `SECURITY DEFINER` (runs as postgres owner, bypasses RLS)
- Granted to ALL authenticated users (`GRANT EXECUTE ... TO authenticated`)
- Has **no `is_staff()` check** and **no workspace membership check**
- Accepts a `day_sheet_id` parameter (or NULL to recalculate ALL sheets)
- When called with NULL, it iterates and UPDATEs every day sheet in the system

**Attack chain:**
1. Authenticated customer portal user calls `SELECT * FROM recalculate_day_sheet_totals(NULL)`
2. Function iterates ALL day sheets across ALL agencies and recalculates them
3. While not directly destructive, a manipulated `premium_payments` row (see Finding #1) combined with this call allows an attacker to launder forged totals into the authoritative day sheet record
4. Even alone, calling with a specific `day_sheet_id` belonging to another agency triggers a cross-tenant write (the function has no org check)

---

### 3. `lead-capture-webhook` — No Workspace Isolation on Insert (HIGH)

**File:** `supabase/functions/lead-capture-webhook/index.ts` (lines 117-146)

**Vulnerability:** The lead-capture webhook inserts leads using the service_role key without setting `agency_workspace_id`. The `leads` table has a `NOT NULL` constraint on `agency_workspace_id` (added in `20260408100000_sec005`), but:
- The function never sets this field
- If the constraint was relaxed or the migration was applied after existing data, leads could be orphaned outside any workspace boundary
- The function uses a static API key (`LEAD_CAPTURE_API_KEY`) and does not associate the incoming lead with any specific agency

**Attack chain:**
1. An attacker with a compromised or guessed `LEAD_CAPTURE_API_KEY` (single shared secret) can inject leads
2. If the NOT NULL constraint is not enforced (production drift), injected leads have no workspace and may appear in cross-tenant search results
3. Even with the constraint, there's no mechanism to route the lead to the correct workspace — the function will simply fail silently, a DoS vector

---

## HIGH Findings

### 4. `setup-mfa` — No Rate Limiting on TOTP Verification (HIGH)

**File:** `supabase/functions/setup-mfa/index.ts` (lines 75-92)

**Vulnerability:** The `verify_setup` action accepts a `secret` and `code` pair with no rate limiting, lockout mechanism, or attempt counting. The TOTP window is only 3 slots (current ± 1), but:
- The attacker already knows the `secret` (it was returned in the `generate_secret` step to the same session)
- There is no limit on how many `verify_setup` calls can be made
- More critically, the function stores `mfa_secret` in **plaintext** in the `profiles` table (line 100: `mfa_secret: secret`)
- Any function or RLS bypass that reads `profiles.mfa_secret` allows MFA bypass

**Attack chain:**
1. Attacker compromises another user's JWT (session hijack)
2. Calls `generate_secret` to get a new TOTP secret
3. Immediately calls `verify_setup` with a valid code for that new secret
4. MFA is now "enabled" with attacker's secret — they own the account's MFA
5. Alternatively: since `mfa_secret` is stored plaintext, any SQL injection or RLS bypass on `profiles` table leaks every user's MFA secret

---

### 5. `deposit-verify` Match/Unmatch — TOCTOU Race Condition (HIGH)

**File:** `supabase/functions/deposit-verify/index.ts` (lines 170-253)

**Vulnerability:** The `match` action performs a read-check-then-write without row locking:
1. Reads the statement line and checks `line.status !== 'matched'` (line 191)
2. Reads the deposit and checks `deposit.reconciliation_status !== 'matched'` (line 208)
3. Then updates both records (lines 213-239)

There is no `SELECT ... FOR UPDATE` or database-level atomicity between the check and the write. Both operations use the Supabase JS client (two separate HTTP requests to PostgREST).

**Attack chain:**
1. Two concurrent requests both pass the "not already matched" check on the same line/deposit
2. Both proceed to write, resulting in a double-match where one deposit is matched to two different statement lines (or vice versa)
3. The reconciliation balance is corrupted — the same deposit appears to cover two lines, inflating the reconciled total
4. In a bank reconciliation context this can hide embezzlement or create phantom deposits

---

### 6. `phone-verification` — Verification Code Stored in Plaintext, Debug Leak (HIGH)

**File:** `supabase/functions/phone-verification/index.ts` (lines 77-108)

**Vulnerability:**
1. The 6-digit verification code is stored in plaintext in `phone_verification_codes.verification_code` (line 82)
2. The response includes `debug_code: verificationCode` (line 105) which leaks the code directly in the API response
3. While rate-limited to 1 SMS/minute per user, the `verify_code` action (lines 111-153) has no rate limit on verification ATTEMPTS — an attacker can brute-force 1,000,000 combinations

**Attack chain:**
1. Attacker triggers `send_code` for their own phone
2. The code is returned directly in the response (`debug_code` field)
3. Even if `debug_code` were removed: the `verify_code` endpoint has no attempt cap — 6-digit code has only 10^6 possibilities, trivially brutable at API speed without rate limiting on the verify path
4. Successful verification overwrites `profiles.phone` with attacker-controlled value

---

## MEDIUM Findings

### 7. `update_day_sheet_totals` Trigger — Non-Atomic Multi-Statement Race (MEDIUM)

**File:** `supabase/migrations/20260410000013_update_day_sheet_totals_trigger.sql` (lines 5-59)

**Vulnerability:** The trigger `update_day_sheet_totals()` fires AFTER INSERT/UPDATE/DELETE on `premium_payments`. When `day_sheet_id` changes on an UPDATE, it:
1. Calls `calculate_day_sheet_totals(OLD.day_sheet_id)` and writes totals
2. Then calls `calculate_day_sheet_totals(NEW.day_sheet_id)` and writes totals

Between steps 1 and 2, another concurrent payment insert on the same day sheet can observe inconsistent totals. The trigger function itself does not acquire an advisory lock or `FOR UPDATE` on the day sheet row before computing.

**Impact:** Under concurrent payment processing, day sheet totals can transiently show incorrect amounts. While PostgreSQL's MVCC prevents corruption, the denormalized totals may permanently diverge if two triggers interleave their read-compute-write cycles on the same `day_sheet_id`.

---

### 8. `goal-manager` — Service-Role IDOR on `getUserAchievements` (MEDIUM)

**File:** `supabase/functions/goal-manager/index.ts` (lines 697-722)

**Vulnerability:** The `get_user_achievements` action accepts a `user_id` parameter from the request body and queries achievements for that user without verifying the target user belongs to the caller's agency:

```typescript
async function getUserAchievements(supabase, targetUserId, user) {
  const userId = targetUserId || user.id;  // Uses attacker-controlled user_id
  // No check that targetUserId is in the same workspace
  let query = supabase.from('user_achievements').select('...').eq('user_id', userId);
}
```

The function uses the service_role key (line 67), bypassing RLS. While achievements are low-sensitivity, this pattern allows enumeration of user IDs and confirmation of which users exist in the system.

**Attack chain:**
1. Authenticated user sends `{ action: "get_user_achievements", user_id: "<victim_uuid>" }`
2. Function queries with service_role, bypassing RLS
3. Returns achievements for any user in the system regardless of workspace membership
4. Enables user enumeration and activity inference

---

### 9. `lead-capture-webhook` — No Workspace Scoping + Single Shared API Key (MEDIUM)

**File:** `supabase/functions/lead-capture-webhook/index.ts` (lines 44-63)

**Vulnerability:** Authentication uses a single static API key (`LEAD_CAPTURE_API_KEY`) shared across all potential integrations. If this key is leaked from any integration partner:
- All partners' lead capture is compromised simultaneously
- There's no per-partner key rotation capability
- The function uses service_role (line 67) so injected data bypasses all RLS
- No IP allowlist or request signing

**Impact:** A leaked API key allows unlimited lead injection with arbitrary data into the system.

---

### 10. `calculate_day_sheet_totals` — SECURITY DEFINER Without Ownership Check (MEDIUM)

**File:** `supabase/migrations/20251228700000_payment_tracking_module.sql` (lines 679-711)

**Vulnerability:** `calculate_day_sheet_totals(UUID)` is SECURITY DEFINER and accepts any `day_sheet_id` without verifying the caller has access to that day sheet's org. Combined with RLS being disabled (Finding #1), any authenticated user can compute totals for any day sheet.

While this function only reads (SELECT), it is called by the writable `recalculate_day_sheet_totals` (Finding #2) which uses its output to UPDATE day sheets cross-tenant.

---

## Summary Table

| # | Severity | Type | Location | Status |
|---|----------|------|----------|--------|
| 1 | CRITICAL | RLS Disabled | Financial tables (9 tables) | Unpatched |
| 2 | CRITICAL | Broken Access Control | `recalculate_day_sheet_totals` RPC | Unpatched |
| 3 | HIGH | Missing Tenant Isolation | `lead-capture-webhook` | Unpatched |
| 4 | HIGH | No Rate Limit + Plaintext Secret | `setup-mfa` | Unpatched |
| 5 | HIGH | TOCTOU Race | `deposit-verify` match action | Unpatched |
| 6 | HIGH | Plaintext OTP + Debug Leak | `phone-verification` | Unpatched |
| 7 | MEDIUM | Trigger Race Condition | `update_day_sheet_totals` trigger | Unpatched |
| 8 | MEDIUM | IDOR via user_id param | `goal-manager` getUserAchievements | Unpatched |
| 9 | MEDIUM | Shared Secret / No Scoping | `lead-capture-webhook` API key | Unpatched |
| 10 | MEDIUM | SECURITY DEFINER no auth | `calculate_day_sheet_totals` | Unpatched |

---

## Recommended Remediations (Priority Order)

1. **IMMEDIATE:** Create migration to re-enable RLS on all 9 financial tables with proper workspace-scoped policies (staff via `agency_workspace_memberships`, same pattern as `accounts`).
2. **IMMEDIATE:** Add `is_staff()` guard and workspace membership check to `recalculate_day_sheet_totals`; revoke from PUBLIC/anon.
3. **HIGH:** Remove `debug_code` from phone-verification response; hash verification codes at rest; add attempt-count lockout (max 5 attempts per code).
4. **HIGH:** Store MFA secrets encrypted (use `pgsodium` or Vault); never return secret after initial generation.
5. **HIGH:** Convert `deposit-verify` match/unmatch to a database RPC with `FOR UPDATE` row locking on both the statement line and deposit.
6. **HIGH:** Add `agency_workspace_id` parameter to `lead-capture-webhook` (require it in payload or derive from API key); implement per-partner API keys.
7. **MEDIUM:** Add advisory lock or `FOR UPDATE` on the day sheet row inside `update_day_sheet_totals` trigger to serialize concurrent total computations.
8. **MEDIUM:** Add workspace membership verification to `getUserAchievements` before querying.
