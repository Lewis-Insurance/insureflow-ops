# Cockpit Prototype Progress

This file records visible sprint-completion blocks for the InsureFlow Agent Cockpit prototype track in the app/cockpit repo.

## Starting line

- InsureFlow App repo confirmed: `/Users/rocky/insureflow-ops`.
- Feature branch: `feat/insureflow-agent-cockpit-prototype`.
- Scope: synthetic/internal-only. No client sends, no prod edge deploys, no prod DB writes, no live document reads.

## [SPRINT 0 COMPLETE] Launch-control lock + spine proof

Shipped:

- Added `src/floor/launchControl.ts` with the cockpit defaulting OFF unless `VITE_LEWIS_FLOOR_COCKPIT_ENABLED=true` or `1`.
- Gated the `Lewis Floor` header entry point behind launch control.
- Gated the drawer and client bridge so disabled mode performs no cockpit effect and does not call the bridge.
- Gated the `hermes-chat` Edge Function behind `FLOOR_COCKPIT_ENABLED=true` or `1`, returning `floor_cockpit_disabled` by default.

Acceptance-verified:

- `npm run test:run` passed in InsureFlow with 22 files / 302 tests.
- `npm run build` passed.
- `npx eslint src/floor src/components/floor src/components/layout/AppLayout.tsx` returned 0 errors; remaining `profile` warnings pre-exist in `AppLayout.tsx`.
- Edge Function syntax was checked with `npx esbuild ... supabase/functions/hermes-chat/index.ts` because `deno` is not installed locally.
- `git diff --check` and `git diff --cached --check` passed.

Next:

- Sprint 1 inventories and fences legacy AI/send paths.

## [SPRINT 1 COMPLETE] Inventory + fence legacy ungated AI/send paths

Shipped:

- Added `docs/cockpit-sprint-1-ai-send-inventory.md` listing legacy AI/document/send paths and Sprint 1 dispositions.
- Added `supabase/functions/_shared/floorApprovalGate.ts` and wrapped `email-send` / `send-sms` with a server-side Floor approval-token requirement before provider/carrier effects.
- Disabled the legacy `AIResultsActionBar` AI-result → SMS shortcut; it no longer invokes `send-sms`.
- Added shared `redactPII` safety in `supabase/functions/_shared/floorSafety.ts` and applied it to `execute-ai-module` before model prompt construction.
- Added `src/floor/legacySendFence.test.ts` proving the no-token send rejection, AI→SMS gate, and redaction guard.

Acceptance-verified:

- `email-send` and `send-sms` no-token payloads reject with `floor_approval_required` in tests.
- A static guard confirms `AIResultsActionBar.tsx` no longer calls `functions.invoke('send-sms')`.
- `execute-ai-module` imports and applies `redactPII(text.substring(0, 80000))` before model prompt construction and omits raw document filenames from the prompt.
- Edge-function syntax was checked with esbuild for `email-send`, `send-sms`, and `execute-ai-module`.
- Prototype remains synthetic/internal-only: no live OCR, no prod deploy, no prod DB write, no client send.

Next:

- Sprint 2 replaces the temporary `hermes-chat` bridge with `hermes-proxy` and enforces references-only browser → proxy → Floor boundaries.
