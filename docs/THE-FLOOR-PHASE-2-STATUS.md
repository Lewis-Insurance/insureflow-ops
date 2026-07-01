# The Floor: Phase 2 Status

**Phase:** 2 — The Send Seam (internal-recipient locked)  
**Goal:** R7 send path end-to-end with hard internal allowlist; no real client sends until G4.  
**Dev branch:** `klnygbbmognbslgobmzc`  
**Last updated:** 2026-07-01 (Slice 1 foundation)

---

## Definition of Done (roadmap)

- [x] `FLOOR_INTERNAL_SEND_ALLOWLIST` guard in `stageClientSend`
- [x] Approve on Tier-3 package → `floor_client_send_approvals` held (30s undo window)
- [x] `floor-release-held-sends` sweeper (CRON; gated `FLOOR_CLIENT_SEND_ENABLED`)
- [ ] Fence `floor_action:` mint + service-role consume path on `send-coi-email`
- [ ] Tier-3 COI inbound play produces real package with internal test recipient
- [ ] First internal test send verified on dev (Brian sign-off)

---

## Slice 1 — Allowlist + stage on approve (shipped in code)

**Modules**
- `src/floor/spine/internalSendAllowlist.ts` — parse allowlist, stub vs tier-3 detection
- `src/floor/spine/approveClientSendStaging.ts` — `maybeStageClientSendOnApprove`
- Edge mirror: `supabase/functions/_shared/floor/*`

**Edge functions**
- `floor-action` — on `feedback.approve`, stages held send when `send_spec.recipient !== [INTERNAL_ONLY]`
- `floor-release-held-sends` — releases expired holds when `FLOOR_CLIENT_SEND_ENABLED=true`

**Safety defaults**
- Phase 1 play cards still use `[INTERNAL_ONLY]` → approve does **not** stage a send
- Empty allowlist blocks all tier-3 sends
- `FLOOR_CLIENT_SEND_ENABLED` defaults off → sweeper no-ops

**Dev secrets (via `scripts/g0-dev-enable-floor-flags.sh`)**
```
FLOOR_INTERNAL_SEND_ALLOWLIST=brian@lewisinsurance.ai
# FLOOR_CLIENT_SEND_ENABLED=true   # only after Fence mint path
```

**Tests:** spine allowlist + staging tests in `src/__tests__/floor/spine.test.ts`

---

## Next slice (Phase 2)

1. Mint `floor_action:` token in `releaseHeldClientSend` + insert Fence `client_send_approvals` row
2. Service-role consume path in `clientSendApprovalGate` (no live user JWT)
3. COI Tier-3 play on inbound allowlisted sender → internal test recipient only
4. Dev soak: approve → 30s hold → release → email to allowlist address only

---

## Hard stops (unchanged)

1. No client/carrier send without named human click  
2. No raw PII on chat/log/model  
3. No irreversible prod actions
