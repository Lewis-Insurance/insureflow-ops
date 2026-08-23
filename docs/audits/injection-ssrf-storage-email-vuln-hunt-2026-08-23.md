# Injection / SSRF / Secrets / Storage / Email vuln hunt — 2026-08-23

**Scope:** NEW exploitable issues that are **not** table RLS and **not** edge-function IDOR (other agents cover those). Focus: hardcoded secrets, command/path/template injection, SSRF, email/header injection, frontend auth trust that the backend honors, mass assignment / priv-esc, dangerous defaults (public PII buckets, credentialed CORS abuse), and payment/merge/quote/password logic flaws.

**Commit scanned:** `e4e7c6c6a61685066add54c5d4a79473d7392bbb`  
**Run:** `bc-25b7e70b-c835-4caa-ae14-5296b71a66a9`  
**Memory:** `insureflow-ops---flagged-vulnerabilities-8.json`

## Summary

| Severity | Count |
|----------|------:|
| Critical | 1 |
| High     | 2 |
| **Total new** | **3** |

## Findings

### 1. CRITICAL — `documents` bucket public + any-auth mutate/delete

**Location:** `supabase/migrations/20251028214559_04cdd6c2-dee6-41a5-80c8-85cecdb2b4ae.sql`

Forces `storage.buckets.documents` `public=true`, SELECT with no auth (`Anyone can view documents`), and UPDATE/DELETE for any `authenticated` role with **no ownership or path bind**. App uploads customer insurance PDFs / ID cards / collection / renewals / ACORD into this bucket; ~19 sites use `getPublicUrl` / `/object/public/documents/`. Documented as Batch 5B debt in `docs/data-audit/data-audit/STORAGE-URL-FINDINGS.md` but never fixed or previously flagged as a vuln finding.

**Attack path**

1. Learn `storage_path` (metadata leak, leaked public URL, or `{account_id}/{timestamp}-*` pattern).
2. `GET /storage/v1/object/public/documents/<path>` — no JWT.
3. Optional: any authenticated user `remove()` / overwrite any object in the bucket.

**Remediation:** Finish Batch 5B (signed URLs everywhere), then `public=false`, drop world SELECT, scope writes to owner path or staff+workspace.

---

### 2. HIGH — `workspace-documents` bucket public

**Location:** `supabase/migrations/20251029152842_ead694ca-4dd7-4b3b-b37b-632f76a2646a.sql` (+ `20251029171251` reaffirm)

`public=true` + `Public access to workspace documents` SELECT TO public. `ComparisonUploadModal` uploads coverage-comparison policy PDFs here.

**Attack path:** Obtain object path → `GET /storage/v1/object/public/workspace-documents/<path>` unauthenticated.

**Remediation:** Private bucket + signed URLs; scope storage policies to workspace owner/staff.

---

### 3. HIGH — `send-id-card-email` attacker-controlled `idCardUrl`

**Location:** `supabase/functions/send-id-card-email/index.ts`

`requireAuth` only (no staff/workspace). `idCardUrl` validated with `new URL()` only, then `encodeURI` into agency-branded HTML and sent via Resend from `documents@lewisinsurance.ai`. Distinct from already-reported `email-send` portal send: this plants a phishing **View ID Card** CTA.

**Attack path:** Auth → client-send approval → POST with attacker HTTPS `idCardUrl` → victim clicks agency mail CTA.

**Remediation:** Staff + workspace gate; mint signed storage URL server-side; reject caller absolute URLs (or allowlist project storage host only).

---

## Cleared / rejected (selected)

| Candidate | Reason |
|-----------|--------|
| Hardcoded anon JWT fallbacks | Public by design; not service_role |
| email-send / send-coi CRLF | JSON providers; send-coi regex blocks whitespace |
| Known SSRF (ocr, prism, automation webhook, explore, acord) | Prior findings |
| sunbiz-lookup / dispatch-outbox | Allowlist / env URL |
| Command injection | None found |
| document-qa `../` cleanPath | Bucket-scoped download |
| CORS `*` cookie steal | Bearer auth, no concrete steal |
| premium_payments RLS disabled | Out of scope (table RLS / other agents) |
| Known priv-esc / merge / intake redirect / edge IDOR | Duplicates |
| canopy / esign fail-open | Current code fail-closed |
| Legacy public `certificates` storage bucket | Active writes use private `coi-certificates` |

## Notes

- Mitigations verified where claimed: Zod/approval gates on some send surfaces, sunbiz URL prefix allowlist, parameterized PostgREST in hardened paths, Resend/Postmark JSON (not raw SMTP) for COI.
- Do **not** treat this hunt as clearing prior RLS or edge-IDOR findings; those remain active in earlier memory files.
