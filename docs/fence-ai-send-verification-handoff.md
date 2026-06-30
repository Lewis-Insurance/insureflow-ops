# InsureFlow AI/send fence verification handoff

Branch: `feat/fence-ungated-ai-send-paths`

Repo: `/Users/rocky/insureflow-ops`

Prepared: 2026-06-30 09:36 EDT

Production deploy status: **staged only; not executed**

## Purpose

This handoff lets a reviewer verify that the InsureFlow safety fence was built to scope before any Brian-approved production deploy. The fence closes the live holes where AI/programmatic content could reach a client without named-human approval, and where raw PII could cross the model boundary.

## Branch commits in scope

```text
2bebade Fence Sprint 0 — inventory AI send paths
f319960 Fence Sprint 1 — server send approval gate
b77d76d Fence Sprint 2 — remove AI direct sends
b6f51e7 Fence Sprint 1 hardening — atomic send approval gate
2d63900 Fence Sprint 3 — redact model boundaries
3b21823 Fence Sprint 3 follow-up — close model SDK gaps
<final Sprint 4 commit> Fence Sprint 4 — verify fence handoff
```

## What to verify

### 1. Inventory and disposition exists

File:

- `docs/fence-ai-send-inventory.md`

Verify it classifies direct client-send/client-effect paths and AI/model paths into keep, wrap-with-approval, gate, disable/reroute, or redact.

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
- Only human composer/client-effect surfaces invoke send functions, and they carry `client_send_approval`.

### 4. PII is redacted at model boundaries

Critical files:

- `supabase/functions/_shared/floorSafety.ts`
- `supabase/functions/_shared/ai-client.ts`
- `supabase/functions/_shared/modelBoundaryFetch.ts`
- `src/fence/modelBoundaryRedaction.test.ts`

Expected behavior:

- `redactPII(...)` covers SSN, DOB, DLN, account number, VIN, full policy number, signed storage URLs, storage paths, and raw UUIDs.
- Shared chat/model calls redact before Gemini/OpenAI/Anthropic.
- Shared embedding calls redact before OpenAI embeddings.
- Direct provider `fetch(...)` calls outside shared chokepoints route through `modelBoundaryFetch(...)`.
- Anthropic SDK-style calls route through `anthropicBoundaryCreate(...)`.
- `ai-document-analysis` no longer interpolates raw document names into model context.
- `execute-ai-module` redacts system prompts and document/input text before Azure OpenAI.

Model-boundary function files changed by the fence include direct OpenAI/Anthropic/Gemini/Azure callers under `supabase/functions/*` plus `src/services/comparison/PolicySnapshotExtractor.ts`.

## Verification commands run

Fresh verifier after final code changes:

```bash
npm run test:run
# PASS: 26 test files, 338 tests

npm run build
# PASS: Vite build completed; 5019 modules transformed

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
| Inventory + disposition table committed | `docs/fence-ai-send-inventory.md`; Sprint 0 commit |
| No-approval client send rejected | `src/fence/sendApprovalGate.test.ts`, no-approval cases for `email-send`, `send-sms`, `send-coi-email`, `esign-create-request` |
| Legitimate human-approved send succeeds | `src/fence/sendApprovalGate.test.ts`, named-human approval passes once |
| Replay rejected | `src/fence/sendApprovalGate.test.ts`, in-memory and Supabase-backed replay cases |
| Content mismatch rejected | `src/fence/sendApprovalGate.test.ts`, tampered payload cases |
| Approval is server-side and one-time | `client_send_approvals` migration + `createSupabaseClientSendApprovalStore(...)` final update predicates |
| Human sends preserved | wrappers in SMS, COI, and e-sign UI/hook flows mint `client-send-approval-create` before send/client effect |
| AI result cannot direct-send | `src/fence/noAIDirectSend.test.ts`; `AIResultsActionBar` only shows gated copy |
| PII redacted before model calls | `src/fence/modelBoundaryRedaction.test.ts` fixture and static provider-boundary scan |
| Direct model provider bypasses closed | `modelBoundaryFetch(...)`, `anthropicBoundaryCreate(...)`, static test over `supabase/functions` and `src/services` |
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
| Direct model provider fetches | Many Edge functions called OpenAI/Anthropic/Gemini/Azure directly | Direct provider calls route through `modelBoundaryFetch(...)` or `anthropicBoundaryCreate(...)` and redaction tests scan for bypasses |
| Raw PII categories | Existing redactor covered only limited fields in one function | Shared redactor covers SSN/DOB/DLN/account/VIN/full policy number/signed URLs/storage paths/raw UUIDs |

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

# Model-boundary redaction bundles
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
2. Confirm the fence commits listed above plus final Sprint 4 commit are present.
3. Run the verification commands in this handoff.
4. Inspect `src/fence/sendApprovalGate.test.ts` for reject/accept-once/replay/content-mismatch coverage.
5. Inspect `src/fence/noAIDirectSend.test.ts` for AI direct-send absence and allowed human send surfaces.
6. Inspect `src/fence/modelBoundaryRedaction.test.ts` for PII fixture redaction, nested provider body redaction, direct-provider bypass scan, and critical function checks.
7. Confirm no Supabase deploy command was run as part of this feature-branch run.
