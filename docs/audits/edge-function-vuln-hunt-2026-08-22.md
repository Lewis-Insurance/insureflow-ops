# Edge Function Vulnerability Hunt — 2026-08-22

Scope: HIGH/CRITICAL exploitable issues in previously unreviewed Supabase edge functions.
Already-reported locations from the hunt brief were excluded (same location+issue).

## Findings

```
SEVERITY: CRITICAL
LOCATION: supabase/functions/ai-document-analysis-simple/index.ts
TITLE: ai-document-analysis-simple IDOR returns full OCR text for any document via service_role
DESCRIPTION: The function authenticates with requireAuth only (any valid JWT, including portal customers). It then calls runPhase0DocumentExtract with an attacker-supplied document_id using SUPABASE_SERVICE_ROLE_KEY, which loads the document storage path, creates a signed URL, runs OCR/AI, and returns the complete ocr_text and analysis payload in the HTTP response. There is no staff check and no workspace/account membership verification against the target document.
IMPACT: Any authenticated user who knows or obtains a document UUID can exfiltrate full insurance document OCR text (policy numbers, named insureds, coverage, addresses, and other PII) across tenants, and burn Azure Document Intelligence / OpenAI quota.
ATTACK_PATH:
1. Attacker authenticates with any valid JWT (staff or customer portal).
2. POST to /functions/v1/ai-document-analysis-simple with { "document_id": "<victim document uuid>" }.
3. requireAuth accepts the JWT; no workspace check follows.
4. Service-role client loads documents.storage_path for that id and OCRs the file.
5. Response includes ocr_text and analysis for the victim document.
EVIDENCE:
- supabase/functions/ai-document-analysis-simple/index.ts:33-47 — service_role client + requireAuth only
- supabase/functions/ai-document-analysis-simple/index.ts:49-54 — attacker-controlled document_id passed into extract
- supabase/functions/ai-document-analysis-simple/index.ts:60-74 — response returns ocr_text and analysis
- supabase/functions/_shared/phase0Extract.ts:229-243 — service_role reads documents row and mints signed URL with no caller ACL
REMEDIATION: After auth, require is_staff() and verify the caller is an active member of the document's account agency_workspace_id before OCR. Prefer user-scoped client for the document lookup so RLS applies.
WHY_NOT_DUPLICATE: Distinct from analyze-insurance-document / document-qa-azure / execute-ai-module; this is a separate entrypoint that returns full OCR in-band.
CONFIDENCE: high
```

```
SEVERITY: CRITICAL
LOCATION: supabase/functions/explore-qa/index.ts
TITLE: explore-qa cross-tenant document RAG exfiltration via service_role with optional unscoped search
DESCRIPTION: explore-qa uses requireAuth only, then queries knowledge_base / search_document_chunks / document_evidence_items / document_extractions with the service role. Attackers can pass any extraction_id or document_id. Worse, when both are omitted, search_document_chunks treats NULL filters as "all documents" (SECURITY DEFINER RPC), and the keyword fallback also queries document_chunk rows with no tenant filter, returning content into the LLM context and API answer.
IMPACT: Any authenticated user can read insurance document chunk content and evidence snippets across all workspaces, with or without a target UUID.
ATTACK_PATH:
1. Attacker authenticates with any valid JWT.
2. POST to /functions/v1/explore-qa with { "question": "What is the policy number?" } (no document_id/extraction_id), or with a victim document_id/extraction_id.
3. requireAuth passes; service_role bypasses RLS.
4. Vector search and/or unscoped keyword search load foreign document chunks and evidence.
5. Answer (and citations) return victim document content to the attacker.
EVIDENCE:
- supabase/functions/explore-qa/index.ts:90-99 — service_role + requireAuth only
- supabase/functions/explore-qa/index.ts:193-201 — RPC called with nullable document/extraction filters
- supabase/functions/explore-qa/index.ts:210-221 — keyword query unscoped when both IDs omitted
- supabase/migrations/20251222160000_explore_document_minimal_delta.sql:152-156 — NULL p_document_id/p_extraction_id means no document filter
REMEDIATION: Enforce staff + workspace membership on the target document/extraction. Reject requests with neither ID. Scope search_document_chunks by agency_workspace_id and stop granting unscoped SECURITY DEFINER search to interactive callers.
WHY_NOT_DUPLICATE: document-qa-azure is a different function; explore-qa was not in the already-reported list and adds an unscoped (no-ID) exfiltration path.
CONFIDENCE: high
```

```
SEVERITY: CRITICAL
LOCATION: supabase/functions/extract-bap-policy/index.ts
TITLE: extract-bap-policy IDOR allows any authenticated user to overwrite BAP policy data across tenants
DESCRIPTION: Same authorization pattern as the already-reported extract-cgl-policy issue, but in a distinct function. requireAuth only; attacker-chosen policy_id and document_id; service_role reads the document, runs OCR/LLM, then UPDATEs policies.bap_details and DELETE/INSERT child tables (vehicles, drivers, coverages, interests) for the target policy with no workspace membership check.
IMPACT: Cross-tenant corruption of commercial auto policy structured data used for COI/operations: overwrite BAP details, replace vehicle/driver inventories, and attach attacker-chosen source documents.
ATTACK_PATH:
1. Attacker authenticates with any valid JWT.
2. POST to /functions/v1/extract-bap-policy with victim policy_id and a document_id the service role can read (or one the attacker can influence).
3. requireAuth passes; no is_staff/workspace gate.
4. Background extraction updates policies and policy_bap_* tables for the victim policy_id.
5. Victim agency sees attacker-controlled BAP extraction data.
EVIDENCE:
- supabase/functions/extract-bap-policy/index.ts:357-366 — service_role + requireAuth; attacker supplies policy_id/document_id
- supabase/functions/extract-bap-policy/index.ts:408-412 — loads arbitrary documents row
- supabase/functions/extract-bap-policy/index.ts:536-542 — UPDATEs policies by attacker policy_id
- supabase/functions/extract-bap-policy/index.ts:547-567 — DELETE/INSERT policy_bap_* for that policy_id
REMEDIATION: Require staff and is_agency_member on the policy's account workspace; verify document.account_id matches policy.account_id before extraction.
WHY_NOT_DUPLICATE: extract-cgl-policy was reported; this is a distinct sibling function (extract-bap-policy) with a complete write attack chain.
CONFIDENCE: high
```

```
SEVERITY: HIGH
LOCATION: supabase/functions/worker-comparison/index.ts
TITLE: worker-comparison lets any authenticated user claim and process the global comparison job queue
DESCRIPTION: verify_jwt=false at the gateway; in-code auth is only requireAuth. After auth, the unused authenticatedUser is ignored and the function calls claim_jobs_for_worker via service_role, then processes job input_data (document paths), writes comparison_sessions for job.account_id, and updates jobs across tenants.
IMPACT: Any logged-in user can drain the worker queue, read comparison document paths from pending jobs, create comparison_sessions for other accounts, and disrupt or complete other tenants' comparison workflows / consume AI quota.
ATTACK_PATH:
1. Attacker authenticates with any valid JWT.
2. Repeatedly POST to /functions/v1/worker-comparison.
3. requireAuth succeeds; claim_jobs_for_worker returns pending jobs system-wide.
4. processJob reads option paths and writes comparison_sessions / job status via service_role.
EVIDENCE:
- supabase/config.toml:91-92 — [functions.worker-comparison] verify_jwt = false
- supabase/functions/worker-comparison/index.ts:16-35 — service_role + requireAuth; immediately claims jobs
- supabase/functions/worker-comparison/index.ts:77-127 — processes job input and inserts comparison_sessions for job.account_id
REMEDIATION: Gate with CRON_SECRET (fail-closed) or a dedicated worker credential. Do not allow interactive user JWTs to claim the global queue.
WHY_NOT_DUPLICATE: worker-comparison was not in the already-reported set.
CONFIDENCE: high
```

```
SEVERITY: HIGH
LOCATION: supabase/functions/check-document-integrity/index.ts
TITLE: check-document-integrity IDOR enumerates and mutates document integrity flags for any account
DESCRIPTION: requireAuth only. Attacker supplies account_id; service_role lists all documents for that account (ids + storage paths) and UPDATEs file_missing / last_checked_at / storage_bucket on each row with no workspace membership check.
IMPACT: Cross-tenant document inventory disclosure and integrity-flag corruption (marking live documents missing or rewriting storage_bucket metadata).
ATTACK_PATH:
1. Attacker authenticates with any valid JWT.
2. POST { "account_id": "<victim account uuid>" } to check-document-integrity.
3. Service_role SELECT returns all document ids/paths for that account.
4. Function UPDATEs file_missing and related fields on each document.
5. Response returns checked/missing results including document ids.
EVIDENCE:
- supabase/functions/check-document-integrity/index.ts:22-38 — service_role + requireAuth only
- supabase/functions/check-document-integrity/index.ts:38-53 — attacker-chosen account_id drives document listing
- supabase/functions/check-document-integrity/index.ts:103-111 — service_role UPDATE of integrity fields
- supabase/functions/check-document-integrity/index.ts:118-124 — returns per-document results to caller
REMEDIATION: Require staff + is_agency_member for the target account's agency_workspace_id before listing or updating documents.
WHY_NOT_DUPLICATE: Not previously listed; distinct from storage/public-bucket and other document IDOR reports.
CONFIDENCE: high
```

```
SEVERITY: HIGH
LOCATION: supabase/functions/classify-document/index.ts
TITLE: classify-document IDOR reads and overwrites classification metadata on arbitrary documents
DESCRIPTION: requireAuth only. With a victim document_id, service_role SELECTs file_name/extracted_text/file_path and UPDATEs document_type, line_of_business, urgency_level, tags, and metadata. No staff or workspace check. (document_url is accepted but unused — no SSRF here.)
IMPACT: Cross-tenant read of extracted_text (when present) and unauthorized mutation of document classification used for workflows/routing.
ATTACK_PATH:
1. Attacker authenticates with any valid JWT.
2. POST { "document_id": "<victim uuid>" } to classify-document.
3. Service_role loads the document text/name.
4. Function writes classification fields back to that document.
5. Response returns the classification object (and text was processed server-side from the victim row).
EVIDENCE:
- supabase/functions/classify-document/index.ts:66-82 — service_role + requireAuth
- supabase/functions/classify-document/index.ts:94-100 — SELECT documents by attacker document_id
- supabase/functions/classify-document/index.ts:111-128 — UPDATE documents by attacker document_id
REMEDIATION: Verify staff membership on the document's account workspace before read/update.
WHY_NOT_DUPLICATE: classify-document was not in the already-reported list.
CONFIDENCE: high
```

```
SEVERITY: HIGH
LOCATION: supabase/functions/comparison-extract/index.ts
TITLE: comparison-extract IDOR processes any comparison workspace without membership checks
DESCRIPTION: requireAuth only. Attacker-supplied workspace_id is loaded via service_role including workspace_documents (file names/URLs). Documents are downloaded from storage and OCR/LLM processed with no verification that the caller belongs to the workspace/tenant that owns it. comparison-analyze follows the same requireAuth-only + workspace_id pattern.
IMPACT: Cross-tenant access to comparison workspace documents and consumption of Azure DI/OpenAI against another tenant's files; results written under the victim workspace_id.
ATTACK_PATH:
1. Attacker authenticates with any valid JWT.
2. POST { "workspace_id": "<victim comparison workspace uuid>" } to comparison-extract.
3. requireAuth passes; service_role loads workspace + documents.
4. Files downloaded from workspace-documents and sent to Azure DI/LLM.
5. Extraction artifacts stored for that workspace.
EVIDENCE:
- supabase/functions/comparison-extract/index.ts:66-86 — service_role client; requireAuth only after reading workspace_id
- supabase/functions/comparison-extract/index.ts:98-116 — loads arbitrary workspace and documents
- supabase/functions/comparison-extract/index.ts:224-227 — downloads victim document from storage
- supabase/functions/comparison-analyze/index.ts:133-151 — same requireAuth-only workspace_id pattern (sibling)
REMEDIATION: After requireAuth, verify the caller is staff and a member of the agency that owns the comparison workspace before loading documents.
WHY_NOT_DUPLICATE: Distinct from analyze-workspace IDOR; this is the comparison-extract entrypoint.
CONFIDENCE: high
```

```
SEVERITY: HIGH
LOCATION: supabase/functions/index-document-chunks/index.ts
TITLE: index-document-chunks IDOR reads OCR text and can delete/reindex chunks for any document
DESCRIPTION: requireAuth only. Attacker supplies document_id or analysis_id; service_role loads document_analysis.ocr_text (full OCR) and, with force_reindex, DELETEs existing document_chunks for that document before re-embedding. No workspace check. OCR content can then be queried via explore-qa using the same document_id.
IMPACT: Cross-tenant OCR access in process memory, destruction/rebuild of RAG indexes, Azure embeddings quota abuse, and facilitation of explore-qa exfiltration.
ATTACK_PATH:
1. Attacker authenticates with any valid JWT.
2. POST { "document_id": "<victim>", "force_reindex": true } to index-document-chunks.
3. Service_role loads ocr_text from document_analysis.
4. Existing chunks deleted; new chunks written.
5. Attacker follows up with explore-qa using the same document_id to read content.
EVIDENCE:
- supabase/functions/index-document-chunks/index.ts:90-102 — service_role + requireAuth; attacker IDs
- supabase/functions/index-document-chunks/index.ts:122-147 — loads ocr_text for arbitrary analysis/document
- supabase/functions/index-document-chunks/index.ts:152-154 — force_reindex deletes victim chunks
REMEDIATION: Require staff + workspace membership on the document's account before indexing; remove interactive force_reindex or gate it to admins of that workspace.
WHY_NOT_DUPLICATE: index-document-chunks was not previously reported (distinct from execute-ai-module / document-qa-azure).
CONFIDENCE: high
```

## Reviewed and not reported (not exploitable at HIGH/CRITICAL with complete chain)

| Function | Why cleared |
|---|---|
| send-sms | requireAuth + optional verifyResourceAccess + client-send approval gate; abuse depends on already-reported approval minting |
| send-coi-email | staff + is_agency_member / floor is_staff_member_of; cron path needs CRON_SECRET |
| send-id-card-email | gated by client-send approval; no standalone chain without known approval bug |
| twilio-voice / twilio-sms / twilio-*-webhook | fail-closed on missing TWILIO_AUTH_TOKEN; signature required |
| email-inbound / email-inbound-lite | fail-closed on missing parse secret |
| parseur-webhook | fail-closed on missing PARSEUR_WEBHOOK_API_KEY (filter injection not reachable without secret) |
| commercial-intake | token-gated (192-bit), allowlisted payload, staged writes only |
| decrypt-ssn | function directory does not exist |
| pdf-generation-worker | does not exist |
| context-indexer | CRON_SECRET fail-closed |
| admin-create-user | provisioned-admin gate + workspace checks |
| weekly-ceo-digest / run-retention-scoring / run-coverage-gap-detection / process-document-tasks | verifyCronSecret |
| floor-run-plays / floor-release-held-sends / dispatch-outbox / suggest-account-links / recalculate-ao-priorities | cron secret fail-closed in production |
| floor-action | agency membership checks present |
| get-document-url / get-id-card-image / generate-apple-pass | RPC access checks via user JWT |
| generate-certificate | staff + workspace membership |
| sunbiz-lookup | staff check + Sunbiz URL prefix allowlist |
| marketing-unsubscribe | HMAC token; fail-closed without UNSUBSCRIBE_SECRET |
| bank-statement-process / deposit-verify | user JWT + org/membership scoping via anon client |
| portal-submit-request | account-scoped policy checks |
| Netlify functions | none present under netlify/functions |

Other extract-*-policy siblings share the extract-bap pattern; only the worst remaining sibling (BAP) is filed to avoid duplicate flood.
