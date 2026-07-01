# The Floor: Phase 3 Status

**Phase:** 3 — First Light  
**Goal:** Play 4 ID card — first real client send (G4-gated)  
**Plan:** [`THE-FLOOR-PHASE-3-PLAN.md`](./THE-FLOOR-PHASE-3-PLAN.md)  
**Dev branch:** `klnygbbmognbslgobmzc`  
**Last updated:** 2026-07-01 (planning started)

**Status:** 🟡 **PLANNING** — implementation not started.

---

## Definition of Done (roadmap)

- [ ] ID-card request → card in owner Slack + cockpit in **< 5s**
- [ ] Approve sends under owner name with in-force gate
- [ ] Same-day cancellation blocks send
- [ ] Zero wrong-recipient sends
- [ ] G4 signed; Play 4 allowlist flipped to client

---

## Slice tracker

| Slice | Scope | Status |
|---|---|---|
| 0 | Planning + Brian decisions | 🟡 in progress |
| 1 | ID card asset pipeline (G2) | ⬜ not started |
| 2 | Play 4 `id.card.issue` module + in-force | ⬜ not started |
| 3 | Send surface + chokepoint generalization | ⬜ not started |
| 4 | CRM / email intake | ⬜ not started |
| 5 | G4 live client send | ⬜ blocked on G4 |

---

## Brian decisions (open)

| Decision | Status |
|---|---|
| Play 4 owner: Tori vs Landen | ⏳ open |
| Send surface: extend COI vs `send-id-card-email` | ⏳ open (plan recommends new function) |
| G2 bucket-privacy timing | ⏳ open |
| G4 First Light sign-off | ⏳ open (after dev soak) |
| G1 prod migrations | ⏳ open |

---

## Prerequisites from Phase 2

| Item | Status |
|---|---|
| Phase 2 sign-off | ✅ [`THE-FLOOR-PHASE-2-SIGNOFF.md`](./THE-FLOOR-PHASE-2-SIGNOFF.md) |
| Fence mint + consume on dev | ✅ soak 2026-07-01 |
| Held state persist fix | ✅ `3b910ea` |
| Dev `RESEND_API_KEY` restored | ⏳ ops — provider step was `failed_delivery` |

---

## Hard stops (unchanged)

1. No client/carrier send without named human click  
2. No raw PII on chat/log/model  
3. No irreversible prod actions  
4. **No G4 allowlist flip without Brian G4 sign-off**
