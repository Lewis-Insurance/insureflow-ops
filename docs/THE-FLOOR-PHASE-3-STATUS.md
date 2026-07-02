# The Floor: Phase 3 Status

**Phase:** 3 — First Light  
**Goal:** Play 4 ID card — first real client send (G4-gated)  
**Plan:** [`THE-FLOOR-PHASE-3-PLAN.md`](./THE-FLOOR-PHASE-3-PLAN.md)  
**Prod track:** [`THE-FLOOR-PHASE-3-PROD-FIRST-LIGHT.md`](./THE-FLOOR-PHASE-3-PROD-FIRST-LIGHT.md)  
**Dev branch:** `klnygbbmognbslgobmzc`  
**Last updated:** 2026-07-02 (Slices 7–11 + Codex review close-out)

**Status:** 🟢 **DEV CLOSE-OUT COMPLETE** (Slices 0–8 code) and Codex review fixes are live on dev + committed to `main` (`efae3a5`); Slice 9 ops (Resend key) **ON HOLD — no client sends yet (Landen, 2026-07-02)**; Slice 11 prod gated.

---

## Definition of Done (roadmap)

- [x] ID-card request → card in owner Slack + cockpit in **< 5s** (`intake_latency_ms` on `floor-action` create)
- [x] Approve sends under owner name with in-force gate (dev **client** email `gdepoi346@gmail.com`)
- [x] Same-day cancellation blocks send (live tests B + C in g4 soak)
- [x] **Kill during hold** cancels send — Slice 7 (`floor_client_send_approvals` → `killed`)
- [x] Zero wrong-recipient sends (G4 recipient guard + account match)
- [x] G4 signed; Play 4 allowlist flipped to client (dev)
- [x] Extended `feedback_events` verbs (approve/edit/kill + release/send/card_created)
- [x] Release sweeper cron (GitHub Action every 5 min)
- [ ] Resend delivery green on dev (Slice 9 ops — copy prod `RESEND_API_KEY`) — **HELD: do not restore the key until Landen gives the go; not looking to send to a customer yet (2026-07-02)**
- [ ] Prod First Light (Slice 11 — G1 + prod G4)

---

## Slice tracker

| Slice | Scope | Status |
|---|---|---|
| 0 | Planning + Brian decisions | ✅ |
| 1 | ID card asset pipeline | ✅ |
| 2 | Play 4 `id.card.issue` module + in-force | ✅ |
| 3 | `send-id-card-email` + chokepoint generalization | ✅ |
| 4 | CRM button intake | ✅ |
| 5 | G4 live client send | ✅ signed 2026-07-01 |
| 6 | G4 validation soak | ✅ ⚠️ Resend key |
| 7 | Kill-during-hold + release sweeper cron + stuck alarm | ✅ code + soak |
| 8 | Audit verbs + intake latency + await `email_log` | ✅ code |
| 9 | Provider green (Resend) | ⏸️ **HELD** (Landen 2026-07-02: no client sends yet) |
| 10 | Doc reconciliation | ✅ |
| 11 | Prod First Light gate doc | ✅ gated |

---

## Codex review close-out (live on dev, 2026-07-02)

Commit `efae3a5` closed the PR #26 review fixes in source, and the dev branch was then updated through the Supabase MCP/deploy path. Post-deploy proof was re-confirmed after redeploys:

| Fix | Live proof |
|---|---|
| Floor edge imports resolve | `floor-action` v25 deployed; content check confirms `./types.ts` plus `FloorDecisionPackagePreview` |
| Slack approve stages a held send | `floor_apply_feedback` on dev re-verified with `faf_staging_live: true` |
| CRM path stages before transition + rolls back on failure | `floor-action` v25 content check confirms staging-before-transition and rollback guard |
| `email_log` workspace-scoped RLS + sweeper workspace population | Dev migration verified with `email_log_scoped_policy_live: true`; `floor-release-held-sends` v13 content check confirms `agency_workspace_id: agencyWorkspaceId` |
| Release sweeper cadence | GitHub Action on `main` uses `*/5` |

Deployment notes: `floor-action` advanced from 24 to 25 and `floor-release-held-sends` advanced from 12 to 13 on dev. `verify_jwt: true` remains preserved on both. Only the changed files were swapped; unchanged function files were passed back byte-identical. Review items 2 and 7 were false positives and intentionally left unchanged.

Remaining deliberate/optional items: Slice 9 client-send HOLD stays until Landen gives the go; prod `email_log` coupling only matters if those senders promote; low-priority NULL-workspace `email_log` rows from the two direct senders can be cleaned separately.

---

## Slice 7 — kill-during-hold (2026-07-02)

| Item | Status |
|------|--------|
| Kill verb → `floor_client_send_approvals.status = killed` | ✅ `floor-action` + `floor_apply_feedback` migration |
| `releaseHeldClientSend` skips `killed` | ✅ |
| Sweeper excludes killed work requests | ✅ join filter + `assertWorkRequestNotKilled` |
| GitHub Action `floor-release-held-sends-cron.yml` | ✅ every 5 min |
| Stuck hold alarm (`hold_until + 10m`) | ✅ in sweeper response |
| Soak | `scripts/phase3-slice7-kill-hold-soak.sh` |

---

## Slice 8 — audit + latency (2026-07-02)

| Item | Status |
|------|--------|
| `feedback_events` verbs extended | ✅ migration `20260702120000` |
| `card_created` on CRM package create | ✅ `floor-action` |
| `release` / `send_success` / `send_failure` on sweeper | ✅ |
| `intake_at` + `first_package_at` columns | ✅ migration |
| `intake_latency_ms` + `intake_sla_met` in create response | ✅ |
| `email_log` insert awaited | ✅ `send-id-card-email`, `send-coi-email`, sweeper |

---

### Slice 7 soak (dev)

```text
Part A create: intake_latency_ms=88 intake_sla_met=true ✅
Part B approve: staged=held ✅
Part C kill: floor_client_send_approvals.status=killed ✅
Part D sweeper: provider_send_blocked=yes ✅
```

**HELD (Landen, 2026-07-02): do not run this step.** With the release sweeper on a 5-minute cron, a real key plus one Approve delivers to a real client automatically after the hold. The placeholder key IS the current no-client-contact guarantee. When Landen gives the go: copy prod `RESEND_API_KEY` to dev → re-run `scripts/phase3-g4-soak.sh` Part A.
Guide: [`scripts/phase3-restore-resend-key.md`](../scripts/phase3-restore-resend-key.md)

---

## Dev soak scripts

| Script | Purpose |
|--------|---------|
| `scripts/phase3-dev-soak.sh` | Pre-G4 allowlist |
| `scripts/phase3-g4-soak.sh` | G4 client + cancel-block |
| `scripts/phase3-slice7-kill-hold-soak.sh` | Kill during hold |

---

## Hard stops (unchanged)

1. No client/carrier send without named human click  
2. No raw PII on chat/log/model  
3. No irreversible prod actions without G1 + prod G4  
4. COI stays internal on prod until separately flipped  

---

## Brian decisions

| Decision | Status |
|---|---|
| G4 dev sign-off | ✅ 2026-07-01 |
| G1 prod migrations | ⏳ open — see Slice 11 |
| G4 prod sign-off | ⏳ open — separate from dev |
