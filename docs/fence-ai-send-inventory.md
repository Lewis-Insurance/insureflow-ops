# Fence AI/send paths — Sprint 0 inventory and disposition

Scope: InsureFlow App repo (`/Users/rocky/insureflow-ops`) on feature branch `feat/fence-ungated-ai-send-paths`. No production deploys or production writes in this run.

Starting verifier before behavior changes:

- `npm run test:run` — passed: 23 files, 307 tests.
- `npm run build` — passed.

## Client-send / client-effect paths

| Path | Caller(s) / trigger | Classification | Current risk | Disposition |
| --- | --- | --- | --- | --- |
| `supabase/functions/email-send/index.ts` | provider send via Postmark/SendGrid; ticket replies and any direct invoker | direct client email send; can be legitimate human-initiated or programmatic | send boundary must verify named-human approval; current prior fence is syntactic only, not one-time/server-consumed | **wrap-with-approval** — server-verified one-time approval reference tied to exact content |
| `supabase/functions/send-sms/index.ts` | `src/components/communications/SMSComposerModal.tsx`, `src/hooks/useSMSMessages.ts`; Twilio send | direct client SMS send; legitimate human composer plus possible programmatic callers | send boundary must verify named-human approval; current prior fence is syntactic only, not one-time/server-consumed | **wrap-with-approval** — server-verified one-time approval reference tied to exact content |
| `src/components/ai/AIResultsActionBar.tsx` | AI analysis result action menu | AI/programmatic content could historically call `send-sms` directly | live AI-output-to-client path if re-enabled | **disable/gate** — no direct `send-sms`; route only through review/approval |
| `src/hooks/useCOIGeneration.ts` → `send-coi-email` / `supabase/functions/send-coi-email/index.ts` | COI generation/send flow | client email send with attachment/artifact | may be human workflow but still client-facing | **wrap-with-approval** before prod deploy; include in send-gate contract tests/static fence |
| `src/hooks/useSignature.ts`, `src/components/signatures/SignatureRequestModal.tsx` → `esign-create-request` | e-sign request flow | client/third-party e-sign request | irreversible external request | **gate** with named-human approval before production deploy |
| `src/components/customers/InviteToPortalButton.tsx` → `portal-send-invitation` | staff portal invitation | legitimate human-initiated client email | external client notification | **wrap-with-approval** in follow-on if this run touches invitations; not AI-generated |
| `automation-processor` → `email-send`, `twilio-sms` | automation workflow | programmatic send | highest-risk non-human send | **gate** — cannot invoke send without approval reference |
| `twilio-sms`, `twilio-voice`, `phone-verification`, Twilio webhooks | telephony infrastructure / verification | mixed infrastructure, inbound, or OTP-like flows | not AI-result content; verification paths should not be broken | **keep**, except outbound client-message sends must use send-gate |
| `renewal-rate-watch`, `marketing-send-governor`, `weekly-ceo-digest`, `reputation-manager`, marketing processors | scheduled/marketing/internal sends | programmatic outbound or internal digest | broad blast radius; some are internal/marketing-governed | **gate or keep by class** — client-facing programmatic sends require approval; internal CEO digest not client send |

## AI/model paths that can ship text to a model

| Path | Caller(s) / trigger | Text source | Current risk | Disposition |
| --- | --- | --- | --- | --- |
| `execute-ai-module` | `src/integrations/supabase/hooks/useAIModules.ts` | document text, text inputs, module fields | document/record text to Azure/OpenAI | **redact at model boundary** |
| `ai-brain-rag` | `src/hooks/useAIBrain.ts` | knowledge/context chunks | record/context text to model | **redact at model boundary** |
| `ai-document-analysis`, `ai-document-analysis-simple`, `ai-document-analysis-azure` | document analysis buttons, dashboards, quote assistant, workers | extracted document text/OCR | raw doc PII to model | **redact at model boundary** |
| `ai-assistant-chat`, `document-qa-azure`, `explore-qa` | chat/document Q&A | user questions + document/context excerpts | raw doc or record excerpts to model | **redact at model boundary** |
| `process-document-tasks` | document task extraction | document text | already has local `redactPII` | **keep + centralize shared redaction** |
| `context-indexer`, `index-document-chunks` | embedding/indexing | document chunks | embeddings are model boundary too | **redact at model boundary** |
| extraction functions (`extract-*`, `acord-*`, `comparison-*`, `analyze-*`, `compare-insurance-options`, `generate-coi-data`, `generate-insurance-quote-doc`) | policy/document analysis flows | OCR/document or quote text | raw PII possible | **redact at shared model/client boundary**; prioritized tests on named critical functions in this run |
| `_shared/ai-client.ts` | shared OpenAI/Anthropic/embedding client | messages/prompts | central boundary | **wrap** shared client with redaction for messages/inputs |

## Sprint 0 disposition summary

- **Keep:** infrastructure-only inbound/webhook/verification paths where no AI/programmatic client content is sent (`phone-verification`, inbound Twilio/email webhooks), provided they do not call direct client send functions.
- **Wrap-with-approval:** `email-send`, `send-sms`, and other direct client-send functions where legitimate staff sends must keep working.
- **Gate:** programmatic/automation/client-effect paths (`automation-processor`, `send-coi-email`, `esign-create-request`, marketing/proactive sends) before any production deploy.
- **Disable/reroute:** AI result one-click client sends (`AIResultsActionBar` SMS and any AI-compose direct-send path) so AI output can only become draft/review content.
- **Redact:** every model boundary that receives document/record/free text, using a shared PII redactor before the provider call.

## [SPRINT 0 COMPLETE]

The inventory/disposition table is committed before behavior changes. Starting point is green and no production deploy/write/send occurred.

## [SPRINT 1 COMPLETE]

Server-side send gate is implemented for `email-send` and `send-sms`:

- `supabase/functions/_shared/clientSendApprovalGate.ts` computes a canonical exact-content hash for each send surface and consumes a one-time approval ref before any provider/carrier side effect.
- `supabase/functions/email-send/index.ts` now awaits `clientSendApprovalGateResponse(...)` before Postmark/SendGrid.
- `supabase/functions/send-sms/index.ts` now awaits `clientSendApprovalGateResponse(...)` before rate-limit/Twilio.
- `supabase/functions/client-send-approval-create/index.ts` mints approval refs for authenticated human UI flows without sending anything.
- `supabase/migrations/20260630040000_client_send_approvals.sql` stages the `public.client_send_approvals` table: opaque ref, surface, exact content hash, named approving user, expiry, one-time `consumed_at`.
- `src/lib/clientSendApproval.ts`, `src/hooks/useSMSMessages.ts`, and `src/components/communications/SMSComposerModal.tsx` wrap legitimate human SMS sends with the server-minted approval marker instead of killing the composer.

Proof:

- No-approval payloads are rejected with `client_send_approval_required`.
- A named-human approved send passes once.
- Replay of the same approval ref is rejected with `client_send_approval_replayed`.
- Tampered content is rejected with `client_send_approval_content_mismatch`.
- The approval creation function stores only the content hash and approval metadata; it has no provider/carrier send call.

No production deploy/write/send occurred. The migration and edge functions are staged on the feature branch for Brian-approved deployment only.

## [SPRINT 2 COMPLETE]

AI-result client-send shortcuts are removed/gated:

- `src/components/ai/AIResultsActionBar.tsx` no longer contains the legacy SMS dialog, SMS phone/message state, or `handleSendSMS` path.
- The Share menu presents both SMS and Email as explicitly “gated by Floor”; no AI-result UI surface invokes `send-sms`, `email-send`, or `createClientSendApproval(...)` directly.
- `src/floor/legacyActionGate.ts` centralizes the disabled client-send copy for AI results.
- `src/fence/noAIDirectSend.test.ts` statically proves known AI surfaces (`AIResultsActionBar`, `AICustomerActions`, `AIQuoteAssistant`, `useAIEmailComposer`, `useEmailComposer`) cannot call client-send functions and that only human SMS composer surfaces call `send-sms`, with `client_send_approval` attached.

Proof:

- Targeted tests: `npm run test:run -- src/fence/noAIDirectSend.test.ts src/floor/legacySendFence.test.ts` passed.
- TypeScript check for the sprint files passed via `npx tsc -p tsconfig.json --noEmit --pretty false`.
- Changed-file eslint for Sprint 2 files passed.

No production deploy/write/send occurred.
