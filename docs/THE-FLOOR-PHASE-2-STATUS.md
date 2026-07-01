# The Floor: Phase 2 Status

**Phase:** 2 — The Send Seam (internal-recipient locked)  
**Goal:** R7 send path end-to-end with hard internal allowlist; no real client sends until G4.  
**Dev branch:** `klnygbbmognbslgobmzc`  
**Last updated:** 2026-07-01 — **Phase 2 signed off (Brian)** → [`THE-FLOOR-PHASE-2-SIGNOFF.md`](./THE-FLOOR-PHASE-2-SIGNOFF.md)

**Status:** ✅ **COMPLETE (dev)** — ready for internal test send soak with `FLOOR_CLIENT_SEND_ENABLED=true` on dev only.

---

## Definition of Done (roadmap)

- [x] `FLOOR_INTERNAL_SEND_ALLOWLIST` guard in `stageClientSend`
- [x] Approve on Tier-3 package → `floor_client_send_approvals` held (30s undo window)
- [x] `floor-release-held-sends` sweeper (CRON; gated `FLOOR_CLIENT_SEND_ENABLED`)
- [x] `releaseHeldClientSend` mints `floor_action:` → Fence `client_send_approvals`
- [x] Fence service-release consume path (no live user JWT required for `floor_action:`)
- [x] `send-coi-email` accepts cron-authenticated Floor release (`X-Cron-Secret` + marker)
- [x] Tier-3 COI inbound play produces package with internal test recipient
- [x] Brian sign-off — Phase 2 internal test send path (dev only) — **2026-07-01**

---

## Brian sign-off record

| Field | Value |
|---|---|
| Document | [`THE-FLOOR-PHASE-2-SIGNOFF.md`](./THE-FLOOR-PHASE-2-SIGNOFF.md) |
| Approver | Brian Lewis (BL) |
| Date | 2026-07-01 |
| Scope | Dev internal allowlist sends only |
| Not approved | Prod sends, G4 live client allowlist flip |

---

## Post-sign-off: dev soak (ops)

```bash
./scripts/g0-dev-enable-floor-flags.sh
supabase secrets set --project-ref klnygbbmognbslgobmzc FLOOR_CLIENT_SEND_ENABLED=true
supabase functions deploy email-inbound-lite floor-action floor-release-held-sends send-coi-email --project-ref klnygbbmognbslgobmzc
```

**Soak sequence**
1. POST allowlisted COI-shaped inbound → response `tier3: true`
2. Deliver card / Approve in Slack or cockpit
3. Wait 30s (undo window)
4. `curl -X POST "https://klnygbbmognbslgobmzc.supabase.co/functions/v1/floor-release-held-sends" -H "X-Cron-Secret: $CRON_SECRET" -H "Content-Type: application/json" -d '{}'`
5. Confirm email received at allowlist address only

### Dev soak result — 2026-07-01

| Step | Result |
|---|---|
| COI inbound (`ray@plumbingconcepts.net`) | ✅ `tier3: true`, recipient `brian@lewisinsurance.ai` |
| Approve (`floor-action`) | ✅ `sendStaging.status=held` |
| Held row in DB | ✅ after `updateFloorSendApproval` fix |
| Release sweeper | ✅ processed 1 |
| Fence mint | ✅ `floor_action:65fd507b…` inserted + **consumed** |
| Resend delivery | ⚠️ `failed_delivery` — dev `RESEND_API_KEY` must be restored in Supabase secrets |

**Bug fixed during soak:** `floor-action` now persists `held` + `hold_until` via `updateFloorSendApproval` (was in-memory only).

---

## Slices shipped

| Slice | Commit | What |
|---|---|---|
| 1 | `62df9d6` | Allowlist + approve→held staging |
| 2 | `51f323a` | Fence `floor_action:` mint path |
| 3 | `d6dcd72` | Tier-3 COI inbound play |

---

## Next: Phase 3 (First Light)

Planning started: [`THE-FLOOR-PHASE-3-PLAN.md`](./THE-FLOOR-PHASE-3-PLAN.md) | tracker: [`THE-FLOOR-PHASE-3-STATUS.md`](./THE-FLOOR-PHASE-3-STATUS.md)

1. Brian decisions: Play 4 owner, send surface, G2 timing
2. Slice 1: ID card asset pipeline on dev
3. G4 sign-off after Play 4 dev soak (allowlist → client)

---

## Hard stops (unchanged)

1. No client/carrier send without named human click  
2. No raw PII on chat/log/model  
3. No irreversible prod actions
