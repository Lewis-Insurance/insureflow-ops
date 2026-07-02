# ADR 004: Consolidate cockpit bridge on `hermes-chat`

**Status:** Accepted  
**Date:** July 2026  
**Deciders:** Brian Lewis, Floor architecture review

## Context

The CRM cockpit needs a bridge to Hermes for chat and DecisionPackage preview. Two candidates exist:

1. **`hermes-chat`** (`supabase/functions/hermes-chat/index.ts`). Deployable. Listed in `supabase/config.toml`. Gated by `FLOOR_COCKPIT_ENABLED`. Has synthetic-to-live switch via `HERMES_API_URL`. Has R9 PII guard (`isUnsafeMessage`). The cockpit already calls it via `src/floor/floorChatClient.ts`.

2. **`hermes-proxy`**. Contract-only (`supabase/functions/hermes-proxy/contract.ts`). No `index.ts`. Not in `config.toml`. Good types, no runtime.

Standing up `hermes-proxy` would recreate what `hermes-chat` already does and create a second thing to keep in sync.

## Decision

1. **Consolidate on `hermes-chat`.** It is the sole cockpit bridge for chat and package preview.

2. **Fold types.** Move useful types from `hermes-proxy/contract.ts` into a shared module consumed by `hermes-chat` and the frontend.

3. **Retire the empty shell.** Remove the `hermes-proxy` folder after types are migrated. Do not build `hermes-proxy` as a second bridge.

4. **Close FU-2 before live flip.** Land `redactPII` pre-model on the bridge before flipping `hermes-chat` to live Hermes via `HERMES_API_URL` in Phase 1.

## Consequences

**Positive.** One bridge to deploy, gate, and audit. Fewer sync failures. Phase 0 can focus on flags, redaction, and the action endpoint instead of standing up duplicate infrastructure.

**Negative.** Any code importing from `hermes-proxy/contract.ts` must be repointed during Phase 0.

**Neutral.** Streaming, JWT auth, and the synthetic default stub stay in `hermes-chat`. Behavior changes are additive, not a rewrite.

**Follow-up.** Phase 0 adds Floor flags to `.env.example`. Phase 1 flips to live Hermes on dev only after FU-2 redaction is proven.
