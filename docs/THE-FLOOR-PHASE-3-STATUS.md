# The Floor: Phase 3 Status

**Phase:** 3 — First Light  
**Goal:** Play 4 ID card — first real client send (G4-gated)  
**Plan:** [`THE-FLOOR-PHASE-3-PLAN.md`](./THE-FLOOR-PHASE-3-PLAN.md)  
**Dev branch:** `klnygbbmognbslgobmzc`  
**Last updated:** 2026-07-01 (G4 signed; client-mode release guards shipped)

**Status:** 🟢 **SLICE 6 DEV SOAK GREEN** — G4 client recipient verified; cancel-block live tests pass; Fence consume ✅. Provider step `failed_delivery` until dev `RESEND_API_KEY` matches prod (copy from Supabase dashboard).

---

## Definition of Done (roadmap)

- [ ] ID-card request → card in owner Slack + cockpit in **< 5s**
- [x] Approve sends under owner name with in-force gate (dev **client** email `gdepoi346@gmail.com`)
- [x] Same-day cancellation blocks send (live tests B + C in g4 soak)
- [x] Zero wrong-recipient sends (G4 recipient guard + account match)
- [x] G4 signed; Play 4 allowlist flipped to client (dev)

---

## Slice tracker

| Slice | Scope | Status |
|---|---|---|
| 0 | Planning + Brian decisions | ✅ complete 2026-07-01 |
| 1 | ID card asset pipeline | ✅ `resolveIdCardAsset.ts` + dev populate proven |
| 2 | Play 4 `id.card.issue` module + in-force | ✅ `idCardIssueInbound.ts` + tests |
| 3 | Send surface: new `send-id-card-email` + chokepoint generalization | ✅ deployed + Fence surface migration |
| 4 | CRM button intake (`floor-action` + `id.card.issue`) | ✅ deployed; owner = Landen |
| 5 | G4 live client send | ✅ signed + dev soak 2026-07-01 ([`scripts/phase3-g4-soak.sh`](../scripts/phase3-g4-soak.sh)) |
| 6 | G4 validation soak | ✅ client email + cancel-block + Slack queue; ⚠️ Resend key |

---

## Dev soak — Slice 6 G4 validation (2026-07-01)

Script: [`scripts/phase3-g4-soak.sh`](../scripts/phase3-g4-soak.sh)

| Part | Result |
|---|---|
| A — Happy path | ✅ recipient `gdepoi346@gmail.com`; Slack queue ready; Approve → held → Fence consumed |
| A — Resend | ⚠️ `failed_delivery` (dev key is placeholder; prod hash differs) |
| B — Cancel before approve | ✅ `send_staging_failed` / not in force |
| C — Cancel during hold | ✅ release blocked at in-force re-check |

**Ops:** Copy prod `RESEND_API_KEY` to dev in Supabase Dashboard → Edge Functions → Secrets, then re-run Part A only.

---

## Dev soak — 2026-07-01 (Play 4 allowlist, pre-G4)

Script: [`scripts/phase3-dev-soak.sh`](../scripts/phase3-dev-soak.sh)

| Step | Result |
|---|---|
| `create_internal_package` (`id.card.issue`, Gerald Depoi / policy `875652030`) | ✅ Tier-3 package + `document_ref` signed URL |
| `portal_id_cards` populate | ✅ 1 row (copied from `documents` → `portal-documents`) |
| `owner_id` | ✅ Landen (`landen@lewisinsurance.com`) |
| Approve → `sendStaging` | ✅ `{ staged: true, status: 'held' }` |
| Release sweeper | ✅ `surface: send-id-card-email` |
| Fence consume | ✅ `floor_action:…`, `fence_consumed: true` |
| Resend delivery | ⚠️ `failed_delivery` (dev `RESEND_API_KEY` still placeholder) |

**Ops note:** Soak required seeding the Gerald Depoi ID card PDF into the dev `documents` bucket (metadata row existed; blob was missing).

---

## Brian decisions

| Decision | Status |
|---|---|
| Play 4 owner: Tori vs Landen | ✅ **Landen** (2026-07-01) |
| Send surface: extend COI vs `send-id-card-email` | ✅ **New `send-id-card-email`** (2026-07-01) |
| G2 bucket-privacy timing | ✅ Resolved — `portal-documents` already private w/ signed URLs |
| G4 First Light sign-off | ✅ **Signed 2026-07-01** — [`THE-FLOOR-PHASE-3-G4-SIGNOFF.md`](./THE-FLOOR-PHASE-3-G4-SIGNOFF.md) |
| G1 prod migrations | ⏳ open |

---

## Key files (Slices 1–4)

| Area | Path |
|---|---|
| Asset resolver | `src/floor/spine/resolveIdCardAsset.ts` |
| Intake orchestrator | `src/floor/spine/buildIdCardIntakePackage.ts` |
| Play 4 package | `src/floor/spine/plays/idCardIssueInbound.ts` |
| Generalized send | `src/floor/spine/stageClientSend.ts`, `mintFloorFenceApproval.ts` |
| Edge: intake | `supabase/functions/floor-action/index.ts` |
| Edge: send | `supabase/functions/send-id-card-email/index.ts` |
| Edge: release | `supabase/functions/floor-release-held-sends/index.ts` |
| Fence surface migration | `supabase/migrations/20260701210000_floor_send_id_card_email_surface.sql` |

---

## Prerequisites from Phase 2

| Item | Status |
|---|---|
| Phase 2 sign-off | ✅ [`THE-FLOOR-PHASE-2-SIGNOFF.md`](./THE-FLOOR-PHASE-2-SIGNOFF.md) |
| Fence mint + consume on dev | ✅ Play 4 soak 2026-07-01 |
| Held state persist fix | ✅ `3b910ea` |
| Dev `RESEND_API_KEY` restored | ⏳ ops — provider step was `failed_delivery` |

---

## Hard stops (unchanged)

1. No client/carrier send without named human click  
2. No raw PII on chat/log/model  
3. No irreversible prod actions  
4. **No G4 allowlist flip without Brian G4 sign-off**
