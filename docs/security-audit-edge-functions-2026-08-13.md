# Edge Function Security Audit Report

**Date:** 2026-08-13
**Scope:** Edge functions with `verify_jwt = false`, webhook handlers, CRON-authenticated functions, wildcard CORS
**Auditor:** Automated security review

---

## Executive Summary

This audit reviewed 15 edge functions across four categories. **6 findings** were identified: 2 HIGH severity, 3 MEDIUM severity, and 1 LOW severity. The most critical issues are the `esign-webhook` failing open on invalid signatures and the `email-inbound-lite` failing open when its secret is not configured.

---

## 1. commercial-intake (verify_jwt = false)

**File:** `supabase/functions/commercial-intake/index.ts`

### Authentication Model

This function explicitly disables JWT verification and instead uses a **token-gated** approach. The token is a 40-64 character hex string looked up against the `commercial_intake_links` table. The token itself is the credential.

### What it can do

- **`fetch` action** (lines 107-125): Returns non-sensitive prefill data (business name, entity type, NAICS code, etc.) for the account linked to the token. Explicitly excludes FEIN.
- **`submit` action** (lines 127-161): Inserts a sanitized payload into `commercial_intake_submissions` (staging table). Does NOT write to live data tables.

### Security Controls Present

| Control | Status | Details |
|---------|--------|---------|
| Token validation | **GOOD** | Regex-validated (`/^[a-f0-9]{40,64}$/i`), DB-looked-up, checked for revocation and expiry (line 96-105) |
| Anti-enumeration | **GOOD** | Uniform `LINK_ERROR` message on all token failures; action validated before token lookup (line 90) |
| Payload allowlisting | **GOOD** | Only 10 named fields accepted via `FIELDS` map with type/length caps (lines 26-37) |
| Rate limiting | **GOOD** | 5 submissions per link per hour (lines 129-137) |
| Data isolation | **GOOD** | Writes to staging table only, not live data (Invariant 4) |
| CORS | **GOOD** | Uses `getCorsHeaders()` from shared cors.ts with origin allowlist, NOT wildcard |
| FEIN protection | **GOOD** | FEIN is accepted as input but never echoed back on fetch (line 113 comment) |

### Finding: NONE

**Assessment:** This function is well-designed for its purpose. The token-gated public intake pattern is appropriate, and the defense-in-depth controls (allowlisting, rate limiting, staging writes, anti-enumeration) are correctly implemented.

---

## 2. Webhook Handlers (verify_jwt = false)

### 2a. canopy-webhook

**File:** `supabase/functions/canopy-webhook/index.ts`

| Control | Status | Details |
|---------|--------|---------|
| Signature verification | **PRESENT BUT CONDITIONAL** | HMAC-SHA256 verification with `CANOPY_WEBHOOK_SECRET` (lines 213-261) |
| Timing-safe comparison | **GOOD** | Constant-time byte-by-byte XOR comparison (lines 257-264) |
| Replay protection | **GOOD** | Timestamp freshness check within 5-minute window (lines 342-354) |
| Fail-closed when configured | **GOOD** | Rejects missing/invalid signatures when secret is set (lines 318-340) |

**Finding CW-1: MEDIUM - Fails open when CANOPY_WEBHOOK_SECRET is not configured**

- **Lines:** 357-361
- **Vulnerability:** When `CANOPY_WEBHOOK_SECRET` is not set, the function logs a warning but accepts all requests (`signatureValid = true`), allowing anyone who knows the endpoint URL to inject arbitrary Canopy webhook events.
- **Attack path:** An attacker sends crafted `pull.complete` events with fabricated policy data, which gets inserted into the `canopy_webhook_logs` and triggers downstream policy sync processing.
- **Severity:** MEDIUM (requires secret to be unconfigured; in a properly configured production environment this is not exploitable, but the fail-open pattern is a risk during setup or if the secret is accidentally removed)
- **Mitigation:** The code explicitly comments this is "for initial setup/testing." Should be hardened to fail closed with a `500` response when the secret is missing.

---

### 2b. parseur-webhook

**File:** `supabase/functions/parseur-webhook/index.ts`

| Control | Status | Details |
|---------|--------|---------|
| API key verification | **GOOD** | Checks `x-make-apikey` header against `PARSEUR_WEBHOOK_API_KEY` env var (lines 20-32) |
| Fail-closed | **GOOD** | Rejects all requests if env var not set (lines 24-27) |
| Data validation | **PARTIAL** | Validates `document.id` exists but trusts the rest of the payload structure |

**Finding:** NONE (properly secured with fail-closed behavior)

**Note:** The API key comparison on line 29 (`apiKey !== expectedApiKey`) is not timing-safe. However, for a webhook API key (not a password hash), the practical risk of a timing side-channel is negligible given network jitter.

---

### 2c. twilio-sms-webhook

**File:** `supabase/functions/twilio-sms-webhook/index.ts`

| Control | Status | Details |
|---------|--------|---------|
| Signature verification | **PRESENT** | HMAC-SHA1 per Twilio's spec (lines 12-44) |
| Fail-closed (no token) | **GOOD** | Rejects when `TWILIO_AUTH_TOKEN` missing (lines 59-65) |
| Fail-closed (no signature) | **GOOD** | Rejects when `x-twilio-signature` missing (lines 67-73) |
| Fail-closed (invalid sig) | **GOOD** | Rejects on invalid signature (lines 93-99) |

**Finding TS-1: LOW - Non-timing-safe signature comparison**

- **Line:** 43
- **Vulnerability:** `return signature === expectedSignature` uses JavaScript's `===` which can leak timing information.
- **Attack path:** Theoretically, an attacker could measure response times to reconstruct the valid HMAC signature byte-by-byte. In practice, this requires microsecond-level timing precision across a network, making it impractical for a webhook endpoint.
- **Severity:** LOW (theoretical; network jitter makes this unexploitable in practice for HMAC signatures)
- **Mitigation:** Replace with a constant-time comparison function (as done in `suggest-account-links` and `canopy-webhook`).

---

### 2d. twilio-voice-webhook

**File:** `supabase/functions/twilio-voice-webhook/index.ts`

| Control | Status | Details |
|---------|--------|---------|
| Signature verification | **GOOD** | Same HMAC-SHA1 pattern as SMS webhook |
| URL construction | **GOOD** | Uses hardcoded canonical URL for signature validation (line 93) |
| Fail-closed | **GOOD** | Rejects on missing token, signature, or invalid signature |

**Finding:** Same LOW-severity non-timing-safe comparison as twilio-sms-webhook (line 43).

---

### 2e. twilio-recording-webhook

**File:** `supabase/functions/twilio-recording-webhook/index.ts`

Same security posture as the other Twilio webhooks. Properly validates signatures and fails closed.

**Finding:** Same LOW-severity timing issue (line 43).

---

### 2f. email-inbound

**File:** `supabase/functions/email-inbound/index.ts`

| Control | Status | Details |
|---------|--------|---------|
| Secret verification | **GOOD** | Checks `x-parse-secret` header against `INBOUND_PARSE_SECRET` (lines 29-37) |
| Fail-closed | **GOOD** | Rejects if secret not configured (lines 30-33) or doesn't match (lines 34-37) |
| Sender allowlisting | **GOOD** | Checks `inbound_allowlist` table (lines 43-53) |

**Finding:** NONE (properly secured)

---

### 2g. email-inbound-lite

**File:** `supabase/functions/email-inbound-lite/index.ts`

**Finding EIL-1: HIGH - Fails open when INBOUND_PARSE_SECRET is not configured**

- **Line:** 480
- **Vulnerability:** `if (PARSE_SECRET && provided !== PARSE_SECRET)` - When `INBOUND_PARSE_SECRET` is not set (falsy), the entire auth check is skipped. Any request is accepted.
- **Attack path:** If `INBOUND_PARSE_SECRET` is not configured in Supabase Edge Function secrets, an attacker can send crafted email payloads to create tickets, insert ticket messages, create customer profiles (via `ensureProfileByEmail`), upload files to `ticket-attachments` storage, and trigger Floor automation work requests.
- **Operations at risk:**
  - Profile creation in `profiles` table (lines 52-97)
  - Ticket creation in `tickets` table (lines 408-417)
  - Message insertion in `ticket_messages` (lines 455-468)
  - File uploads to `ticket-attachments` bucket (lines 423-453)
  - Automation work request creation in `automation_work_requests` (lines 246-371)
- **Severity:** HIGH (unauthenticated write access to multiple tables and storage; profile creation is especially concerning)
- **Existing mitigations:** The `allowedSender` check (line 493) gates on the `inbound_allowlist` table, which provides a secondary layer. However, the sender `from` field in the payload is completely attacker-controlled (it is self-reported, not verified), so this is not a meaningful security boundary.
- **Fix:** Change to fail-closed: `if (!PARSE_SECRET || provided !== PARSE_SECRET)`.

---

### 2h. esign-webhook (Dropbox Sign)

**File:** `supabase/functions/esign-webhook/index.ts`

**Finding EW-1: HIGH - Signature verification is optional and warns-only on failure**

- **Lines:** 342-351
- **Vulnerability:** The function has a well-implemented `verifyWebhookSignature` function, but uses it only conditionally:
  1. If `DROPBOX_ACCESS_TOKEN` is not set, signature verification is skipped entirely (line 342)
  2. If the `x-hellosign-signature` header is missing, verification is skipped (line 346)
  3. If the signature is INVALID, the function only logs a warning and continues processing (lines 348-350)
- **Comment on line 344:** `"In production, you should fail if signature doesn't match"` explicitly acknowledges this is not production-ready.
- **Attack path:** An attacker can send crafted webhook events (e.g., `signature_request_all_signed`) to:
  - Update `signature_requests` status to `completed` (lines 417-420)
  - Trigger download attempts from Dropbox Sign API (line 441 - would fail without valid API key)
  - Update `acord_forms` to `signed` status (line 243-251)
  - Mark signature requests as declined/cancelled/expired
- **Severity:** HIGH (an attacker can manipulate the signing workflow status of ACORD forms and signature requests, potentially causing business logic issues such as marking unsigned documents as signed)
- **Existing mitigations:** The `processSignedDocument` function would fail to download the actual PDF from Dropbox Sign (lines 113-120 require a valid API key), so an attacker cannot inject fake signed PDFs. However, the status change itself is the vulnerability.
- **Fix:** Remove the warn-and-continue pattern. Fail closed when signature verification fails or when the API key is not configured.

---

### 2i. marketing-unsubscribe

**File:** `supabase/functions/marketing-unsubscribe/index.ts`

| Control | Status | Details |
|---------|--------|---------|
| Token-based auth | **GOOD** | HMAC-SHA256 signed tokens with payload verification (lines 285-347) |
| Fail-closed (no secret) | **GOOD** | Rejects if `UNSUBSCRIBE_SECRET` not configured (lines 288-290) |
| Token expiry | **GOOD** | 90-day expiry checked (lines 323-326) |
| Contact verification | **GOOD** | Verifies contact exists in DB (lines 329-340) |
| SMS STOP handler | **ACCEPTABLE** | No auth needed per TCPA requirements (carriers handle STOP natively) |

**Finding:** NONE (properly secured for a public unsubscribe endpoint)

**Note:** The HMAC comparison on line 315 (`signature !== expectedSignature`) is not timing-safe, but the same practical considerations as the Twilio webhooks apply.

---

## 3. CRON_SECRET-Authenticated Functions

### 3a. suggest-account-links

**File:** `supabase/functions/suggest-account-links/index.ts`

| Control | Status | Details |
|---------|--------|---------|
| CRON_SECRET validation | **GOOD** | Present and properly implemented (lines 36-45) |
| Timing-safe comparison | **GOOD** | Custom `timingSafeEqual` function with XOR-based comparison (lines 25-30) |
| Early return on failure | **GOOD** | Returns 401 immediately (lines 40-44) |

**Finding SAL-1: MEDIUM - Fails open when CRON_SECRET is not configured**

- **Lines:** 37-45
- **Vulnerability:** `if (cronSecret)` - when `CRON_SECRET` is not set, the entire auth check is skipped. The function proceeds to call `generate_relationship_suggestions` RPC without any authentication.
- **Attack path:** If `CRON_SECRET` is not configured, anyone can trigger the relationship suggestion engine, which reads the entire account book and writes suggestions to `account_relationship_suggestions`.
- **Severity:** MEDIUM (the function only generates suggestions that require human approval, limiting direct data impact, but it does read the full account book and the lack of auth is a design flaw)
- **Fix:** Change to `if (!cronSecret) return 500; if (!provided || !timingSafeEqual(...)) return 401;`

---

### 3b. reputation-manager

**File:** `supabase/functions/reputation-manager/index.ts`

This function uses **dual authentication**: JWT + agency membership for internal actions, and token-based auth for public NPS response submission. It does NOT use CRON_SECRET.

| Control | Status | Details |
|---------|--------|---------|
| JWT auth for internal actions | **GOOD** | `requireAgencyAuth()` + `verifyAgencyMembership()` (lines 87-106) |
| Agency-scoped operations | **GOOD** | Every handler verifies the user's agency membership before acting |
| Public NPS submission | **ACCEPTABLE** | `submit_nps_response` accepts any `response_id` without auth (lines 721-772) |

**Finding RM-1: MEDIUM - NPS response submission has no authentication**

- **Lines:** 721-772
- **Vulnerability:** The `submit_nps_response` action (line 129-130) does not require any authentication. An attacker who knows or guesses a `response_id` UUID can submit or overwrite NPS scores.
- **Attack path:** An attacker could enumerate `response_id` UUIDs (though these are random UUIDs, making enumeration impractical) and submit fake NPS scores, skewing survey results.
- **Severity:** MEDIUM (impact is limited to NPS score manipulation; UUIDs provide practical obscurity but not true security)
- **Existing mitigations:** `response_id` is a UUID, making brute-force enumeration infeasible. The `calculate_nps_score` RPC recalculates aggregates, so individual manipulation has limited effect.

---

### 3c. renewal-risk-batch

**File:** `supabase/functions/renewal-risk-batch/index.ts`

| Control | Status | Details |
|---------|--------|---------|
| Authentication | **GOOD** | Uses `requireAuth()` from shared auth module (line 28) |
| Early return on failure | **GOOD** | Returns auth error response immediately (lines 29-31) |

**Finding:** NONE (uses JWT auth via `requireAuth`, not CRON_SECRET)

---

### 3d. process-document-batch

**File:** `supabase/functions/process-document-batch/index.ts`

| Control | Status | Details |
|---------|--------|---------|
| Authentication | **GOOD** | Uses `requireAuth()` from shared auth module (line 28) |
| Early return on failure | **GOOD** | Returns auth error response immediately (lines 29-31) |

**Finding:** NONE (uses JWT auth via `requireAuth`, not CRON_SECRET)

---

## 4. Wildcard CORS Analysis

### Shared CORS Module

**File:** `supabase/functions/_shared/cors.ts`

The shared module provides **two exports** with different security postures:

1. **`getCorsHeaders(origin)` + `handleCors(req)`** (lines 35-61): Origin-allowlisted CORS. Returns the requesting origin only if it matches the allowlist. Falls back to `ALLOWED_ORIGINS[0]` (production origin), which causes the browser to reject cross-origin requests from unlisted origins.

2. **`corsHeaders` (legacy export, line 67-70)**: Hardcoded `Access-Control-Allow-Origin: *` wildcard. Marked as `@deprecated` but still exported.

### Usage Analysis

**50+ functions use inline wildcard CORS** (`'Access-Control-Allow-Origin': '*'`) instead of the shared `getCorsHeaders()` function. Only `commercial-intake` uses the proper origin-checked version.

### Impact Assessment

The wildcard CORS pattern is **not directly exploitable as a CSRF vector** in this architecture because:

1. **Supabase Edge Functions use Authorization headers** (JWT Bearer tokens or API keys). CORS preflight is triggered for any request with an `Authorization` header, and the browser will send the preflight but will NOT attach cookies or credentials to cross-origin requests when `Access-Control-Allow-Credentials` is not set (and it is not set in any of these functions).

2. **No cookie-based auth is used.** All functions authenticate via explicit `Authorization` headers or custom headers (`x-cron-secret`, `x-parse-secret`), which cannot be automatically attached by a malicious cross-origin page.

3. **The `*` wildcard is actually correct for webhook endpoints** (Twilio, Canopy, Parseur, Dropbox Sign) because these are server-to-server calls where CORS does not apply.

However, the wildcard pattern creates a **data exfiltration risk** for any function that returns sensitive data and relies on JWT auth:

- A malicious page can make a `fetch()` to the edge function URL. If the victim user has their JWT stored in a way that gets attached (e.g., via a browser extension or compromised app), the response will be readable by the attacking page because `*` allows any origin to read it.
- With origin-checked CORS, the browser would block the malicious page from reading the response even if the request succeeded.

**Finding:** The widespread use of the deprecated `corsHeaders` wildcard export instead of `getCorsHeaders()` is a defense-in-depth gap but not an actively exploitable vulnerability given the header-based auth model.

---

## Summary of Findings

| ID | Severity | Function | Issue |
|----|----------|----------|-------|
| EIL-1 | **HIGH** | `email-inbound-lite` | Fails open when `INBOUND_PARSE_SECRET` is not configured; allows unauthenticated writes to profiles, tickets, ticket_messages, storage, and automation work requests |
| EW-1 | **HIGH** | `esign-webhook` | Signature verification is optional and warns-only on failure; allows unauthenticated status manipulation of signature requests and ACORD forms |
| CW-1 | MEDIUM | `canopy-webhook` | Fails open when `CANOPY_WEBHOOK_SECRET` is not configured |
| SAL-1 | MEDIUM | `suggest-account-links` | Fails open when `CRON_SECRET` is not configured |
| RM-1 | MEDIUM | `reputation-manager` | NPS response submission requires no authentication beyond knowing the response UUID |
| TS-1 | LOW | `twilio-*-webhook` (3 functions) | Non-timing-safe HMAC signature comparison via `===` |

### Recommended Priority Order

1. **EW-1 (esign-webhook):** Change warn-and-continue to fail-closed on signature mismatch. Add fail-closed when API key is not configured.
2. **EIL-1 (email-inbound-lite):** Change `if (PARSE_SECRET && ...)` to `if (!PARSE_SECRET || provided !== PARSE_SECRET)`.
3. **CW-1 (canopy-webhook):** Return 500 when `CANOPY_WEBHOOK_SECRET` is not set instead of accepting all requests.
4. **SAL-1 (suggest-account-links):** Return 500 when `CRON_SECRET` is not set instead of skipping auth.
5. **RM-1 (reputation-manager):** Add HMAC token verification to `submit_nps_response` or accept the risk given UUID unpredictability.
6. **TS-1 (twilio webhooks):** Replace `===` with constant-time comparison for defense-in-depth.

### Positive Findings

- `commercial-intake` is well-designed with proper token-gating, allowlisting, rate limiting, and staging writes
- `parseur-webhook` properly fails closed when its API key is not configured
- `email-inbound` (non-lite) properly fails closed
- `marketing-unsubscribe` uses HMAC-signed tokens with expiry verification
- `suggest-account-links` implements timing-safe comparison (only the fail-open guard is the issue)
- `canopy-webhook` has excellent signature verification when configured (HMAC-SHA256, constant-time comparison, replay protection with 5-minute timestamp window)
