# The Floor — G0 Sign-Off (Brian)

**One page. Sign once. Unblocks dev-branch work only.**

**Owner:** Brian "Speedy" Lewis  
**Date prepared:** 2026-07-01  
**Authority:** [`THE-FLOOR-UNIFIED-ROADMAP.md`](./THE-FLOOR-UNIFIED-ROADMAP.md) Phase 0 | [`THE-FLOOR-PHASE-0-STATUS.md`](./THE-FLOOR-PHASE-0-STATUS.md)

---

## What you're signing

G0 clears **write testing on the Supabase dev branch only**. It does **not** authorize prod migrations, prod edge deploys, client sends, bucket flips, or turning Floor flags ON in production.

| | G0 allows | G0 does not allow |
|---|---|---|
| **Database** | Apply Floor migrations on dev branch `klnygbbmognbslgobmzc` | Prod schema changes (that's G1, later) |
| **Edge** | Deploy `floor-action` + updated `hermes-chat` to **dev** | Prod function deploys |
| **Flags** | Dev secrets for testing (`FLOOR_COCKPIT_ENABLED` stays OFF until demo) | `VITE_LEWIS_FLOOR_COCKPIT_ENABLED` or prod Floor flags ON |
| **Clients** | Internal dev smoke tests only | Any email/SMS to a real client |

**Prod stays dark.** `LEWIS_ALLOW_PROD_WRITES` stays unset until G0 **and** G1.

---

## Already done in code (you're not signing blind)

These are staged in the repo and tested. G0 is permission to **apply and deploy them on dev**.

- Unified roadmap + 4 locked ADRs (`docs/adr/001` through `004`)
- Spine A + D migrations, plus `resolve_account` RPC, `pg_trgm`, `hermes_app` role migrations
- `floor-action` edge function (internal packages + feedback; **no send path**)
- **`hermes-chat` FU-2 closed:** `redactPII` runs before live Hermes upstream (the model-boundary gap from the fence review)
- Floor flags documented in `.env.example` (all default OFF)
- **426 tests passing** in insureflow-ops
- `/floor` App Home overflow fixed in `lewis-the-floor` (needs Mac Mini rebuild after G0)

---

## Your six decisions (check each, add initials)

Read the **How to initial** column before you check the box. Item #1 must be a **done read-only confirmation**, not aspirational. Item #2 needs proof **in** [`docs/ops/pitr-check.md`](./ops/pitr-check.md) (paste the 6/29 verification there if not already).

| # | Decision | How to initial | Check | Initials |
|---|---|---|---|---|
| **1** | **Live source tables confirmed** for future `hermes` read views | Run read-only confirmation that `accounts`, `policies`, `documents`, `insured_emails`, and `account_aliases` exist with expected columns on prod (`lrqajzwcmdwahnjyidgv`). No schema change today. Initial only after the lookup is **done**, not "we'll confirm later." | [ ] | |
| **2** | **PITR enabled** on project `lrqajzwcmdwahnjyidgv` | PITR was verified **2026-06-29**. Paste dashboard proof into [`docs/ops/pitr-check.md`](./ops/pitr-check.md), then initial here. | [ ] | |
| **3** | **Dev-branch write testing approved** | Branch `klnygbbmognbslgobmzc` only. Not prod `lrqajzwcmdwahnjyidgv`. | [ ] | |
| **4** | **`hermes_app` least-privilege role approved** | Migration `20260701050000_floor_hermes_app_role.sql` applies on **dev** at G0. Same least-privilege discipline as the live proof work. | [ ] | |
| **5** | **`pg_trgm` path chosen** (pick **one**, initial the box you mean) | See **Item 5 detail** below. Do not initial blind. | [ ] | |
| **6** | **Bucket privacy: do NOT flip yet** | Timing note filled below. No private-bucket flip in Phase 0. | [ ] | |

### Item 5 detail (`pg_trgm`)

Initial **one** of these in the Notes column on item #5:

| Path | What you're saying | When it applies |
|---|---|---|
| **A — Already on prod** | `pg_trgm` is installed in the `extensions` schema on prod; dev migration is idempotent housekeeping only. | Confirm in Supabase SQL: `SELECT extname, nspname FROM pg_extension e JOIN pg_namespace n ON e.extnamespace = n.oid WHERE extname = 'pg_trgm';` |
| **B — Approve queued migration** | Approve `20260701040000_floor_pg_trgm_extension.sql` to run on **dev now**; prod gets it at **G1** with the rest of the Floor migrations. | Use if prod confirmation is deferred but dev must not block. |

**Item 5 notes (circle A or B):** _________________________________________________

**Bucket timing note (item 6):** Hold until portal signed-URL readiness is proven; revisit at G1 or later. No flip in Phase 0.

---

## ADR shifts to register (no vote; just know)

These moved since early Floor docs. They are locked in ADRs 002, 003, and 004.

1. **`public.*` is canonical; `hermes.*` is Slack-delivery projection only.** Resolves the two-surface question: staff work canonical `public.*` data in the InsureFlow cockpit; the Mac Mini `hermes` layer projects to Slack. Consistent with in-app cockpit + Slack-as-reach.
2. **Landen to Kelli remarket moved from Phase 1 to Phase 5.** The old project-state §11 flagship DoD is re-sequenced. Internal wins and ID cards ship first; remarket lands with proactive/heartbeat work.
3. **One bridge, not two.** Cockpit uses `hermes-chat` only. Earlier handoffs said "hermes-proxy"; the deployable bridge is `hermes-chat`. Types from the proxy contract were folded into `_shared/floor/hermesBridgeContract.ts`. Same idea, consolidated.

---

## What G0 does **not** close (track separately)

G0 is dev-only. It does **not** close ungated send paths that already exist in **prod**:

- Legacy UI paths that can still reach `email-send` / `send-sms` without a Floor/Fence approval token
- `AIResultsActionBar` to SMS was fenced in code; prod deploy of the Fence gate is a **G1-ish** step

That is staff-triggered exposure, not an internet hole, but **signing G0 does not fix it**. To close it before G1, pull forward a separate small approval: **Fence prod deploy** (`clientSendApprovalGate` on all four send functions).

---

## Locked architecture summary

1. **Two R7 gates, layered:** Floor orchestrates + undo hold; Fence stays the provider boundary (`floor_action:` tokens).
2. **`public.*` canonical;** `hermes.*` delivery projection (see ADR shifts above).
3. **Remarket in Phase 5** (see ADR shifts above).
4. **`hermes-chat` bridge only** (see ADR shifts above).

Full rationale: [`docs/adr/`](./adr/)

---

## What happens the day after you sign

Dev team runs this sequence (no prod, no client contact):

1. Apply migrations on dev: Spine D → Spine A → pg_trgm → resolve_account → hermes_app  
2. Regenerate `src/integrations/supabase/types.ts`  
3. Deploy `floor-action` + `hermes-chat` to dev Supabase  
4. Smoke-test: in-force view query, `resolve_account` RPC, internal package create via `floor-action`  
5. Mac Mini: `npm run build` in `lewis-the-floor`, load launchd, confirm `/floor` works  
6. Update [`THE-FLOOR-PHASE-0-STATUS.md`](./THE-FLOOR-PHASE-0-STATUS.md) and send Brian the status for DoD review **before G1**

**Target:** Phase 0 DoD complete on dev within ~1 week of G0.

---

## Sign-off

**G0 APPROVED / GREENLIT** — Brian Lewis, **2026-07-01**

I approve Floor Phase 0, **DEV-BRANCH WORK ONLY**, per this document. Prod stays dark.

| Item | Record |
|---|---|
| **#1 Source tables** | PASS — [`docs/ops/g0-source-table-verification.md`](./ops/g0-source-table-verification.md) |
| **#2 PITR** | Verified 2026-06-29; re-confirmed G0 — [`docs/ops/pitr-check.md`](./ops/pitr-check.md) |
| **#3 Dev branch** | Approved: `klnygbbmognbslgobmzc` only |
| **#4 hermes_app** | Approved (dev apply) |
| **#5 pg_trgm** | **Path A** — already on prod — [`docs/ops/g0-pg-trgm-verification.md`](./ops/g0-pg-trgm-verification.md) |
| **#6 Bucket** | Hold; no flip in Phase 0 |

| | |
|---|---|
| **Name** | Brian Lewis |
| **Signature / initials** | BL |
| **Date** | 2026-07-01 |

---

## Quick links

| Doc | Purpose |
|---|---|
| [`THE-FLOOR-UNIFIED-ROADMAP.md`](./THE-FLOOR-UNIFIED-ROADMAP.md) | Full 7-phase plan |
| [`THE-FLOOR-PHASE-0-STATUS.md`](./THE-FLOOR-PHASE-0-STATUS.md) | Living Phase 0 tracker |
| [`docs/ops/pitr-check.md`](./ops/pitr-check.md) | PITR proof form (item 2) |
| [`docs/adr/`](./adr/) | Locked decisions 001–004 |

**Next gate after G0:** G1 prod migration apply (after dev soak + Brian DoD review). **Not part of this sign-off.**
