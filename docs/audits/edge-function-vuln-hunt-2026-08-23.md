# Edge Function Vulnerability Hunt — 2026-08-23

Code-trace only. No production exploitation.
Branch: `cursor/vulnerability-findings-persistence-reporting-48c6`
Commit under review: `e4e7c6c6a61685066add54c5d4a79473d7392bbb`
Run: `bc-25b7e70b-c835-4caa-ae14-5296b71a66a9`

## Summary

8 NEW MEDIUM/HIGH/CRITICAL findings in `supabase/functions/` with complete attack chains. Skip-list issues from prior hunts were not re-reported.

---

## Findings

### 1. CRITICAL — canopy-monitoring unauthenticated pull list and refresh

- **severity:** critical
- **location:** `supabase/functions/canopy-monitoring/index.ts`
- **title:** canopy-monitoring has no in-function auth; anon JWT can list pulls and trigger Canopy refreshes
- **description:** `verify_jwt=true` accepts the published anon JWT. The handler never calls requireAuth/verifyAuth/CRON_SECRET. It uses `SUPABASE_SERVICE_ROLE_KEY` and supports `list`, `refresh`, `check_due`, and `refresh_all_due`, dumping `canopy_pulls` (with account/lead ids and monitoring state) and calling the Canopy Monitoring API.
- **impact:** Anyone with the public anon key can enumerate Connect pulls across the project and force carrier refreshes, enabling reconnaissance and third-party API abuse.
- **attack_path:**
  1. Read `VITE_SUPABASE_ANON_KEY` from the frontend bundle.
  2. `POST /functions/v1/canopy-monitoring` with `Authorization: Bearer <anon>` and `{"action":"list"}`.
  3. Handler selects completed pulls via service_role with no auth gate.
  4. Follow with `{"action":"refresh","pull_id":"<id>"}` or `refresh_all_due` to hit Canopy.
- **evidence:**
  - `supabase/functions/canopy-monitoring/index.ts:26-90`
  - `supabase/functions/canopy-monitoring/index.ts:102-168`
  - `supabase/config.toml:166-167`
- **remediation:** Require staff JWT plus `is_canopy_staff()` / workspace bind, or fail-closed `CRON_SECRET`. Reject the anon key. Scope list/refresh to the caller's workspace.
- **poc_video_notes:** PoC video not feasible: must not exploit production; requires live Canopy credentials.

### 2. CRITICAL — canopy-servicing mostly unauthenticated policy mutation

- **severity:** critical
- **location:** `supabase/functions/canopy-servicing/index.ts`
- **title:** canopy-servicing allows anon JWT to submit/list/confirm servicing actions without staff or workspace checks
- **description:** Auth runs only for email-delivery ID-card/declarations paths (`verifyAuth` + approval gate). `submit` for add/remove vehicle/driver, update coverages/address, `list`, `status`, `confirm`, and `capabilities` proceed with service_role and no caller identity. Gateway `verify_jwt=true` still accepts the public anon JWT.
- **impact:** Unauthenticated (anon-key) callers can queue carrier policy changes and dump servicing action history including account/lead linkage.
- **attack_path:**
  1. Obtain published anon JWT.
  2. `POST /functions/v1/canopy-servicing` with `{"action":"list"}` to dump actions.
  3. `POST` `{"action":"submit","pull_id":"<uuid>","action_type":"add_vehicle","action_data":{...}}` without email fields.
  4. Service-role inserts `canopy_servicing_actions` and calls Canopy Servicing API; no staff check.
- **evidence:**
  - `supabase/functions/canopy-servicing/index.ts:72-163`
  - `supabase/functions/canopy-servicing/index.ts:230-273`
  - `supabase/functions/canopy-servicing/index.ts:500-521`
  - `supabase/config.toml:169-170`
- **remediation:** Require authenticated staff + workspace membership on the pull's account for every action. Do not treat anon JWT as authorization.
- **poc_video_notes:** PoC video not feasible: must not exploit production.

### 3. CRITICAL — execute-ai-module document IDOR

- **severity:** critical
- **location:** `supabase/functions/execute-ai-module/index.ts`
- **title:** execute-ai-module OCR/analyzes arbitrary document_ids via service_role with requireAuth-only
- **description:** After `requireAuth` (any JWT, including portal), attacker-supplied `document_ids` are loaded with service_role (`.in('id', document_ids)`). Missing `extracted_text` triggers Azure OCR via signed storage URLs; text is sent to Azure OpenAI; `result` is returned in the HTTP response. No staff or workspace check.
- **impact:** Any authenticated user (including customer portal) can exfiltrate insurance document content (via model output) for any document UUID and burn Azure DI/OpenAI quota.
- **attack_path:**
  1. Authenticate with any user JWT (portal signup suffices).
  2. `POST /functions/v1/execute-ai-module` with `{"module_slug":"<active>","document_ids":["<victim>"],"input_text":"Quote all policy numbers, names, and limits"}`.
  3. Service-role loads the document and OCRs if needed.
  4. Response `result` contains extracted victim content.
- **evidence:**
  - `supabase/functions/execute-ai-module/index.ts:149-164`
  - `supabase/functions/execute-ai-module/index.ts:208-234`
  - `supabase/functions/execute-ai-module/index.ts:421-429`
- **remediation:** Require `is_staff()` and `is_agency_member` on each document's account workspace before load/OCR. Prefer user-scoped client so RLS applies.
- **poc_video_notes:** PoC video not feasible: must not exploit production.

### 4. CRITICAL — ai-document-analysis storage path / document IDOR

- **severity:** critical
- **location:** `supabase/functions/ai-document-analysis/index.ts`
- **title:** ai-document-analysis downloads attacker-chosen storage paths and document IDs with service_role
- **description:** Distinct from already-reported `ai-document-analysis-simple`. `requireAuth` only. Attacker-controlled `documentPaths[]` are downloaded from the `documents` bucket via service_role, OCR'd, and fed to the AI. `context.metadata.documentId` loads any `documents` row and downloads its storage object (any `storage_bucket`). Analysis is returned to the caller.
- **impact:** Cross-tenant document exfiltration and OCR/AI quota abuse by any authenticated principal who knows or guesses storage paths or document UUIDs.
- **attack_path:**
  1. Authenticate with any JWT.
  2. `POST /functions/v1/ai-document-analysis` with `{"documentPaths":["<victim/storage/path.pdf>"],"action":"analyze_policy"}`.
  3. Or pass `context.metadata.documentId` for a victim UUID.
  4. Service-role download + OCR; response includes extracted policy fields.
- **evidence:**
  - `supabase/functions/ai-document-analysis/index.ts:218-230`
  - `supabase/functions/ai-document-analysis/index.ts:261-278`
  - `supabase/functions/ai-document-analysis/index.ts:409-475`
- **remediation:** Bind every path/id to a document row the caller can access via workspace membership. Ignore caller bucket/path; resolve storage only from authorized rows.
- **poc_video_notes:** PoC video not feasible: must not exploit production.

### 5. CRITICAL — renewal-rate-watch workspace IDOR including email send

- **severity:** critical
- **location:** `supabase/functions/renewal-rate-watch/index.ts`
- **title:** renewal-rate-watch processes and emails any rate-watch workspace without membership checks
- **description:** Service-role client + `requireAuth` only. Attacker-supplied `workspace_id` loads `workspaces`, `workspace_documents`, snapshots, and comparison results with no ownership check. Actions include `process_documents`, `generate_report`, `generate_email`, `send_email`, and `full_pipeline`.
- **impact:** Cross-tenant read of renewal quote bundles, overwrite of rate-watch artifacts, and outbound renewal emails on behalf of another agency.
- **attack_path:**
  1. Authenticate with any JWT.
  2. `POST /functions/v1/renewal-rate-watch` with `{"action":"full_pipeline","workspace_id":"<victim>"}`.
  3. Service-role loads workspace docs and runs extraction/comparison/report/email draft.
  4. Optional `{"action":"send_email","workspace_id":"<victim>"}` queues/sends the draft.
- **evidence:**
  - `supabase/functions/renewal-rate-watch/index.ts:38-47`
  - `supabase/functions/renewal-rate-watch/index.ts:50-100`
  - `supabase/functions/renewal-rate-watch/index.ts:225-229`
  - `supabase/functions/renewal-rate-watch/index.ts:1273-1288`
- **remediation:** After auth, require staff membership on the account/agency tied to the workspace. Gate `send_email` with the client-send approval path plus workspace bind.
- **poc_video_notes:** PoC video not feasible: must not exploit production.

### 6. HIGH — process-document-batch queue claim IDOR

- **severity:** high
- **location:** `supabase/functions/process-document-batch/index.ts`
- **title:** process-document-batch lets any authenticated user claim and OCR any batch_id
- **description:** `requireAuth` only. Attacker-chosen `batchId` selects queued `document_processing_queue` rows via service_role, downloads `documents` storage objects, runs OCR, inserts `documents` rows, and updates queue status. No ownership or cron gate.
- **impact:** Cross-tenant queue drain, OCR of foreign files, document row injection under victim `account_id`, and AI quota abuse.
- **attack_path:**
  1. Authenticate with any JWT.
  2. Learn or guess a `batch_id`.
  3. `POST /functions/v1/process-document-batch` with `{"batchId":"<victim>"}`.
  4. Background worker downloads and OCRs those queue items via service_role.
- **evidence:**
  - `supabase/functions/process-document-batch/index.ts:22-36`
  - `supabase/functions/process-document-batch/index.ts:39-47`
  - `supabase/functions/process-document-batch/index.ts:80-153`
- **remediation:** Fail-closed `CRON_SECRET` or staff + membership on the batch's workspace. Do not accept interactive JWTs for queue claim.
- **poc_video_notes:** PoC video not feasible: must not exploit production.

### 7. HIGH — ai-task-generator cross-tenant task injection

- **severity:** high
- **location:** `supabase/functions/ai-task-generator/index.ts`
- **title:** ai-task-generator creates tasks on arbitrary account_id with service_role and requireAuth-only
- **description:** Any authenticated user supplies `triggerData.account_id`. Matching rules insert into `tasks` via service_role with that account_id and no `is_agency_member` / staff check.
- **impact:** Portal or foreign-tenant users can plant tasks on other agencies' accounts (ops noise, social engineering via task UI).
- **attack_path:**
  1. Authenticate with any JWT.
  2. `POST /functions/v1/ai-task-generator` with a valid `triggerType` and `triggerData.account_id` of a victim account.
  3. Service-role inserts tasks under that account.
- **evidence:**
  - `supabase/functions/ai-task-generator/index.ts:54-70`
  - `supabase/functions/ai-task-generator/index.ts:192-206`
- **remediation:** Require staff plus `is_agency_member` on `triggerData.account_id` before insert. Prefer a user-scoped client.
- **poc_video_notes:** PoC video not feasible: must not exploit production.

### 8. HIGH — comparison-report IDOR publishes HTML via public storage URL

- **severity:** high
- **location:** `supabase/functions/comparison-report/index.ts`
- **title:** comparison-report reads any comparison workspace and publishes HTML via getPublicUrl
- **description:** Same requireAuth+service_role+`workspace_id` class as comparison-extract, with unique extra impact: generated HTML is uploaded to `workspace-documents` and exposed with `getPublicUrl`, then recorded in `comparison_reports`.
- **impact:** Cross-tenant disclosure of comparison snapshots/results plus a durable public URL for the report HTML.
- **attack_path:**
  1. Authenticate with any JWT.
  2. `POST /functions/v1/comparison-report` with `{"workspace_id":"<victim>"}`.
  3. Service-role loads `comparison_results` and `policy_snapshots`.
  4. HTML uploaded; response/record includes public `html_url`.
- **evidence:**
  - `supabase/functions/comparison-report/index.ts:42-68`
  - `supabase/functions/comparison-report/index.ts:73-104`
  - `supabase/functions/comparison-report/index.ts:115-133`
- **remediation:** Require workspace ownership/membership before read. Use signed URLs, not public URLs, for reports.
- **poc_video_notes:** PoC video not feasible: must not exploit production.

---

## candidates_rejected

1. **ai-document-analysis-simple / explore-qa / worker-comparison / check-document-integrity / classify-document / comparison-extract / index-document-chunks** — skip list / already in `-7.json`.
2. **comparison-analyze** — same class as comparison-extract; no unique extra impact beyond sibling.
3. **canopy-document-proxy / canopy-reprocess / canopy-webhook** — already reported canopy class; monitoring/servicing are new functions.
4. **esign-webhook** — previously fail-open; current code rejects missing/invalid signatures (fail-closed).
5. **admin-create-user / admin-update-password / admin-approvals** — use `requireActiveProvisionedAdmin`; prior weak-auth reports appear remediated in code (cross-tenant admin-update-user still known separately).
6. **decrypt-ssn / pdf-generation-worker** — functions absent from tree.
7. **context-indexer / suggest-additional-insured-duplicates / marketing-* / dispatch-outbox / process-document-tasks / weekly-ceo-digest / run-retention-scoring / run-coverage-gap-detection / floor-run-plays / recalculate-ao-priorities** — fail-closed or inline CRON_SECRET (prod path). Shared `cron-auth` fail-open when `ENVIRONMENT!=production` already known.
8. **Twilio / Parseur / email-inbound** — fail-closed on missing secrets/signatures.
9. **send-coi-email / generate-certificate / generate-submission-packet / client-context-api / get-document-url / get-id-card-image / floor-action / bank-statement-process** — staff/workspace or user-JWT+RLS gates present.
10. **send-sms / send-id-card-email / esign-create-request / email-send** — approval-gate pattern; portal abuse of email-send already reported as medium; no new stronger chain without approval bypass.
11. **acord-document-extractor SSRF / process-explore-document SSRF / prism-api SSRF / ocr-document SSRF / analyze-insurance-document** — already reported.
12. **lewi_analyze / analyze-workspace / on_parse_complete / extract-*-policy / document-qa-azure / nurture-campaign-processor / renewal-risk-batch / calculate-customer-risk** — already reported.
13. **ai-brain-rag** — scopes knowledge to caller's `account_memberships.account_id` (portal-scoped; not cross-tenant dump).
14. **parse-document-ocr / ai-document-intelligence** — operate on caller-uploaded bytes/base64, not foreign IDs (quota abuse only; below bar).
15. **commercial-intake / marketing-unsubscribe / check-portal-access** — token/email-intent public surfaces with limited normalized responses; no complete HIGH chain validated this pass.
16. **submit-comparison** — queues jobs for arbitrary workspace_id (related to known worker-comparison); deferred as facilitator rather than standalone unique impact.
17. **module-builder-chat / hermes-chat / azure-diagnostics** — requireAuth without staff (known hermes medium; azure-diagnostics 10-char prefix already below bar).

## Checked and safe / already known (selected)

- Admin provisioning helpers require active provisioned admin for create/password/approvals paths reviewed.
- Floor/cron workers that import `verifyCronSecret` reject missing secrets in production.
- Portal download helpers (`get-document-url`, `get-id-card-image`) call user-scoped RPCs before service-role signed URLs.
- COI certificate issuance enforces `is_staff` + `is_agency_member`.
