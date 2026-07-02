# The Floor — Phase 5 Status

**Branch:** `feat/floor-v1-spine`  
**Dev Supabase:** `klnygbbmognbslgobmzc`  
**Agency workspace (dev):** `f1f07037-3032-45f8-93ca-72c0f47e4fbb`

Phase 5 inverts work direction: the **nightly heartbeat** pushes finished internal cards before anyone asks. Same spine, `source='heartbeat'` on work requests (already set by `persistInternalPlayCards`).

---

## Slice 1 — `heartbeat.book.scan` (nightly fan-out)

**Goal:** One cron run → gap detection (optional) → all Phase 1/3/4 internal plays → cockpit + Slack queue.

| Item | Status |
|------|--------|
| `floor-run-plays` `heartbeat: true` mode (all plays, capped limits) | ✅ Slice 1 |
| Plan-first owner lookup (scoped to planned cards only) | ✅ Slice 1 |
| Per-play planned counts in response (`play1_planned` … `play7_planned`) | ✅ Slice 1 + 2 |
| GitHub Action `.github/workflows/floor-heartbeat-cron.yml` (dev, 6 AM UTC) | ✅ Slice 1 |
| Soak script `scripts/phase5-heartbeat-soak.sh` | ✅ Slice 1 |

**Default heartbeat limits (cron):** play1=5, play3=10, play4/5/6/7=5 each.

**Invoke (dev):**

```bash
curl -X POST "https://klnygbbmognbslgobmzc.supabase.co/functions/v1/floor-run-plays" \
  -H "X-Cron-Secret: $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"heartbeat":true,"dry_run":true,"agency_workspace_id":"f1f07037-3032-45f8-93ca-72c0f47e4fbb"}'
```

**Run soak:**

```bash
chmod +x scripts/phase5-heartbeat-soak.sh
./scripts/phase5-heartbeat-soak.sh
```

**Note:** Individual Phase 4 play crons (7:30–8:30 UTC) remain for focused testing; heartbeat is the production-shaped nightly path and can replace them once stable.

---

## Slice 2 — `retention.save.list`

**Goal:** `run-retention-scoring` → high/critical `policy_renewal_risk_scores` → Tier-2 internal save cards → cockpit + Slack. Kelli default owner.

| Item | Status |
|------|--------|
| Play 7 planner + ranked save-list cards | ✅ Slice 2 |
| `floor-run-plays` `retention_only: true` mode | ✅ Slice 2 |
| `play7_limit`, `play7_planned`, `play7_summary` in response | ✅ Slice 2 |
| Play 7 in heartbeat fan-out (`play7_limit` default 5) | ✅ Slice 2 |
| GitHub Action `.github/workflows/floor-retention-save-cron.yml` (dev, 9 AM UTC) | ✅ Slice 2 |
| Soak script `scripts/phase5-retention-save-soak.sh` | ✅ Slice 2 |
| Dev secret `FLOOR_RETENTION_SAVE_OWNER_ID` (Kelli) | ✅ Slice 2 |

**Invoke (dev):**

```bash
curl -X POST "https://klnygbbmognbslgobmzc.supabase.co/functions/v1/floor-run-plays" \
  -H "X-Cron-Secret: $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"retention_only":true,"play7_limit":10,"dry_run":true,"agency_workspace_id":"f1f07037-3032-45f8-93ca-72c0f47e4fbb"}'
```

**Run soak:**

```bash
chmod +x scripts/phase5-retention-save-soak.sh
./scripts/phase5-retention-save-soak.sh
```

---

## Upcoming slices (not started)

| Slice | Play / feature | Notes |
|-------|----------------|-------|
| 3 | Morning tray DM batching | Requires Slack tray scheduler |
| 4 | `remarket.packet.auto` | ADR 003, Tier-4 draft-only |
| 5 | `play.patch.compile` | FeedbackEvents → vault PR |

---

## Hard gates (unchanged)

- **G1** — Prod migrations  
- **G3** — Slack Pro billing  
- **G4** — Client send prod  
- **Brian forks** — FL day counts, §934.03 voice, staleness ceiling

---

**Last updated:** 2026-07-02 (Slice 2)

### Slice 1 soak (dev)

```text
Part A dry_run: planned=8 (play1=2 play3=2 play4=1 play5=2 play6=1) ✅
Part B live: created=4 idempotent=4 ✅
Part C replay: idempotent=8 ✅
```

### Slice 2 soak (dev)

```text
Part A dry_run: play7_planned=1 ✅
Part B live: created=1 idempotent=0 (first run) / idempotent=1 (replay) ✅
Part C replay: idempotent=1 ✅
Owner: Kelli (e321fae3…) ✅
Note: run-retention-scoring not deployed on dev yet; soak seeds score when empty.
```
