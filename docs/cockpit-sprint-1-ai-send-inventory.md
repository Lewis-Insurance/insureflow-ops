# Cockpit Sprint 1 — legacy AI/send inventory

Scope: synthetic/internal-only prototype track. This note inventories AI/document/send surfaces found in the InsureFlow app repo and records the Sprint 1 disposition. The cockpit itself must not use any legacy ungated path.

## Client-facing send paths

| Path | Risk | Sprint 1 disposition |
| --- | --- | --- |
| `supabase/functions/email-send/index.ts` | Direct external email send through Postmark/SendGrid. | **Wrapped.** Server-side Floor approval gate now rejects requests missing opaque `floor_approval_token`, `floor_package_ref`, `floor_rendered_hash`, and `floor_approved_by_human_ref` before provider fetch. |
| `supabase/functions/send-sms/index.ts` | Direct external SMS send through Twilio. | **Wrapped.** Server-side Floor approval gate now rejects requests missing the same Floor approval metadata before rate-limit/carrier send. |
| `src/components/ai/AIResultsActionBar.tsx` | Legacy AI-result → SMS shortcut. | **Retired/gated.** Dropdown item is disabled and the send handler no longer invokes `send-sms`; copy points to Floor exact-artifact approval requirement. |
| `src/components/communications/SMSComposerModal.tsx` | Manual SMS composer invokes `send-sms`. | **Server-wrapped by function fence.** No-token calls now fail server-side; cockpit does not use this path. |
| `src/hooks/useEmailComposer.ts`, `src/hooks/useAIEmailComposer.ts`, `src/components/communications/EmailComposerModal.tsx` | Email composition/sending surfaces. | **Server-wrapped by `email-send` fence where provider send is used; out-of-cockpit otherwise.** |
| `supabase/functions/send-coi-email/index.ts`, `portal-send-invitation`, marketing send/automation functions | Other outbound email-like paths. | **Out of cockpit scope.** Not used by the Agent Cockpit prototype; future production rollout should route every client/carrier send through the same Floor approval token contract. |
| `twilio-*` webhooks/functions | Voice/SMS infrastructure. | **Out of cockpit scope.** No cockpit use; no changes. |

## AI/model paths

| Path | Risk | Sprint 1 disposition |
| --- | --- | --- |
| `supabase/functions/execute-ai-module/index.ts` | Pulls document text and sends a prompt to Azure OpenAI. | **Wrapped.** Document text, additional inputs, and text input are passed through shared `redactPII` before model prompt construction; prompt omits raw document filenames. |
| `supabase/functions/process-document-tasks/index.ts` | Document task extraction. | **Already wrapped.** Existing implementation redacts PII before processing. |
| `ai-document-analysis*`, `document-qa-azure`, `explore-qa`, `comparison-*`, `analyze-*`, `renewal-rate-watch`, `module-builder-chat`, `ai-task-generator`, `lewi_analyze`, `_shared/ai-client.ts` | Legacy AI/model analysis surfaces. | **Inventory only / out of cockpit path.** These remain legacy surfaces for existing app features; they are not called by the cockpit. Cockpit bridge must use `hermes-proxy` only. Production hardening should apply the shared redaction/approval contracts before any client-facing automation uses them. |

## Document/OCR paths

| Path | Risk | Sprint 1 disposition |
| --- | --- | --- |
| `parse-document-ocr`, `ocr-document`, `parse-pdf-knowledge`, `process-document-*`, `ai-document-intelligence`, `get-document-url`, `upload-explore-document`, `process-explore-document` | Live document text/URLs/OCR. | **Out of prototype run.** This run reads no live documents and does no live OCR. Sprint 2+ proxy accepts references only. |
| `context-indexer` | Indexes extracted document text/chunks. | **Out of cockpit path.** Not used by cockpit prototype. |

## Shared Sprint 1 fences

- `supabase/functions/_shared/floorApprovalGate.ts` centralizes the client-effect send gate.
- `supabase/functions/_shared/floorSafety.ts` centralizes redaction and boundary unsafe-payload detection for this prototype track.
- `src/floor/legacySendFence.test.ts` proves:
  - `email-send` rejects no-token payloads;
  - `send-sms` rejects no-token payloads;
  - only opaque approval metadata passes the future-token contract;
  - AI-result → SMS remains disabled;
  - `execute-ai-module` imports and applies `redactPII` before prompt construction.

## Disposition rule for the cockpit

The Agent Cockpit does not call any legacy AI/send path. Browser → Floor work goes through `hermes-proxy` only, by references only, and any future client-facing effect must redeem a Floor action token and produce the Floor's single audit event.
