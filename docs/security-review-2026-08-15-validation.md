# Security Review Findings — Source-Code Validation

**Date:** 2026-08-15
**Validator:** Cloud Agent (automated source-code review)
**Input:** `docs/security-review-2026-08-15-findings.json`

---

## Finding 1: SSRF in prism-api via `webhook_url`

**Verdict: CONFIRMED**

### Evidence

The function accepts `webhook_url` from the request body at line 312:

```typescript
const { prompt, mode = 'sequential', depth = 'synthesis', webhook_url } = await req.json();
```

At line 462, the URL is fetched with **no validation** (no allowlist, no hostname check, no scheme check):

```typescript
fetch(webhook_url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Prism-Signature': signature,
    'X-Prism-Timestamp': timestamp,
    'X-Prism-Version': '1.0',
  },
  body: webhookPayload,
}).catch((err) => {
  console.error('Webhook call failed:', err);
});
```

### Auth requirement

The function requires either:
- A valid Supabase JWT (authenticated user), OR
- A valid Prism API key (`sk_prism_*` prefix validated against profiles or env var)

### Risk assessment

- Any authenticated user or API key holder can supply an arbitrary URL.
- The edge function runtime can reach internal Supabase infrastructure, cloud metadata endpoints (169.254.169.254), and other internal services.
- The webhook fires as "fire-and-forget" — response data isn't returned to the caller, limiting data exfiltration to blind SSRF, but internal POST side-effects are possible.
- HMAC signature is only applied when `PRISM_WEBHOOK_SECRET` is set — if unset, the fetch still proceeds with an empty signature string.

### Recommendation

Add URL validation: reject non-HTTPS schemes, block RFC 1918 / link-local / loopback ranges, and consider an allowlist of webhook domains.

---

## Finding 2: Cross-tenant portal-send-invitation

**Verdict: CONFIRMED**

### Evidence

**Auth check (lines 89-95):** Verifies the caller has a staff role OR `is_staff=true`:

```typescript
const staffRoles = ['admin', 'staff', 'producer', 'csr', 'owner', 'agent'];
if (!staffRoles.includes(profile.role) && !profile.is_staff) {
  return new Response(
    JSON.stringify({ error: 'Only staff members can send portal invitations' }),
    { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```

**Account lookup (lines 129-138):** Uses the service_role client (line 121) to look up the account — there is **no** workspace membership check:

```typescript
const adminClient = createClient(supabaseUrl, supabaseServiceKey, { ... });

const { data: account, error: accountError } = await adminClient
  .from('accounts')
  .select('id, name')
  .eq('id', body.account_id)
  .single();
```

The function:
1. Confirms the user is staff (any agency's staff — the profile check is global, not workspace-scoped).
2. Uses `adminClient` (service_role) to query the account, bypassing RLS entirely.
3. Never joins `agency_workspace_memberships` to confirm the caller belongs to the same workspace as the target account.

### Risk assessment

A staff member at Agency A can send a portal invitation to any account at Agency B if they know/guess the `account_id` (UUID). This violates the multi-tenant isolation boundary. The invitation also creates/updates `client_portal_users` and generates a magic link for the target account.

### Recommendation

After verifying staff role, add a workspace membership check: join `accounts.agency_workspace_id` against `agency_workspace_memberships` for the calling user's `user.id`.

---

## Finding 3: Cross-tenant process-data-export — audit_logs without workspace filter

**Verdict: CONFIRMED**

### Evidence

**Service role usage (lines 20-23):**

```typescript
const supabaseClient = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  ...
)
```

**Audit logs query (lines 202-209):** Only gates on `is_staff`/admin role, then fetches ALL audit_logs with no workspace filter:

```typescript
if (profile?.is_staff || profile?.role === 'admin' || profile?.role === 'staff') {
  const { data: auditLogs } = await supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1000)

  exportData.audit_logs = auditLogs || [];
```

### Mitigating factors

- Other data types (accounts, contacts, policies) are scoped to the user's `account_memberships` (lines 117-191), which provides some user-level scoping.
- The `audit_logs` table may or may not have an `agency_workspace_id` column — the query doesn't filter on one regardless.
- Only staff/admin users can trigger the audit_logs export path.

### Risk assessment

A staff member at any agency can export all audit logs across all tenants. While the `request_type` must be 'audit_logs' or 'full' for this code path to execute, any authenticated staff user can request it.

### Recommendation

Add `agency_workspace_id` filter to the audit_logs query. Determine workspace from the user's `agency_workspace_memberships`.

---

## Finding 4: Missing auth in hermes-chat

**Verdict: CONFIRMED (with nuance)**

### Evidence

**verify_jwt:** The `supabase/config.toml` (line 70-71) sets:

```toml
[functions.hermes-chat]
verify_jwt = true
```

So JWT verification IS enforced — only authenticated users can call this function.

**Authorization/role check inside the function:** There is **none**. The function:
1. Checks if `FLOOR_COCKPIT_ENABLED` env var is `'true'` or `'1'` (line 58-61) — a feature flag, not auth.
2. Validates `sessionRef` and `message` are present (line 186-189).
3. Checks for PII in the message (line 193-198).
4. Routes to either the Hermes proxy or a synthetic response.

No check exists for user role, staff status, or workspace membership.

### Risk assessment

Any authenticated user (including `customer` role users with portal access) can access the Floor cockpit chat. However:
- The function is gated by `FLOOR_COCKPIT_ENABLED` env var (if not set, returns 423).
- The synthetic response mode doesn't expose real data.
- When proxying to Hermes, context is limited to opaque refs in the request body.

The finding is **CONFIRMED** — there's no authorization check beyond authentication. Any authenticated user can use Floor cockpit. Whether this is exploitable depends on what the Hermes backend exposes and whether `contextRefs` allow unauthorized data access upstream.

### Recommendation

Add a staff/role check after JWT validation to restrict Floor cockpit to staff members only.

---

## Finding 5: Verify fixes from PR #107

### 5a. canopy-webhook — CANOPY_WEBHOOK_SECRET now required (fail-closed)

**Verdict: CONFIRMED FIXED**

The code at line 290-362 shows:
- When `CANOPY_WEBHOOK_SECRET` IS configured: signature is verified; requests without valid signature are rejected (401).
- When `CANOPY_WEBHOOK_SECRET` is NOT configured: the function returns HTTP 500 with "Server configuration error" — **fail-closed**.

```typescript
} else {
  logger.error('CANOPY_WEBHOOK_SECRET not configured - rejecting request');
  return new Response(JSON.stringify({ error: 'Server configuration error' }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

### 5b. esign-webhook — Signature verification now blocking

**Verdict: CONFIRMED FIXED**

Lines 339-366 show fail-closed behavior:
- Missing `DROPBOX_ACCESS_TOKEN`: returns 500 (line 343-347).
- Missing signature header: returns 401 (line 351-356).
- Invalid signature: returns 401 (line 360-365).

```typescript
if (!apiKey) {
  logger.error('DROPBOX_ACCESS_TOKEN not configured - rejecting webhook');
  return new Response(JSON.stringify({ error: 'Server configuration error' }), { status: 500, headers });
}
const signature = req.headers.get('x-hellosign-signature');
if (!signature) {
  logger.error('Missing x-hellosign-signature header - rejecting request');
  return new Response(JSON.stringify({ error: 'Missing signature' }), { status: 401, headers });
}
const isValid = await verifyWebhookSignature(rawBody, signature, apiKey);
if (!isValid) {
  logger.error('Webhook signature verification failed - rejecting request');
  return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401, headers });
}
```

### 5c. suggest-additional-insured-duplicates — CRON_SECRET required

**Verdict: PARTIALLY FIXED (fail-open pattern remains)**

Lines 38-47 show the check:

```typescript
const cronSecret = Deno.env.get('CRON_SECRET');
if (cronSecret) {
  const provided = req.headers.get('X-Cron-Secret');
  if (!provided || !timingSafeEqual(provided, cronSecret)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
}
```

The `if (cronSecret)` guard means: **if CRON_SECRET env var is not set, the check is skipped entirely**. This is a fail-open pattern. If the env var is accidentally deleted or not deployed, the function becomes publicly accessible.

### 5d. _shared/cron-auth.ts — Fail-open pattern

**Verdict: PARTIALLY FIXED**

Lines 29-41 show environment-aware logic:

```typescript
if (!cronSecret) {
  const isDev = Deno.env.get('ENVIRONMENT') !== 'production';
  if (isDev) {
    console.warn('[CRON-AUTH] CRON_SECRET not configured - allowing request in development');
    return null;
  }
  console.error('[CRON-AUTH] CRON_SECRET not configured in production');
  return new Response(
    JSON.stringify({ error: 'Cron authentication not configured' }),
    { status: 500, headers: { 'Content-Type': 'application/json' } }
  );
}
```

The shared utility is **fail-closed in production** (returns 500 when secret is missing and `ENVIRONMENT === 'production'`). However:
- If `ENVIRONMENT` env var is not explicitly set to `'production'`, it defaults to allowing requests (fail-open).
- The `suggest-additional-insured-duplicates` function does NOT use this shared utility — it has its own inline check that is unconditionally fail-open when `CRON_SECRET` is unset.

### Recommendation

- `suggest-additional-insured-duplicates`: Add an else-branch that returns 500 when `CRON_SECRET` is unset, matching the canopy-webhook pattern.
- `_shared/cron-auth.ts`: Invert the logic — fail-closed by default, only allow bypass when `ENVIRONMENT === 'development'` is explicitly set.

---

## Summary Table

| # | Finding | Verdict | Severity |
|---|---------|---------|----------|
| 1 | SSRF in prism-api via webhook_url | **CONFIRMED** | High |
| 2 | Cross-tenant portal-send-invitation | **CONFIRMED** | Critical |
| 3 | Cross-tenant process-data-export audit_logs | **CONFIRMED** | Medium |
| 4 | Missing auth in hermes-chat | **CONFIRMED** (JWT required, no role check) | Medium |
| 5a | canopy-webhook fail-closed | **FIXED** | — |
| 5b | esign-webhook signature blocking | **FIXED** | — |
| 5c | suggest-additional-insured-duplicates CRON_SECRET | **PARTIALLY FIXED** (fail-open if env unset) | Low |
| 5d | _shared/cron-auth.ts fail-open | **PARTIALLY FIXED** (fail-open if ENVIRONMENT unset) | Low |
