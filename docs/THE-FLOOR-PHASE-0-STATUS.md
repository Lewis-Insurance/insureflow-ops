# The Floor: Phase 0 Status

**Purpose.** Living tracker for Phase 0 (Runway) kickoff. Update this file as items complete.

**Owner:** Brian "Speedy" Lewis  
**Dev branch:** `klnygbbmognbslgobmzc` (all write testing)  
**Prod:** stays dark, all flags OFF  
**Last updated:** 2026-07-01 (Phase 0 DoD complete on dev — ready for Brian G1 review)

**G0 signed:** [`THE-FLOOR-G0-SIGNOFF.md`](./THE-FLOOR-G0-SIGNOFF.md) — Brian Lewis, 2026-07-01  
**Operating authority:** [`THE-FLOOR-OPERATING-AUTHORITY.md`](./THE-FLOOR-OPERATING-AUTHORITY.md) — standing directive, 2026-07-01  
**Phase 1 tracker:** [`THE-FLOOR-PHASE-1-STATUS.md`](./THE-FLOOR-PHASE-1-STATUS.md)  
**Dev apply script:** [`scripts/g0-dev-apply.sh`](../scripts/g0-dev-apply.sh)

---

## Phase 0 Definition of Done (roadmap)

- [x] Migrations green on dev (Spine A + D + pg_trgm + resolve_account + hermes_app)
- [x] `src/integrations/supabase/types.ts` regenerated from dev branch
- [x] The in-force view returns correct status on dev (`policy_in_force_status` — 2159 rows)
- [x] The Floor action endpoint is live on dev (`floor-action` + `hermes-chat` deployed)
- [x] The `resolve_account` RPC exists on dev (smoke: empty candidates for `test@example.com`)
- [x] `/floor` works and launchd runs (App Home verified — migration queue, Book at a Glance, Refresh Home; Brian, 2026-07-01)
- [x] 4 ADRs merged (`docs/adr/001` through `004`)
- [x] project-state section 11 reconciled (remarket -> Phase 5)
- [x] G0 signed (Brian, 2026-07-01)
- [x] Prod unchanged, all flags OFF

---

## G0 pre-sign records (complete)

| Item | Status | Record |
|---|---|---|
| #1 Source tables | **PASS** | [`docs/ops/g0-source-table-verification.md`](./ops/g0-source-table-verification.md) |
| #2 PITR | **Confirmed** | [`docs/ops/pitr-check.md`](./ops/pitr-check.md) (6/29 + G0 7/01) |
| #3 Dev branch | **Approved** | `klnygbbmognbslgobmzc` only |
| #4 hermes_app | **Approved** | Dev apply in migration batch |
| #5 pg_trgm | **Path A** | [`docs/ops/g0-pg-trgm-verification.md`](./ops/g0-pg-trgm-verification.md) |
| #6 Bucket | **Hold** | No flip in Phase 0 |

---

## In-repo vs dev apply / deploy

### Done in-repo (`insureflow-ops`)

- [x] Unified roadmap, ADRs, G0 sign-off, Phase 0 tracker
- [x] Spine A/D + resolve_account + pg_trgm + hermes_app migrations staged
- [x] `floor-action` + `hermes-chat` (FU-2 redactPII) + tests (426 pass)
- [x] Floor flags in `.env.example`
- [x] G0 verification docs (#1, #5, PITR)
- [x] Dev apply script: `scripts/g0-dev-apply.sh`

### Done in-repo (`lewis-the-floor`)

- [x] App Home overflow fix in source (`homeListSection`, `enforceSlackBlockLimits`)
- [x] `npm run build` succeeds
- [x] launchd job `com.lewisinsurance.floor` running (Socket Mode)
- [x] App Home verified in Slack (Brian — Home tab: migration remaining, Book at a Glance, guardrails, Refresh Home / My renewals)

### Dev apply progress (2026-07-01) — **complete**

- [x] `.env.local` credentials (`SUPABASE_ACCESS_TOKEN` + `SUPABASE_DB_PASSWORD_DEV`)
- [x] Link to dev branch `klnygbbmognbslgobmzc`
- [x] `supabase db push --include-all` (Floor + prerequisite migrations)
- [x] Spine A tables on dev
- [x] Spine D view on dev
- [x] `resolve_account` RPC on dev (+ hotfix `20260701140000` for missing `account_aliases` on branch)
- [x] `pg_trgm` + `hermes_app` on dev
- [x] Regenerate types from dev
- [x] Deploy `floor-action` + `hermes-chat` to dev
- [x] Smoke tests: `policy_in_force_status` count, `resolve_account()` call

**Dev-only notes (not prod):**
- `20260629120000_fix_orphaned_customer_visibility` skipped on dev (enum drift `account_type_v2`); marked applied via repair
- `hermes_app` grant + `resolve_account` alias ladder guarded when `account_aliases` absent (branch lacks dashboard-only table)

**Script:** `./scripts/g0-dev-apply.sh` (includes dev-branch password preflight)

### Prod (unchanged)

- [x] No prod migrations at G0
- [x] Flags OFF
- [x] `LEWIS_ALLOW_PROD_WRITES` unset

---

## First two weeks (roadmap section 11)

### Week 1

1. [x] Brian G0 clearance — **signed 2026-07-01**
2. [x] Create `hermes_app` on dev
3. [x] Apply Spine A + D + pg_trgm + resolve_account + hermes_app on dev
4. [x] Regenerate types (with dev apply)
5. [x] Write and merge the 4 ADRs
6. [x] Play 1 + in-force view in code + tests (view live on dev)
7. [x] `floor-action` in code (deployed on dev)

### Week 2

1. [ ] Per-employee binding + seed Tori (Phase 1)
2. [ ] Fixture to live seam (Phase 1)
3. [ ] Play 3 + FeedbackEvent (Phase 1)
4. [ ] email-inbound rewire (Phase 1)
5. [x] FU-2 on hermes-chat (code done; deploy with dev)
6. [ ] Demo to Brian — **ready** (Phase 0 DoD green; see note below)

---

## Blockers

| Blocker | Owner | Status |
|---|---|---|
| Brian G1 review / Phase 0 sign-off | Brian | **Ready** — all DoD items green on dev |
| Prod Fence gate not deployed | Dev | G1-ish (see G0 sign-off "does not close") |
| prism-api FU-2 redactPII | Dev | Open (stretch) |

---

## Note for Brian (Phase 0 complete — G1 review)

**Subject:** The Floor — Phase 0 complete on dev, ready for your review

Brian,

Phase 0 (Runway) is **done on dev branch only** (`klnygbbmognbslgobmzc`). Prod is unchanged; all Floor flags OFF per G0.

**What's live on dev**

- Spine A contract tables (`automation_work_requests`, `decision_packages`, `feedback_events`, `floor_client_send_approvals`)
- `policy_in_force_status` view (2,159 rows on branch snapshot)
- `resolve_account` RPC + `pg_trgm` + `hermes_app`
- Edge functions: `floor-action`, `hermes-chat` (FU-2 redactPII)
- Types regenerated from dev branch

**What's verified in Slack (you)**

- Lewis Floor **App Home** loads: Auto-Owners migration queue, Book at a Glance, guardrails, Refresh Home / My renewals
- DM commands working (`migration`, decision approvals in thread history)
- Mac Mini runtime up (Socket Mode / launchd)

**Explicitly not in Phase 0 (Phase 1+)**

- Per-employee CRM cockpit wiring (fixture → live `floor-action`)
- Email inbound → WorkRequest spine
- Approve → `stageClientSend` on real packages
- Prod migrations or flag flip

**Dev-only caveats** (documented in this file): orphaned-customer backfill skipped on branch enum drift; `account_aliases` optional on branch.

**Ask:** Review [`THE-FLOOR-PHASE-0-STATUS.md`](./THE-FLOOR-PHASE-0-STATUS.md) and [`THE-FLOOR-UNIFIED-ROADMAP.md`](./THE-FLOOR-UNIFIED-ROADMAP.md) Phase 1 scope. If you're green, we start Phase 1 (per-employee binding, fixture→live seam, internal cards on Slack + cockpit).

— Ops

---

## Send to Brian when Phase 0 DoD complete on dev

All DoD checkboxes above are green. Send Brian the note in the section above (or this file) for G1 review.
