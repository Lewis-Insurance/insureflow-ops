# InsureFlow AI/send fence verification handoff

Branch: `feat/fence-ungated-ai-send-paths`

Repo: `/Users/rocky/insureflow-ops`

Prepared: 2026-06-30 09:36 EDT

Production deploy status: **staged only; not executed**

## Purpose

This handoff lets a reviewer verify that the InsureFlow safety fence was built to scope before any Brian-approved production deploy. The fence closes the named Sprint 0–4 holes: the four server-gated client-send/client-effect functions, the AI-results direct-send shortcut, and the in-scope OpenAI/Anthropic/Gemini/Azure model-provider boundaries. It is not a claim that every client-reaching path or every possible model/OCR/provider boundary in the repo is complete.

## Branch commits in scope

```text
2bebade Fence Sprint 0 — inventory AI send paths
f319960 Fence Sprint 1 — server send approval gate
b77d76d Fence Sprint 2 — remove AI direct sends
b6f51e7 Fence Sprint 1 hardening — atomic send approval gate
2d63900 Fence Sprint 3 — redact model boundaries
3b21823 Fence Sprint 3 follow-up — close model SDK gaps
c7bd038 Fence Sprint 4 — verify fence handoff
```

Additional docs-only clarification already present on this branch: `82c3651 docs: clarify AI send fence handoff scope`.

## What to verify

### 1. Inventory and disposition exists

File:

- `docs/fence-ai-send-inventory.md`

Verify it classifies direct client-send/client-effect paths and AI/model paths into keep, wrap-with-approval, gate, disable/reroute, or redact, including the post-review disclosure additions for Canopy servicing, optional Hermes/Prism proxies, and Google Vision OCR.

### 2. Direct client-send/client-effect functions are server-gated

Critical files:

- `supabase/functions/_shared/clientSendApprovalGate.ts`
- `supabase/functions/client-send-approval-create/index.ts`
- `supabase/migrations/20260630040000_client_send_approvals.sql`
- `supabase/functions/email-send/index.ts`
- `supabase/functions/send-sms/index.ts`
- `supabase/functions/send-coi-email/index.ts`
- `supabase/functions/esign-create-request/index.ts`

Expected behavior:

- Request without `client_send_approval` is rejected before provider/carrier side effects.
- Approval ref must be server-minted and opaque.
- Approval ties to exact canonical content hash.
- Approval ties to the authenticated named human.
- Approval expires.
- Approval is one-time; replay is rejected by the final atomic update predicates.
- `email-send`, `send-sms`, `send-coi-email`, and `esign-create-request` all await `clientSendApprovalGateResponse(...)` before touching Postmark/SendGrid/Twilio/Resend/Dropbox Sign.
- Content-hash caveat: for `esign-create-request`, server-side default `subject`/`message` are applied *after* the gate, so when the caller omits those fields the canonical content hash does not bind the exact subject/message Dropbox Sign receives (the defaults derive from the already-hashed `document_name`). Tracked as a follow-up.

Human-send wrappers that keep legitimate sends working:

- `src/hooks/useSMSMessages.ts`
- `src/components/communications/SMSComposerModal.tsx`
- `src/hooks/useCOIGeneration.ts`
- `src/hooks/useSignature.ts`
- `src/components/signatures/SignatureRequestModal.tsx`

### 3. AI result direct-send paths are removed/rerouted

Critical files:

- `src/components/ai/AIResultsActionBar.tsx`
- `src/floor/legacyActionGate.ts`
- `src/fence/noAIDirectSend.test.ts`

Expected behavior:

- `AIResultsActionBar` no longer has the legacy SMS dialog/state/handler.
- AI result Share menu displays SMS and Email as gated by Floor.
- Known AI UI surfaces do not call `send-sms`, `email-send`, or `createClientSendApproval(...)` directly.
- Human SMS/COI/e-sign client-effect surfaces covered by this branch carry `client_send_approval` where they call the gated functions.

### 4. PII is redacted at in-scope model boundaries

Critical files:

- `supabase/functions/_shared/floorSafety.ts`
- `supabase/functions/_shared/ai-client.ts`
- `supabase/functions/_shared/modelBoundaryFetch.ts`
- `src/fence/modelBoundaryRedaction.test.ts`

Expected behavior:

- `redactPII(...)` covers the tested standard/labeled forms of SSN, DOB, DLN, account number, VIN, full policy number, signed storage URLs, storage paths, and raw UUIDs. It should be read as label/format-dependent coverage, not full anonymization: DLN/account/policy patterns are strongest with labels, storage paths are limited to known prefixes, and compact 9-digit SSN matching may false-positive.
- Shared chat/model calls redact before Gemini/OpenAI/Anthropic.
- Shared embedding calls redact before OpenAI embeddings.
- Direct provider `fetch(...)` calls outside shared chokepoints route through `modelBoundaryFetch(...)`.
- Anthropic SDK-style calls route through `anthropicBoundaryCreate(...)`.
- `ai-document-analysis` no longer interpolates raw document names into the primary `documentPaths` model context; residual filename paths still exist in context-metadata handling and OCR-failure placeholders and are follow-on disclosure items.
- `execute-ai-module` redacts system prompts and document/input text before Azure OpenAI.

Model-boundary function files changed by the fence include direct OpenAI/Anthropic/Gemini/Azure callers under `supabase/functions/*` plus `src/services/comparison/PolicySnapshotExtractor.ts`.

Known exclusions from this static model-boundary scan are disclosed in §5: optional `hermes-chat`/`prism-api` external proxies and OCR-provider calls such as Google Cloud Vision.

### 5. Scope boundaries and follow-on exceptions

This fence is a default-deny safety layer for the Sprint 0–4 scope, not a production launch approval. Verify these boundaries before any deployment:

- The server-side one-time exact-content approval gate is installed on `email-send`, `send-sms`, `send-coi-email`, and `esign-create-request`. Other direct provider/client-effect paths named in the inventory (`canopy-servicing`, `marketing-send-governor`, `reputation-manager`, `renewal-rate-watch`, `portal-send-invitation`, and similar carrier/scheduled/marketing workflows) remain classified for follow-on gating or explicit exception before they are used for client-facing sends.
- `canopy-servicing` is now explicitly inventoried as a carrier-mediated client-effect path: `request_id_card` and `request_declarations` can POST a payload with `delivery_method: email` and an email address to the Canopy servicing API. It is not covered by this branch's approval gate and is not production-approved by this fence without a gate or documented exception.
- Optional external model/runtime proxies are now explicitly inventoried: `hermes-chat` can forward `body.message` to an external Hermes runtime when `FLOOR_COCKPIT_ENABLED` plus `HERMES_API_URL`/key are set and `FLOOR_HERMES_SYNTHETIC` is not true; `prism-api` can forward a raw `prompt` to `PRISM_SERVICE_URL`. Both need redaction or documented feature-flagged exceptions before any repo-wide model-boundary completeness claim.
- Internal automation callers such as `automation-processor` and `process-quote-followups` do not mint `client_send_approval`. Current fail-closed behavior is path-specific: `automation-processor` email invokes `email-send` and should fail auth/gate before provider send, while its SMS path invokes `twilio-sms` (an inbound/webhook-style function), not `send-sms`, and should fail its own webhook/auth controls rather than a `client_send_approval_required` error. `process-quote-followups` invokes `email-send` and `send-sms` without approval and should fail auth/gate before provider/Twilio. Their workflow UX/queue behavior still needs follow-on cleanup before those automations are enabled.
- `weekly-ceo-digest` is treated as an internal executive digest exception, not a client/carrier send surface. It appears in the staged deploy loop only as a model-boundary/redaction bundle, remains behind its existing cron-secret/idempotency controls, and was not deployed by this run.
- Redaction coverage is for the tested regulated identifiers and storage refs listed above. It should not be described as full anonymization of every possible PII category or every unlabeled format: names, business names, street addresses, FEIN/EIN, license plates, unlabeled DLNs/account/policy numbers, and other document-specific identifiers require future expansion if the live rollout needs that guarantee.
- Azure Document Intelligence/Form Recognizer and Google Cloud Vision OCR are separate document-processing provider boundaries. Observed Vision callers include `ocr-document`, `parse-document-ocr`, `ai-document-analysis/pdf-extractor`, and `ai-document-intelligence`. This fence redacts OCR/document text before LLM/model calls; it does not redact raw document bytes, base64 document content, or signed document URLs before an OCR provider receives them. Live-document use therefore still requires the approved OCR/provider posture or a separate disable/exception gate.
- `email-send` has no human approval-minting UI wrapper in this branch. That is intentional for the current scope: SMS, COI, and e-sign human workflows are preserved; generic email send remains fail-closed/no-working-human-path until a scoped human email composer flow is designed and wrapped.
- `esign-create-request` consumes approval before Dropbox Sign, but server-defaulted fields injected after the gate (for example default `subject`, and absent `message`) are not themselves content-hash inputs. Treat that as a low-severity follow-on if defaults become human-meaningful external content beyond the already-hashed document/signature request fields.
- Test coverage is representative, not exhaustive: Supabase-backed replay/wrong-human checks are concentrated on `email-send`, expired approval coverage is on `send-sms`, AI-direct-send scans the named AI surfaces and `functions.invoke('send-sms'|'email-send')`, and provider-boundary static scans cover the configured OpenAI/Anthropic/Gemini/Azure patterns rather than every optional proxy/OCR provider.
- Provider error-body logging remains a follow-on hardening item where providers might echo prompt/document snippets in error responses. Do not treat this branch as log-sink redaction completion.

## Verification commands run

Fresh verifier after final code/docs changes:

```bash
npm run test:run
# PASS: 26 test files, 338 tests

npm run build
# PASS: Vite build completed; 5016 modules transformed

npm run lint -- --quiet
# PASS: eslint exited 0

npx tsc -p tsconfig.json --noEmit --pretty false
# PASS: exited 0

git diff --check
# PASS: exited 0
```

Targeted safety proof:

```bash
npm run test:run -- \
  src/fence/sendApprovalGate.test.ts \
  src/fence/noAIDirectSend.test.ts \
  src/fence/modelBoundaryRedaction.test.ts \
  src/floor/legacySendFence.test.ts \
  src/floor/floorSafety.test.ts
# PASS: 5 test files, 39 tests
```

## Acceptance proof map

| Requirement | Proof |
| --- | --- |
| Inventory + disposition table committed | `docs/fence-ai-send-inventory.md`; Sprint 0 commit plus post-review disclosure additions |
| No-approval client send rejected | `src/fence/sendApprovalGate.test.ts`, no-approval cases for `email-send`, `send-sms`, `send-coi-email`, `esign-create-request` |
| Legitimate human-approved send succeeds | `src/fence/sendApprovalGate.test.ts`, named-human approval passes once |
| Replay rejected | `src/fence/sendApprovalGate.test.ts`, in-memory and Supabase-backed replay cases |
| Content mismatch rejected | `src/fence/sendApprovalGate.test.ts`, tampered payload cases |
| Approval is server-side and one-time | `client_send_approvals` migration + `createSupabaseClientSendApprovalStore(...)` final update predicates |
| Human sends preserved | wrappers in SMS, COI, and e-sign UI/hook flows mint `client-send-approval-create` before send/client effect; generic `email-send` intentionally has no human wrapper in this branch |
| AI result cannot direct-send | `src/fence/noAIDirectSend.test.ts`; `AIResultsActionBar` only shows gated copy |
| PII redacted before model calls | `src/fence/modelBoundaryRedaction.test.ts` fixture and static OpenAI/Anthropic/Gemini/Azure provider-boundary scan |
| Direct model provider bypasses closed | `modelBoundaryFetch(...)`, `anthropicBoundaryCreate(...)`, static test over `supabase/functions` and `src/services` for configured provider patterns; optional Hermes/Prism/Vision boundaries are disclosed follow-ons |
| Build/lint/tests green | final verifier commands above |
| Deploy staged, not executed | deploy commands below; intentionally not run in this session |

## Before / after summary

| Hole | Before | After |
| --- | --- | --- |
| `email-send` arbitrary client email | Authenticated caller could provide `{ to, subject, body }`; no approval token/content hash/replay check | Requires server-minted named-human `client_send_approval`; one-time exact-content hash consumed before provider send |
| `send-sms` arbitrary client SMS | Authenticated caller could send to a client phone; AI-results panel historically had a path to call it | Requires server-minted named-human approval; replay/content mismatch/wrong human rejected before Twilio |
| `send-coi-email` COI client email | Authenticated caller could trigger Resend COI email with caller-provided URL/content fields | Requires same one-time approval gate; COI UI flow mints marker before send |
| `esign-create-request` Dropbox Sign request | Authenticated caller could create external signature request without a consumed approval marker | Requires same one-time approval gate; e-sign UI/hook flows mint marker before Dropbox Sign |
| AI result direct SMS/email | AI results action menu exposed legacy send affordances | Legacy SMS dialog/state/handler removed; SMS/Email shown as Floor-gated only |
| Shared AI client model calls | Shared chat/embedding helpers could send raw text to providers | Chat messages and embedding inputs pass through `redactPII(...)` before provider calls |
| Direct model provider fetches | Many Edge functions called OpenAI/Anthropic/Gemini/Azure directly | In-scope direct provider calls route through `modelBoundaryFetch(...)` or `anthropicBoundaryCreate(...)`; optional Hermes/Prism proxies and OCR providers remain disclosed follow-ons |
| Raw PII categories | Existing redactor covered only limited fields in one function | Shared redactor covers tested standard/labeled SSN/DOB/DLN/account/VIN/full policy number/signed URLs/storage paths/raw UUIDs; it is not full anonymization |

## Post-review sign-off and disclosure additions

Reviewer verdict dated 2026-06-30: **ACCEPT with required disclosure additions**. Independent review reproduced the published build/test/deploy-not-run evidence and accepted the four-function approval gate plus AI-results direct-send removal for the declared Sprint 0–4 scope.

Required disclosure fixes now reflected in this handoff/inventory:

- `canopy-servicing` is listed as an ungated carrier-mediated client-effect follow-on.
- `hermes-chat` and `prism-api` are listed as optional external proxy/model-boundary follow-ons.
- Google Cloud Vision OCR callers are listed alongside Azure OCR as raw-document provider boundaries outside the LLM redaction guarantee.
- `redactPII(...)`, `ai-document-analysis`, automation fail-closed behavior, test coverage, `email-send` human-path intent, e-sign default content binding, and `weekly-ceo-digest` deploy-loop wording are all scoped precisely.

These additions do not change deployable code and do not reopen the specific holes closed by the branch. They prevent this handoff from being read as complete repo-wide client-send/model-boundary coverage.

## Prod deploy commands staged but not run

Brian approval is required before running any of the following. These commands intentionally were **not executed** in this run.

```bash
# DO NOT RUN WITHOUT BRIAN APPROVAL
supabase link --project-ref lrqajzwcmdwahnjyidgv
supabase db push

# Client-send approval creation and direct client-send/client-effect gates
supabase functions deploy client-send-approval-create --project-ref lrqajzwcmdwahnjyidgv
supabase functions deploy email-send --project-ref lrqajzwcmdwahnjyidgv
supabase functions deploy send-sms --project-ref lrqajzwcmdwahnjyidgv
supabase functions deploy send-coi-email --project-ref lrqajzwcmdwahnjyidgv
supabase functions deploy esign-create-request --project-ref lrqajzwcmdwahnjyidgv

# Model-boundary/internal digest bundles; `weekly-ceo-digest` remains an internal exception, not client-send approval coverage
for fn in \
  acord-document-extractor-v2 \
  acord-document-extractor \
  acord-extraction-pipeline \
  ai-document-analysis-azure \
  ai-document-analysis-simple \
  ai-document-analysis \
  ai-document-intelligence \
  ai-task-generator \
  analyze-coverage-gaps \
  analyze-insurance-document \
  analyze-workspace \
  azure-diagnostics \
  client-context-api \
  compare-insurance-options \
  comparison-analyze \
  comparison-extract \
  context-indexer \
  document-qa-azure \
  execute-ai-module \
  explore-qa \
  extract-bap-policy \
  extract-cgl-policy \
  extract-crime-policy \
  extract-cyber-policy \
  extract-eo-policy \
  extract-inland-marine-policy \
  extract-property-policy \
  extract-umbrella-policy \
  extract-wc-policy \
  generate-coi-data \
  generate-insurance-quote-doc \
  index-document-chunks \
  lewi_analyze \
  module-builder-chat \
  parse-document-ocr \
  process-document-batch \
  process-explore-document \
  renewal-rate-watch \
  weekly-ceo-digest
  do supabase functions deploy "$fn" --project-ref lrqajzwcmdwahnjyidgv
 done
```

## Known non-fence worktree state

The repo had unrelated dirty/untracked work before and after this fence run, including CRM/auth/UI files, agent docs, design assets, and a `hermes-proxy` function. The fence commits intentionally stage only the safety-fence files and do not claim or alter those unrelated changes.

## Reviewer checklist

1. Confirm branch is `feat/fence-ungated-ai-send-paths`.
2. Confirm the fence commits listed above plus final Sprint 4 commit and docs-only clarification `82c3651` are present.
3. Run the verification commands in this handoff.
4. Inspect `src/fence/sendApprovalGate.test.ts` for reject/accept-once/replay/content-mismatch coverage.
5. Inspect `src/fence/noAIDirectSend.test.ts` for AI direct-send absence and allowed human send surfaces.
6. Inspect `src/fence/modelBoundaryRedaction.test.ts` for PII fixture redaction, nested provider body redaction, direct-provider bypass scan, and critical function checks.
7. Review the post-review disclosure additions for Canopy servicing, optional Hermes/Prism proxies, Google Vision OCR, label-dependent redaction, representative test coverage, and email-send human-path intent.
8. Confirm no Supabase deploy command was run as part of this feature-branch run.
