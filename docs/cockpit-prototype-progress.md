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
