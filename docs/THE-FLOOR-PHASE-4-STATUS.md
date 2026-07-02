# The Floor — Phase 4 Status

**Branch:** `feat/floor-v1-spine`  
**Dev Supabase:** `klnygbbmognbslgobmzc`  
**Agency workspace (dev):** `f1f07037-3032-45f8-93ca-72c0f47e4fbb`

Phase 4 fills the **safe book**: non-pay watch, open-item nudges, coverage-gap roundout, and future intake adapters — all on the existing WorkRequest / DecisionPackage spine with **no new approval track**.

---

## Slice 1 — `coverage.gap.roundout` (Tier 2 internal cards)

**Goal:** Daily gap detection → internal Tier-2 cards → cockpit pending inbox + Slack undelivered queue.

| Item | Status |
|------|--------|
| Play scaffold (`coverageGapRoundout.ts`, `planCoverageGapRoundoutCards`) | ✅ Phase 3 |
| `floor-run-plays` queries `coverage_gap_opportunities` (`status=new`) | ✅ |
| Kelli default owner (`FLOOR_GAP_ROUNTOUT_OWNER_ID`, dev default UUID) | ✅ Slice 1 |
| `play4_only` + `play_ids` filter on `floor-run-plays` | ✅ Slice 1 |
| Account owner lookup includes gap + quote account IDs | ✅ Slice 1 |
| GitHub Action `.github/workflows/floor-gap-roundout-cron.yml` (dev) | ✅ Slice 1 |
| Soak script `scripts/phase4-gap-roundout-soak.sh` | ✅ Slice 1 |

**Chain (dev):**

1. `run-coverage-gap-detection?agency_workspace_id=…` — populates `coverage_gap_opportunities`
2. `floor-run-plays` with `play4_only: true` — persists internal cards (`create_internal_package`, no client send)
3. Mac Mini / Hermes: `floor_list_undelivered_slack_packages` → Slack DecisionCard delivery

**Run soak locally:**

```bash
chmod +x scripts/phase4-gap-roundout-soak.sh
./scripts/phase4-gap-roundout-soak.sh
```

**Deploy (dev):**

```bash
supabase secrets set --project-ref klnygbbmognbslgobmzc \
  FLOOR_GAP_ROUNTOUT_OWNER_ID=e321fae3-f28b-4170-8316-9460cb9eb2fc

supabase functions deploy floor-run-plays --project-ref klnygbbmognbslgobmzc
```

**GitHub secrets (scheduled dev cron):**

- `FLOOR_DEV_SERVICE_ROLE_KEY`
- `FLOOR_DEV_CRON_SECRET` (must match dev `CRON_SECRET`)

---

## Slice 2 — `open.item.nudge` (Tier 2 internal cards)

**Goal:** Open quotes + non-suspense pending tasks → internal nudge cards → cockpit + Slack queue.

| Item | Status |
|------|--------|
| Play scaffold (`openItemNudge.ts`, `planOpenItemNudgeCards`) | ✅ Phase 3 |
| `floor-run-plays` queries open `quotes` + pending `tasks` | ✅ |
| Kelli default owner (`FLOOR_OPEN_ITEM_NUDGE_OWNER_ID`) | ✅ Slice 2 |
| Task assignee preferred over account/Kelli default | ✅ Slice 2 |
| `play5_only` + `play_ids` filter on `floor-run-plays` | ✅ Slice 2 |
| GitHub Action `.github/workflows/floor-open-item-nudge-cron.yml` (dev) | ✅ Slice 2 |
| Soak script `scripts/phase4-open-item-nudge-soak.sh` | ✅ Slice 2 |

**Chain (dev):**

1. Live data: `quotes.status='open'` and pending tasks without "suspense" in title
2. `floor-run-plays` with `play5_only: true` — persists internal cards
3. Mac Mini / Hermes: Slack delivery queue

**Run soak locally:**

```bash
chmod +x scripts/phase4-open-item-nudge-soak.sh
./scripts/phase4-open-item-nudge-soak.sh
```

**Deploy (dev):**

```bash
supabase secrets set --project-ref klnygbbmognbslgobmzc \
  FLOOR_OPEN_ITEM_NUDGE_OWNER_ID=e321fae3-f28b-4170-8316-9460cb9eb2fc

supabase functions deploy floor-run-plays --project-ref klnygbbmognbslgobmzc
```

---

## Upcoming slices (not started)

| Slice | Play | Notes |
|-------|------|-------|
| 3 | `nonpay.cancel.watch` | FL day-count fork (Brian) |
| 4+ | Endorsement capture, licensing alerts, SMS intake | Roadmap Phase 4 |

---

## Hard gates (unchanged)

- **G1** — Prod migrations  
- **G3** — Slack Pro billing  
- **G4** — Client send prod (Play 3 `id.card.issue` dev-soaked only)  
- **Brian forks** — FL non-pay day counts, §934.03 voice, staleness ceiling, lienholder recipient basis

---

**Last updated:** 2026-07-02 (Slice 2)

### Slice 2 soak (dev)

```text
Part A dry_run: play5_planned=10 ✅
Part B live: created=10 ✅
Part C replay: idempotent=10 ✅
```

### Slice 1 soak (dev)

```text
Part A dry_run: play4_planned=1 ✅
Part B live: created=1 ✅
Part C replay: idempotent=1 ✅
```

**Fixes shipped with Slice 1:** batched account owner lookup (PostgREST `.in()` limit), conditional data fetch for `play4_only`, quote status enum (`open` only), `run-coverage-gap-detection` deployed to dev.

**Note:** Gap detection returned `accounts_analyzed: 0` on dev (RPC profile empty for batch); soak seeds one `coverage_gap_opportunities` row when none exist.
