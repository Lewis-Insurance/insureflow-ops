# The Floor: Phase 1 Status

**Phase:** 1 — The Invisible Win  
**Goal:** Real per-name internal decision cards on Slack + CRM cockpit. **No send path.**  
**Authority:** [`THE-FLOOR-OPERATING-AUTHORITY.md`](./THE-FLOOR-OPERATING-AUTHORITY.md)  
**Dev branch:** `klnygbbmognbslgobmzc`  
**Last updated:** 2026-07-01 (Phase 1 complete; Phase 2 slice 1 started)

---

## Definition of Done (roadmap)

- [x] Per-employee binding live (`public.floor_agent_bindings_v` → `hermes.agents`)
- [x] `FeedbackEvent` logged on every Approve/Edit/Kill verb
- [x] Cards driven by live `public.decision_packages` (Play runner creates rows)
- [x] Slack: fixture→live seam (`floor_get_slack_decision_package`, `floor_apply_feedback`)
- [x] Slack: canonical delivery (6/6 DMs on dev soak)
- [x] App Home pending counts materialized on dev
- [ ] Slack: Tori `slack_user_id` seeded (6/6) — placeholder pending real ID
- [x] Cockpit: per-user session ref + Approve/Edit/Kill → `floor-action`
- [x] Email: inbound → WorkRequest path (gated `FLOOR_COCKPIT_ENABLED`)
- [x] Plays 1 + 3 producing internal cards on dev (`floor-run-plays`)
- [x] Netlify preview: `VITE_LEWIS_FLOOR_COCKPIT_ENABLED=true` (`netlify.toml` deploy-preview + branch-deploy)
- [ ] Brian: Slack Approve/Edit/Kill click-through verification on dev

---

## Outcome digest — 2026-07-01 (slice 3 close)

**Slack delivery**
- `floor_list_undelivered_slack_packages` + `floor_record_slack_delivery`
- Mac Mini `deliver:canonical-decision-cards` → **6/6 delivered** on dev
- `FLOOR_CANONICAL_DELIVERY_FORCE=1` for re-post soak

**App Home**
- `materialize:home-snapshots` on dev DB — brian pending cards visible after Refresh Home

**Netlify staff soak**
- Preview and branch deploys build with cockpit ON; production unchanged

**Phase 2 prep (slice 1)**
- Internal send allowlist + approve→held staging in code (no live send until `FLOOR_CLIENT_SEND_ENABLED`)
- See [`THE-FLOOR-PHASE-2-STATUS.md`](./THE-FLOOR-PHASE-2-STATUS.md)

---

## Outcome digest — 2026-07-01 (slice 2)

**Play runner shipped**
- `floor-run-plays` edge function (CRON auth, `FLOOR_COCKPIT_ENABLED` gate)
- Play 1: lapsed policies → internal "not in force" cards
- Play 3: suspense tasks → internal follow-up cards
- Live run: **6 packages** in `public.decision_packages`

---

## Invoke (dev)

```bash
# Run plays (idempotent daily)
curl -X POST "https://klnygbbmognbslgobmzc.supabase.co/functions/v1/floor-run-plays" \
  -H "X-Cron-Secret: $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"play1_limit":5,"play3_limit":5}'

# Deliver Slack cards (Mac Mini lewis-the-floor)
FLOOR_CANONICAL_DELIVERY_FORCE=1 npm run deliver:canonical-decision-cards
```

---

## Mac Mini dev soak (restore prod: swap URLs in `slack/.env`, kickstart bot)

```bash
launchctl kickstart -k gui/$(id -u)/com.lewisinsurance.floor
npm run materialize:home-snapshots
```

---

## Next (Phase 3)

1. Dev soak with `FLOOR_CLIENT_SEND_ENABLED=true` (Brian signed off — see [`THE-FLOOR-PHASE-2-SIGNOFF.md`](./THE-FLOOR-PHASE-2-SIGNOFF.md))
2. Phase 3 First Light prep
3. G4 when ready: first live client send (allowlist flip per play)

---

## Hard stops (unchanged)

1. No client/carrier send without named human click  
2. No raw PII on chat/log/model  
3. No irreversible prod actions
