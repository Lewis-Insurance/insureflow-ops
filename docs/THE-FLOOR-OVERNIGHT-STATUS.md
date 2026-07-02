# The Floor — Overnight Build Status

**Branch:** `feat/floor-v1-spine`  
**Completed:** 2026-07-01 (autonomous overnight brief)  
**Authority:** `docs/THE-FLOOR-OVERNIGHT-BRIEF.md` + `docs/THE-FLOOR-HANDOFF-ARCHITECTURE.md` §8

---

## Summary

All four overnight goals are **implemented on branch, staged locally, not applied to prod/dev Supabase**. Migrations are SQL-only. Edge functions were **not deployed**. Fence `client_send_approvals` (20260630040000) is untouched.

---

## Goal 1 — Spine A migrations ✅

| Artifact | Path |
|----------|------|
| Contract tables | `supabase/migrations/20260701010000_floor_spine_a_contract_tables.sql` |

**Shipped tables:**
- `automation_work_requests` + lifecycle status enum
- `automation_work_request_events`
- `decision_packages`
- `feedback_events`
- `floor_client_send_approvals` (Floor R7; separate from Fence approvals)

RLS: staff read via workspace membership; writes intended for service-role edge paths.

---

## Goal 2 — Spine D: `policy_in_force_status` ✅

| Artifact | Path |
|----------|------|
| View migration | `supabase/migrations/20260701020000_floor_spine_d_policy_in_force_status.sql` |
| TS mirror + tests | `src/floor/spine/coverageDiff.ts` → `evaluatePolicyInForce()` |

**In-force rule:** not deleted/cancelled; status not cancelled/expired/pending_cancel; within effective/expiration dates; active/bound/pending.

---

## Goal 3 — Spine B + C modules + inbound fix ✅

| Module | Path |
|--------|------|
| Types + constants | `src/floor/spine/types.ts`, `constants.ts` |
| MailSkillRouter | `src/floor/spine/mailSkillRouter.ts` |
| resolve-account ladder | `src/floor/spine/resolveAccount.ts` |
| stage_client_send chokepoint | `src/floor/spine/stageClientSend.ts` |
| Edge copies | `supabase/functions/_shared/floor/*` |
| email-inbound-lite fix | `supabase/functions/email-inbound-lite/index.ts` — resolves `profiles` → `accounts` / `insured_emails` before insert; removed dead `customer_identities` path |

**Defaults applied:** `RESOLVE_ACCOUNT_AUTO_THRESHOLD = 0.9`, `CLIENT_SEND_UNDO_HOLD_SECONDS = 30`.

**Send flow:** `stageClientSend()` validates approval row, recipient on-file, cert access hooks, places **held** undo window; `releaseHeldClientSend()` fires Resend wrapper after hold expires. Wraps `SendCOIEmailRequest` exactly.

---

## Goal 4 — Play stubs + golden fixtures ✅

| Play | Path |
|------|------|
| Play 1 carrier reconciliation stub | `src/floor/spine/plays/carrierReconciliation.ts` |
| Play 3 suspense sweep stub | `src/floor/spine/plays/suspenseSweep.ts` |
| Golden fixtures | `src/floor/spine/fixtures/golden.ts` |
| DecisionPackage ↔ card preview | `src/floor/types.ts` (`decisionPackageToPreview`) |
| Tests | `src/__tests__/floor/spine.test.ts` (11 tests) |

---

## Verification

| Check | Result |
|-------|--------|
| `npm run test:run` | **418 passed**, 1 skipped |
| `npx tsc -p tsconfig.app.json --noEmit` | **pass** |
| Remote migration apply | **not run** (per brief) |
| Edge deploy | **not run** (per brief) |

---

## Still blocked (needs Brian / prod gate)

1. **Apply migrations** to dev branch `klnygbbmognbslgobmzc` first, then prod after Phase 0 sign-off.
2. **Regenerate Supabase types** after apply (`supabase gen types typescript`).
3. **Wire Mac Mini** (`lewis-the-floor`) fixture → live swap: Slack Approve → CRM `stageClientSend` + DB rows.
4. **RPC `resolve_account` in Postgres** — TS ladder exists; SECURITY DEFINER RPC still to land (modeled on `import_resolve_account`).
5. **Play 2 activity logging** — out of scope (FL §934.03).
6. **Play 4 ID card one-tap** — stub only; owner unassigned per brief default.
7. **pg_trgm confirmation** on prod — fuzzy rung depends on it.
8. **Fence vs Floor approval tables** — coexist; future work may unify chokepoint paths.

---

## Suggested first prod step (Brian)

1. Review + apply **`20260701020000`** (view only, read-only) on **dev branch**.
2. Apply **`20260701010000`** on dev branch.
3. Regenerate types, deploy **`email-inbound-lite`** fix only.
4. Mac Mini: point card Approve handler at `floor_client_send_approvals` + `releaseHeldClientSend` path.

---

## Files added/changed (high level)

```
docs/THE-FLOOR-OVERNIGHT-BRIEF.md
docs/THE-FLOOR-OVERNIGHT-STATUS.md
docs/THE-FLOOR-HANDOFF-ARCHITECTURE.md (staged from main)
docs/THE-FLOOR-PROJECT-STATE.md (staged from main)
supabase/migrations/20260701010000_floor_spine_a_contract_tables.sql
supabase/migrations/20260701020000_floor_spine_d_policy_in_force_status.sql
supabase/functions/_shared/floor/*
supabase/functions/email-inbound-lite/index.ts
src/floor/spine/**
src/floor/types.ts
src/__tests__/floor/spine.test.ts
```
