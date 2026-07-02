# The Floor — Phase 2 Sign-Off (Brian)

**One page. Internal test send path approved on dev only.**

**Owner:** Brian "Speedy" Lewis  
**Date:** 2026-07-01  
**Authority:** [`THE-FLOOR-UNIFIED-ROADMAP.md`](./THE-FLOOR-UNIFIED-ROADMAP.md) Phase 2 | [`THE-FLOOR-PHASE-2-STATUS.md`](./THE-FLOOR-PHASE-2-STATUS.md)

---

## What you're signing

Phase 2 sign-off clears **end-to-end internal test sends on the dev branch only**, through the layered R7 path (Floor hold → Fence `floor_action:` → provider). It does **not** authorize real client sends, prod deploys, or allowlist flips to external recipients (that's **G4**, Phase 3).

| | Phase 2 sign-off allows | Phase 2 sign-off does not allow |
|---|---|---|
| **Send target** | `FLOOR_INTERNAL_SEND_ALLOWLIST` addresses only (e.g. `brian@lewisinsurance.ai`) | Any client, carrier, or holder email |
| **Environment** | Dev Supabase `klnygbbmognbslgobmzc` + dev edge deploys | Prod `lrqajzwcmdwahnjyidgv` |
| **Flags** | `FLOOR_CLIENT_SEND_ENABLED=true` on **dev** after soak | Prod send flags or removing the allowlist guard |
| **Human gate** | Named-human Approve still required (Slack / cockpit / `floor-action`) | Autonomous or batch client contact |

**Prod stays dark for Floor sends.** G4 remains the gate for first live client send.

---

## Architecture signed off

1. **Tier-3 COI inbound** — `coi.issue` email intake builds real `send_spec` when allowlist is set (`resolveCoiIntakePackage`).
2. **Approve → held** — `maybeStageClientSendOnApprove` writes `floor_client_send_approvals` (30s undo window).
3. **Release → Fence** — `releaseHeldClientSend` mints `floor_action:` → `client_send_approvals` one-time row.
4. **Provider edge** — `send-coi-email` cron Floor release path (`X-Cron-Secret` + marker); Fence skips live-session check for `floor_action:` refs.
5. **Allowlist chokepoint** — empty or non-listed recipient blocks at `stageClientSend`; no bypass.

Commits on `feat/floor-v1-spine`: `62df9d6`, `51f323a`, `d6dcd72`.

---

## Hard stops reaffirmed

1. No client/carrier send without named human click  
2. No raw PII on chat/log/model  
3. No irreversible prod actions  

---

## What this unlocks (dev team)

1. Set `FLOOR_CLIENT_SEND_ENABLED=true` on dev (Brian-gated; now approved)
2. Deploy: `email-inbound-lite`, `floor-action`, `floor-release-held-sends`, `send-coi-email`
3. Run full soak: COI inbound → Tier-3 package → Approve → hold → release sweeper → email to allowlist only
4. Begin Phase 3 prep (First Light) — **without** G4 allowlist flip

---

## Sign-off

**PHASE 2 APPROVED — INTERNAL TEST SEND PATH (DEV ONLY)** — Brian Lewis, **2026-07-01**

I approve the Phase 2 send seam on dev. Internal allowlist sends only. G4 required before any real client send.

| Item | Record |
|---|---|
| **Allowlist** | Dev: `brian@lewisinsurance.ai` (via `FLOOR_INTERNAL_SEND_ALLOWLIST`) |
| **Dev branch** | `klnygbbmognbslgobmzc` |
| **Prod sends** | Not approved |
| **G4 (live client)** | Not part of this sign-off |

| | |
|---|---|
| **Name** | Brian Lewis |
| **Signature / initials** | BL |
| **Date** | 2026-07-01 |

---

## Quick links

| Doc | Purpose |
|---|---|
| [`THE-FLOOR-PHASE-2-STATUS.md`](./THE-FLOOR-PHASE-2-STATUS.md) | Living Phase 2 tracker |
| [`THE-FLOOR-PHASE-1-STATUS.md`](./THE-FLOOR-PHASE-1-STATUS.md) | Phase 1 complete |
| [`docs/adr/001-floor-r7-layered-approval-gates.md`](./adr/001-floor-r7-layered-approval-gates.md) | Two-gate R7 model |

**Next gate:** G4 — first live client send (allowlist flip per play, ID cards first). **Not part of this sign-off.**
