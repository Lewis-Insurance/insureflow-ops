# The Floor: Phase 1 Status

**Phase:** 1 — The Invisible Win  
**Goal:** Real per-name internal decision cards on Slack + CRM cockpit. **No send path.**  
**Authority:** [`THE-FLOOR-OPERATING-AUTHORITY.md`](./THE-FLOOR-OPERATING-AUTHORITY.md)  
**Dev branch:** `klnygbbmognbslgobmzc`  
**Last updated:** 2026-07-01 (Plays 1+3 live on dev; flags ON)

---

## Definition of Done (roadmap)

- [x] Per-employee binding live (`public.floor_agent_bindings_v` → `hermes.agents`)
- [x] `FeedbackEvent` logged on every Approve/Edit/Kill verb
- [x] Cards driven by live `public.decision_packages` (Play runner creates rows)
- [x] Slack: fixture→live seam (`floor_get_slack_decision_package`, `floor_apply_feedback`)
- [ ] Slack: Tori `slack_user_id` seeded (6/6) — placeholder pending real ID
- [x] Cockpit: per-user session ref + Approve/Edit/Kill → `floor-action`
- [x] Email: inbound → WorkRequest path (gated `FLOOR_COCKPIT_ENABLED`)
- [x] Plays 1 + 3 producing internal cards on dev (`floor-run-plays`)
- [ ] Staff cockpit ON in Netlify preview (`VITE_LEWIS_FLOOR_COCKPIT_ENABLED` — edge secrets set)

---

## Outcome digest — 2026-07-01 (slice 2)

**Play runner shipped**
- `floor-run-plays` edge function (CRON auth, `FLOOR_COCKPIT_ENABLED` gate)
- Play 1: lapsed policies → internal "not in force" cards
- Play 3: suspense tasks → internal follow-up cards
- Idempotent daily keys; caps per run (default 10 each)

**Dev live run**
- Dry run: 6 cards planned (3 Play 1 + 3 Play 3)
- Live run: **6 packages created** in `public.decision_packages`
- Workspace: `f1f07037-3032-45f8-93ca-72c0f47e4fbb`

**Dev flags ON (edge)**
- `FLOOR_COCKPIT_ENABLED=true`
- `FLOOR_INBOUND_AGENCY_WORKSPACE_ID` set
- Script: `scripts/g0-dev-enable-floor-flags.sh`

**Mac Mini**
- `lewis-the-floor` rebuilt (`npm run build`)
- Set `FLOOR_USE_CANONICAL_PACKAGES=1` in local env + kickstart for Slack to read new packages

**Tests:** 439 pass (insureflow-ops)

---

## Invoke (dev)

```bash
curl -X POST "https://klnygbbmognbslgobmzc.supabase.co/functions/v1/floor-run-plays" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"play1_limit":5,"play3_limit":5}'
```

Re-run same day = idempotent (no duplicate cards).

---

## Next slice (Phase 1 close → Phase 2 prep)

1. Netlify preview: `VITE_LEWIS_FLOOR_COCKPIT_ENABLED=true` for staff soak
2. Mac Mini: `FLOOR_USE_CANONICAL_PACKAGES=1` + materialize home snapshots for "my cards"
3. Wire Slack to post new packages as DecisionCards (delivery projection)
4. Tori Slack ID when available
5. Phase 2: send seam (internal-recipient locked only)

---

## Hard stops (unchanged)

1. No client/carrier send without named human click  
2. No raw PII on chat/log/model  
3. No irreversible prod actions
