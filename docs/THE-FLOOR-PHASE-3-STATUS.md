# The Floor: Phase 3 Status

**Phase:** 3 — First Light  
**Goal:** Play 4 ID card — first real client send (G4-gated)  
**Plan:** [`THE-FLOOR-PHASE-3-PLAN.md`](./THE-FLOOR-PHASE-3-PLAN.md)  
**Dev branch:** `klnygbbmognbslgobmzc`  
**Last updated:** 2026-07-01 (planning started)

**Status:** 🟢 **PLAN LOCKED** — Brian decisions in (2026-07-01); implementation awaiting go.

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
| 0 | Planning + Brian decisions | ✅ complete 2026-07-01 |
| 1 | ID card asset pipeline | ⬜ ready to start (populate `portal_id_cards` — 0 rows on dev today) |
| 2 | Play 4 `id.card.issue` module + in-force | ⬜ ready (owner: Landen) |
| 3 | Send surface: new `send-id-card-email` + chokepoint generalization | ⬜ ready |
| 4 | CRM button intake (email intake later) | ⬜ ready |
| 5 | G4 live client send | ⬜ blocked on G4 sign-off |

---

## Brian decisions

| Decision | Status |
|---|---|
| Play 4 owner: Tori vs Landen | ✅ **Landen** (2026-07-01) |
| Send surface: extend COI vs `send-id-card-email` | ✅ **New `send-id-card-email`** (2026-07-01) |
| G2 bucket-privacy timing | ✅ Resolved — `portal-documents` already private w/ signed URLs; no dev blocker; legacy audit → prod hardening pre-G4 |
| G4 First Light sign-off | ⏳ open (after dev soak) |
| G1 prod migrations | ⏳ open |

---

## Dev ground truth (verified 2026-07-01)

| Fact | Value |
|---|---|
| `portal_id_cards` rows | **0** — populate pipeline is Slice 1's real work |
| In-force policies (`policy_in_force_status`) | 1,837 |
| ID-card-like `documents` rows | 1 |
| Play 4 test candidates | In-force auto w/ email exist (e.g. Progressive `876025041`, Auto-Owners `49-530349-00`) |
| `policies` line column | `line_of_business` (no `policy_type` column) |

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
