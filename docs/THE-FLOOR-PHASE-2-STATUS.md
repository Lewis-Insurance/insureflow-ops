# The Floor: Phase 2 Status

**Phase:** 2 — The Send Seam (internal-recipient locked)  
**Goal:** R7 send path end-to-end with hard internal allowlist; no real client sends until G4.  
**Dev branch:** `klnygbbmognbslgobmzc`  
**Last updated:** 2026-07-01 (Slice 3 Tier-3 COI inbound play)

---

## Definition of Done (roadmap)

- [x] `FLOOR_INTERNAL_SEND_ALLOWLIST` guard in `stageClientSend`
- [x] Approve on Tier-3 package → `floor_client_send_approvals` held (30s undo window)
- [x] `floor-release-held-sends` sweeper (CRON; gated `FLOOR_CLIENT_SEND_ENABLED`)
- [x] `releaseHeldClientSend` mints `floor_action:` → Fence `client_send_approvals`
- [x] Fence service-release consume path (no live user JWT required for `floor_action:`)
- [x] `send-coi-email` accepts cron-authenticated Floor release (`X-Cron-Secret` + marker)
- [x] Tier-3 COI inbound play produces package with internal test recipient
- [ ] First internal test send verified on dev (Brian sign-off)

---

## Slice 3 — Tier-3 COI inbound (shipped in code)

**When:** `coi.issue` email intake + resolved account + `FLOOR_INTERNAL_SEND_ALLOWLIST` set

**Behavior**
- `email-inbound-lite` calls `resolveCoiIntakePackage` instead of stub
- `decision_packages.send_spec.recipient` = first allowlist address (not `[INTERNAL_ONLY]`)
- `request_body`: `{ phase: 2, tier3_internal_test: true, internal_only: false }`
- Response includes `tier3: true`
- Without allowlist → falls back to Phase 1 stub (no send seam)

**Modules**
- `src/floor/spine/plays/coiIssueInbound.ts`
- `pickInternalTestRecipient` in `internalSendAllowlist.ts`

**Dev deploy**
```bash
./scripts/g0-dev-enable-floor-flags.sh
supabase functions deploy email-inbound-lite floor-action floor-release-held-sends send-coi-email --project-ref klnygbbmognbslgobmzc
```

**Soak test**
1. POST allowlisted COI-shaped inbound (SPF/DKIM/DMARC pass + coi filename)
2. Confirm package `send_spec.recipient` = allowlist email
3. Approve in Slack/cockpit → `floor_client_send_approvals.status=held`
4. `FLOOR_CLIENT_SEND_ENABLED=true` → run release sweeper → email to allowlist only

---

## Slice 2 — Fence mint path

See commit `51f323a`.

---

## Hard stops (unchanged)

1. No client/carrier send without named human click  
2. No raw PII on chat/log/model  
3. No irreversible prod actions
