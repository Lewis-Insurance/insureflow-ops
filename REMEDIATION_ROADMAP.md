# InsureFlow Ops - Comprehensive Remediation Roadmap

**Created:** December 25, 2024
**Priority:** Security-first approach with phased implementation

---

## Executive Summary

This roadmap addresses **50+ critical and high-priority issues** across security, authentication, XSS vulnerabilities, and code quality. Organized into 6 phases with clear dependencies.

---

## Phase 1: Critical Security Fixes (Day 1-2)

### 1.1 Add Authentication to Unprotected Routes
**Files:** `src/App.tsx`
**Lines:** 760, 773, 797, 805, 832, 857

**Issue:** Internal pages mounted without `ProtectedRoute`, allowing unauthenticated access.

**Affected Routes:**
- `/coverage-gap-analysis/:accountId` (line 760)
- `/issues` (line 773)
- `/predictive-analytics` (line 797)
- `/operations` (line 805)
- `/carrier-templates` (line 832)
- `/extraction-review` (line 857)

**Fix:**
```tsx
// Wrap each route with ProtectedRoute
<Route
  path="/coverage-gap-analysis/:accountId"
  element={
    <ProtectedRoute>
      <ErrorBoundary level="page" resetOnPropsChange>
        <CoverageGapAnalysis />
      </ErrorBoundary>
    </ProtectedRoute>
  }
/>
```

**Verification:** Attempt to access each route while logged out - should redirect to /auth

---

### 1.2 Secure send-sms Edge Function
**File:** `supabase/functions/send-sms/index.ts`

**Issues:**
1. Line 4-6: CORS `*` allows any origin
2. Line 9: No authentication check
3. Line 73-76: Uses service-role key to write arbitrary records

**Fix:**
```typescript
import { requireAuth } from '../_shared/auth.ts';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Add authentication
    const { user, error: authError } = await requireAuth(req);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    // Validate user has permission to send SMS for this account
    const { to_number, body, account_id, contact_id } = await req.json();

    // Verify user has access to account_id
    const { data: membership } = await supabase
      .from('account_memberships')
      .select('id')
      .eq('account_id', account_id)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    // Add rate limiting (10 SMS per minute per user)
    // ... existing logic
  }
});
```

---

### 1.3 Secure send-coi-email Edge Function
**File:** `supabase/functions/send-coi-email/index.ts`

**Issues:**
1. Line 4-6: CORS `*` allows any origin
2. No authentication - anyone can send email via your Resend account
3. Caller-supplied sender/recipient allows email spoofing

**Fix:**
```typescript
import { requireAuth, verifyResourceAccess } from '../_shared/auth.ts';

serve(async (req) => {
  // ... CORS handling

  // Add authentication
  const { user, error: authError } = await requireAuth(req);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { to, certificateNumber, certificateUrl, holderName } = await req.json();

  // Validate recipient is associated with user's accounts
  // Don't allow caller-supplied fromEmail - use system default only
  const fromEmail = 'coi@lewisinsurance.ai'; // Fixed sender

  // Verify certificate belongs to user's account
  const { data: cert } = await supabase
    .from('certificates')
    .select('account_id')
    .eq('certificate_number', certificateNumber)
    .single();

  if (!cert) {
    return new Response(JSON.stringify({ error: 'Certificate not found' }), { status: 404 });
  }

  // Verify user has access to this account
  await verifyResourceAccess(user.id, 'account', cert.account_id);

  // ... send email with fixed sender
});
```

---

### 1.4 Fix XSS in AIBrain Component
**File:** `src/components/AIBrain.tsx`
**Lines:** 396, 402

**Issue:** `dangerouslySetInnerHTML` with unsanitized `searchResults.fullAnswer`

**Fix:**
```tsx
import DOMPurify from 'dompurify';

// Line 402 - sanitize before rendering
<div dangerouslySetInnerHTML={{
  __html: DOMPurify.sanitize(searchResults.fullAnswer, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'a', 'code', 'pre'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
  })
}} />
```

---

### 1.5 Fix XSS in PublicIntake CSS Injection
**File:** `src/pages/PublicIntake.tsx`
**Line:** 550-553

**Issue:** Raw CSS injection from `template.branding.customCss` on public route

**Fix Option A - Remove custom CSS entirely:**
```tsx
// Remove this block entirely if custom CSS isn't needed
// {template.branding?.customCss && (
//   <style dangerouslySetInnerHTML={{ __html: template.branding.customCss }} />
// )}
```

**Fix Option B - Sanitize CSS (if custom CSS is required):**
```tsx
import { sanitizeCSS } from '@/lib/sanitize';

// In component
const sanitizedCSS = useMemo(() => {
  if (!template.branding?.customCss) return null;
  return sanitizeCSS(template.branding.customCss);
}, [template.branding?.customCss]);

// In render
{sanitizedCSS && (
  <style dangerouslySetInnerHTML={{ __html: sanitizedCSS }} />
)}
```

**Create CSS sanitizer:**
```typescript
// src/lib/sanitize.ts
export function sanitizeCSS(css: string): string {
  // Remove potentially dangerous CSS
  const dangerous = [
    /expression\s*\(/gi,      // IE expression()
    /javascript\s*:/gi,       // javascript: urls
    /behavior\s*:/gi,         // IE behaviors
    /-moz-binding\s*:/gi,     // Firefox XBL
    /url\s*\(\s*["']?data:/gi, // data: URLs
    /@import/gi,              // External imports
  ];

  let clean = css;
  for (const pattern of dangerous) {
    clean = clean.replace(pattern, '/* sanitized */');
  }
  return clean;
}
```

---

### 1.6 Fix XSS in main.tsx Error Pages
**File:** `src/main.tsx`
**Lines:** 17, 44, 49

**Issue:** `innerHTML` with raw error strings could execute injected content

**Fix:**
```typescript
// Create safe error display helper
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Line 23 - escape error messages
${healthCheck.errors.map(err => `<li>${escapeHtml(err)}</li>`).join('')}

// Line 49 - escape error message
<p style="color: #9ca3af; margin-top: 1rem; font-size: 0.875rem;">
  Error: ${escapeHtml(error instanceof Error ? error.message : 'Unknown error')}
</p>
```

---

## Phase 2: Authentication & Authorization Fixes (Day 2-3)

### 2.1 Fix PortalDashboard Navigate During Render
**File:** `src/pages/PortalDashboard.tsx`
**Line:** 48-50

**Issue:** `navigate()` called during render causes React warnings

**Fix:**
```tsx
// Replace this:
if (!isAuthenticated) {
  navigate('/portal/login');
  return null;
}

// With this:
if (!isAuthenticated) {
  return <Navigate to="/portal/login" replace />;
}

// Or use useEffect:
useEffect(() => {
  if (!isLoading && !isAuthenticated) {
    navigate('/portal/login', { replace: true });
  }
}, [isLoading, isAuthenticated, navigate]);

if (!isAuthenticated) {
  return <LoadingSpinner />;
}
```

---

### 2.2 Fix useAuth is_staff Hardcoding
**File:** `src/hooks/useAuth.ts`
**Lines:** 59, 63, 68

**Issue:** `is_staff` hardcoded to `false`, breaking staff permissions

**Fix:**
```typescript
// Line 63-68 - preserve actual is_staff value
setProfile({
  ...profileData,
  role: (profileData.role as UserProfile['role']) || 'customer',
  is_staff: profileData.is_staff ?? false, // Use actual value from DB
  notification_email: typeof profileData.notification_email === 'string'
    ? profileData.notification_email === 'true'
    : Boolean(profileData.notification_email),
  notification_sms: false
});
```

---

### 2.3 Add Auth to Admin Edge Functions
**Files:**
- `supabase/functions/admin-approvals/index.ts`
- `supabase/functions/admin-create-user/index.ts`
- `supabase/functions/admin-list-users/index.ts`
- `supabase/functions/admin-update-password/index.ts`

**Fix for each:**
```typescript
import { requireAuth } from '../_shared/auth.ts';

serve(async (req) => {
  // CORS handling...

  // Require authentication
  const { user, error: authError } = await requireAuth(req);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  // Require admin role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_staff')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden: Admin only' }), { status: 403 });
  }

  // ... existing logic
});
```

---

### 2.4 Add Auth to 30+ Edge Functions
**Priority order based on sensitivity:**

**Tier 1 - High Risk (do first):**
- `analyze-coverage-gaps` - Customer data
- `calculate-quote-score` - Quote data
- `process-quote-followups` - Automated actions
- `nurture-campaign-processor` - Email automation
- `lewi_analyze` - Document analysis

**Tier 2 - Medium Risk:**
- All `extract-*-policy` functions (9 total)
- `compare-insurance-options`
- `ai-task-generator`

**Tier 3 - Lower Risk (batch jobs):**
- `calculate-lead-score`
- `calculate-renewal-risk`
- `renewal-risk-batch`

**Pattern to apply:**
```typescript
// Add to each function
import { requireAuth, verifyResourceAccess } from '../_shared/auth.ts';

// After CORS handling:
const { user, error } = await requireAuth(req);
if (error || !user) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: corsHeaders
  });
}

// For resource-specific access:
const { account_id } = await req.json();
await verifyResourceAccess(user.id, 'account', account_id);
```

---

## Phase 3: Environment & Error Tracking (Day 3-4)

### 3.1 Fix validateEnv to Actually Validate
**File:** `src/lib/validateEnv.ts`

**Current Issue:** Validation is a no-op

**Fix:**
```typescript
const REQUIRED_ENV_VARS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
] as const;

const OPTIONAL_ENV_VARS = [
  'VITE_SENTRY_DSN',
  'VITE_GOOGLE_VISION_API_KEY',
] as const;

export function validateEnv(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const key of REQUIRED_ENV_VARS) {
    const value = import.meta.env[key];
    if (!value || value === 'undefined' || value === '') {
      missing.push(key);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

export function getEnv(key: string, fallback?: string): string {
  const value = import.meta.env[key];
  if (value && value !== 'undefined' && value !== '') {
    return value;
  }
  if (fallback !== undefined) {
    return fallback;
  }
  throw new Error(`Environment variable ${key} is not set`);
}
```

---

### 3.2 Remove Hardcoded Supabase Config
**Files:**
- `src/integrations/supabase/client.ts`
- `supabase/functions/health-check/index.ts`

**Fix for client.ts:**
```typescript
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '@/lib/validateEnv';

const supabaseUrl = getEnv('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY');

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

**Fix for health-check/index.ts:**
```typescript
serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({
      status: 'error',
      message: 'Missing environment configuration'
    }), { status: 500 });
  }

  // ... rest of health check
});
```

---

### 3.3 Initialize Error Tracking
**File:** `src/main.tsx`

**Issue:** `initErrorTracking()` is never called

**Fix:**
```typescript
import { initErrorTracking } from './lib/errorTracking';

// Add before health check
initErrorTracking();

logger.debug('Running health check...');
```

---

## Phase 4: CORS & Webhook Security (Day 4-5)

### 4.1 Create Shared CORS Configuration
**File:** `supabase/functions/_shared/cors.ts`

```typescript
// Allowed origins - update for your domains
const ALLOWED_ORIGINS = [
  'https://lewisinsurance.ai',
  'https://www.lewisinsurance.ai',
  'https://lewisinsurance.netlify.app',
];

// For development
if (Deno.env.get('ENVIRONMENT') === 'development') {
  ALLOWED_ORIGINS.push('http://localhost:5173', 'http://localhost:3000');
}

export function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  };
}

export function handleCors(req: Request): Response | null {
  const origin = req.headers.get('origin');
  const headers = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers });
  }

  return null; // Continue processing
}
```

---

### 4.2 Add Twilio Webhook Signature Validation
**Files:**
- `supabase/functions/twilio-voice-webhook/index.ts`
- `supabase/functions/twilio-sms-webhook/index.ts`
- `supabase/functions/twilio-recording-webhook/index.ts`

```typescript
import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";

function validateTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signature: string
): boolean {
  // Build the string to sign
  const paramString = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], '');
  const data = url + paramString;

  // Create HMAC-SHA1 signature
  const hmac = createHmac('sha1', authToken);
  hmac.update(data);
  const expectedSignature = hmac.digest('base64');

  return signature === expectedSignature;
}

serve(async (req) => {
  // Get Twilio signature from header
  const signature = req.headers.get('X-Twilio-Signature');
  if (!signature) {
    return new Response('Missing signature', { status: 401 });
  }

  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')!;
  const url = req.url;
  const formData = await req.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => { params[key] = value.toString(); });

  if (!validateTwilioSignature(authToken, url, params, signature)) {
    return new Response('Invalid signature', { status: 401 });
  }

  // ... process webhook
});
```

---

## Phase 5: Code Quality & Performance (Day 5-7)

### 5.1 Fix Hook Performance Issues

**File:** `src/hooks/useAutoTaskGeneration.ts`
```typescript
// Replace JSON.stringify in dependency array
const triggerDataRef = useRef(triggerData);
const hasChanged = JSON.stringify(triggerData) !== JSON.stringify(triggerDataRef.current);

useEffect(() => {
  if (hasChanged) {
    triggerDataRef.current = triggerData;
    // ... effect logic
  }
}, [hasChanged]);
```

---

### 5.2 Fix DraftManager Browser Compatibility
**File:** `src/services/DraftManager.ts`

```typescript
// Line 55 - fix type
private autoSaveTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

// Line 60 - properly await async init
constructor() {
  // Don't call async in constructor
}

// Add init method
async init(): Promise<void> {
  await this.initDatabase();
}

// Export singleton with init
let instance: DraftManager | null = null;

export async function getDraftManager(): Promise<DraftManager> {
  if (!instance) {
    instance = new DraftManager();
    await instance.init();
  }
  return instance;
}
```

---

### 5.3 Add Error Boundaries to Remaining Pages

**Create wrapper component:**
```tsx
// src/components/PageWithErrorBoundary.tsx
import { ErrorBoundary } from '@/components/ui/error-boundary';

export function PageWithErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary level="page" resetOnPropsChange>
      {children}
    </ErrorBoundary>
  );
}
```

**Wrap all page routes in App.tsx**

---

### 5.4 Move Hardcoded Templates to Database
**File:** `src/hooks/useRenewalCampaigns.ts`

1. Create database tables:
```sql
CREATE TABLE campaign_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  template_type TEXT NOT NULL,
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE communication_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL, -- 'email', 'sms', 'call'
  name TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  variables TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);
```

2. Migrate hardcoded templates to database
3. Update hook to fetch from database

---

## Phase 6: Testing & Verification (Day 7-8)

### 6.1 Security Testing Checklist

- [ ] Attempt unauthenticated access to each protected route
- [ ] Test edge functions without auth headers
- [ ] Verify CORS blocks unauthorized origins
- [ ] Test XSS payloads in AI/KB content
- [ ] Verify Twilio webhook signature validation
- [ ] Test rate limiting on SMS/email functions
- [ ] Verify admin functions require admin role

### 6.2 Add Integration Tests

```typescript
// tests/security/auth.test.ts
describe('Authentication', () => {
  it('rejects unauthenticated requests to send-sms', async () => {
    const response = await fetch('supabase-url/functions/v1/send-sms', {
      method: 'POST',
      body: JSON.stringify({ to_number: '+1234567890', body: 'test' }),
    });
    expect(response.status).toBe(401);
  });

  it('rejects unauthorized account access', async () => {
    // Login as user A, try to send SMS for user B's account
    // ...
  });
});
```

### 6.3 Add Rate Limiting Tests

```typescript
describe('Rate Limiting', () => {
  it('blocks excessive SMS requests', async () => {
    // Send 11 requests in 1 minute
    for (let i = 0; i < 11; i++) {
      const response = await sendSMS(validPayload);
      if (i < 10) {
        expect(response.status).toBe(200);
      } else {
        expect(response.status).toBe(429);
      }
    }
  });
});
```

---

## Implementation Order

| Day | Phase | Tasks |
|-----|-------|-------|
| **1** | 1.1-1.3 | Protected routes, send-sms auth, send-coi-email auth |
| **1** | 1.4-1.6 | XSS fixes (AIBrain, PublicIntake, main.tsx) |
| **2** | 2.1-2.2 | PortalDashboard fix, useAuth is_staff fix |
| **2** | 2.3 | Admin edge function auth (4 functions) |
| **3** | 2.4 | Auth for remaining edge functions (30+) |
| **3** | 3.1-3.3 | Environment validation, error tracking init |
| **4** | 4.1-4.2 | CORS configuration, Twilio signature validation |
| **5** | 5.1-5.2 | Hook performance, DraftManager fixes |
| **6** | 5.3-5.4 | Error boundaries, template migration |
| **7-8** | 6.1-6.3 | Security testing, integration tests |

---

## Open Questions Requiring Decisions

1. **Unguarded Routes:** Are `/coverage-gap-analysis`, `/issues`, `/predictive-analytics`, `/operations`, `/carrier-templates`, `/extraction-review` intentionally public?
   - **Recommendation:** Wrap all in `ProtectedRoute` - internal tools should require auth

2. **Custom CSS in PublicIntake:** Is `template.branding.customCss` restricted to trusted admins?
   - **Recommendation:** If external users can set it, remove the feature or sanitize strictly

3. **AI/KB HTML Content:** Is content sanitized before storage?
   - **Recommendation:** Always sanitize on render with DOMPurify regardless

4. **SMS/Email Auth Method:** JWT auth + rate limiting, or signed one-time tokens?
   - **Recommendation:** JWT auth + rate limiting (10/min per user) for consistency

---

## Success Metrics

| Metric | Before | Target |
|--------|--------|--------|
| Unprotected internal routes | 6 | 0 |
| Edge functions without auth | 30+ | 0 |
| XSS vulnerabilities | 4 | 0 |
| CORS wildcards | 90+ | 0 |
| Webhook signature validation | 0 | 3 |
| Error tracking initialized | No | Yes |
| Rate limiting on comms | No | Yes |

---

## Rollback Plan

Each phase can be deployed independently. If issues arise:

1. **Route protection issues:** Remove `ProtectedRoute` wrapper temporarily
2. **Edge function auth breaks:** Add `X-Skip-Auth` header for internal calls during transition
3. **CORS too restrictive:** Add missing origins to allowlist
4. **XSS sanitization too aggressive:** Adjust DOMPurify config

---

**Next Steps:** Start with Phase 1 (Critical Security Fixes) immediately.
