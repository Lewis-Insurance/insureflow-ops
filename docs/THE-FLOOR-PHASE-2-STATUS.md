# The Floor: Phase 2 Status

**Phase:** 2 — The Send Seam (internal-recipient locked)  
**Goal:** R7 send path end-to-end with hard internal allowlist; no real client sends until G4.  
**Dev branch:** `klnygbbmognbslgobmzc`  
**Last updated:** 2026-07-01 (Slice 2 Fence mint path)

---

## Definition of Done (roadmap)

- [x] `FLOOR_INTERNAL_SEND_ALLOWLIST` guard in `stageClientSend`
- [x] Approve on Tier-3 package → `floor_client_send_approvals` held (30s undo window)
- [x] `floor-release-held-sends` sweeper (CRON; gated `FLOOR_CLIENT_SEND_ENABLED`)
- [x] `releaseHeldClientSend` mints `floor_action:` → Fence `client_send_approvals`
- [x] Fence service-release consume path (no live user JWT required for `floor_action:`)
- [x] `send-coi-email` accepts cron-authenticated Floor release (`X-Cron-Secret` + marker)
- [ ] Tier-3 COI inbound play produces real package with internal test recipient
- [ ] First internal test send verified on dev (Brian sign-off)

---

## Slice 1 — Allowlist + stage on approve (shipped)

See commit `62df9d6`.

---

## Slice 2 — Fence mint path (shipped in code)

**Flow**
1. Human Approve on Tier-3 package → `maybeStageClientSendOnApprove` → `floor_client_send_approvals.status=held`
2. After 30s, `floor-release-held-sends` (requires `FLOOR_CLIENT_SEND_ENABLED=true`)
3. `releaseHeldClientSend` → `mintFloorFenceApprovalForCoi` → inserts `client_send_approvals` with `floor_action:{hex}`
4. Sweeper POSTs `send-coi-email` with marker + `X-Cron-Secret`
5. Fence consumes one-time approval; Resend sends to allowlist address only

**Key modules**
- `src/floor/spine/mintFloorFenceApproval.ts`
- `supabase/functions/_shared/clientSendApprovalGate.ts` — `floor_action:` session bypass
- `supabase/functions/send-coi-email/index.ts` — cron Floor release auth path

**Dev enable (Brian-gated)**
```bash
supabase secrets set --project-ref klnygbbmognbslgobmzc \
  FLOOR_CLIENT_SEND_ENABLED=true \
  FLOOR_INTERNAL_SEND_ALLOWLIST=brian@lewisinsurance.ai

supabase functions deploy floor-release-held-sends send-coi-email floor-action --project-ref klnygbbmognbslgobmzc
```

**Tests:** spine mint-on-release + Fence `floor_action` consume without session match

---

## Next slice (Phase 2)

1. Tier-3 COI inbound play → internal test recipient package
2. Dev soak: approve → hold → release → email lands on allowlist only
3. Brian first internal test send sign-off (G4 prep)

---

## Hard stops (unchanged)

1. No client/carrier send without named human click  
2. No raw PII on chat/log/model  
3. No irreversible prod actions
