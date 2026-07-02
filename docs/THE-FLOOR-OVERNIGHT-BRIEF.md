# The Floor — Overnight Build Brief

**Repo:** insureflow-ops  
**Branch:** feat/floor-v1-spine (create from current branch)  
**Authority:** docs/THE-FLOOR-HANDOFF-ARCHITECTURE.md §8  
**Mode:** Autonomous. No human questions. No prod/dev DB apply. No edge deploy.

## Defaults (Brian decisions deferred)
- RESOLVE_ACCOUNT_AUTO_THRESHOLD = 0.9
- CLIENT_SEND_UNDO_HOLD_SECONDS = 30
- ID card owner: unassigned (Play 4 stub only)

## Hard stops
- Do NOT run supabase db push / migration apply to remote
- Do NOT deploy edge functions
- Do NOT commit .env or secrets
- Play 2 (activity logging) is OUT OF SCOPE (FL consent blocker)

## Goal 1 — Spine A migrations (staged SQL)
Create migrations for:
- automation_work_requests + automation_work_request_events
- decision_packages
- feedback_events
- floor_client_send_approvals (Floor contract; do not break Fence client_send_approvals)

**Done when:** SQL files exist, valid, match handoff spec §4.1–4.2–4.4–4.7

## Goal 2 — Spine D: policy_in_force_status view
**Done when:** migration SQL + comment/tests documenting in_force logic

## Goal 3 — Spine B + C modules + inbound fix
- supabase/functions/_shared/floor/* (types, mailSkillRouter, resolveAccount, stageClientSend)
- Fix email-inbound-lite ensureProfileByEmail (resolve accounts/insured_emails first)
- Unit tests with mocks

**Done when:** tests pass; stageClientSend wraps SendCOIEmailRequest shape exactly

## Goal 4 — Play stubs + golden fixtures
- Play 1 (reconciliation read) and Play 3 (suspense sweep) stubs
- Golden fixtures for router, resolve, coverage diff
- Align src/floor/types.ts with DecisionPackage fields

**Done when:** npm run test:run && npm run typecheck pass

## Morning deliverable
- docs/THE-FLOOR-OVERNIGHT-STATUS.md: what shipped, what's blocked, suggested first prod step
