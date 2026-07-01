# ADR 002: `public.*` canonical schema, `hermes.*` delivery projection

**Status:** Accepted  
**Date:** July 2026  
**Deciders:** Brian Lewis, Floor architecture review

## Context

Two parallel decision-package models exist today. `hermes.decision_packages` (`lewis-the-floor`, migration `20260626170000_slack_workspace_operator.sql`) was built Slack-first. Slack Approve writes only hermes-side state (`floorRuntime.ts:52-67`). The CRM and Postgres E&O trail never see that row.

Spine A (`supabase/migrations/20260701010000_floor_spine_a_contract_tables.sql`) models the full contract in `public.*`: `automation_work_requests`, `decision_packages`, `feedback_events`, `floor_client_send_approvals`, with RLS and an audit child table.

There can be only one row a human's approval attaches to, or the R7 audit means nothing.

## Decision

1. **`public.*` is the system of record.** All WorkRequests, DecisionPackages, FeedbackEvents, and client-send approvals live in `public.*`. A human never approves anything that exists only in `hermes.*`.

2. **`hermes.decision_packages` becomes a thin Slack delivery projection.** It holds only Slack-specific state: `slack_channel_id`, `slack_message_ts`, `revision`, `rendered_hash`. It is keyed by `decision_package_id` pointing at the canonical `public.decision_packages` row.

3. **`hermes.agents` stays the agent-identity table.** It holds seeded `slack_user_id` bindings. Expose it to the CRM via a read view so the cockpit gets per-employee identity.

4. **`hermes_app` role.** Grant least-privilege access to the public Floor tables so the Mac Mini reads and writes canonical rows.

5. **One action endpoint.** All three surfaces (Slack, cockpit, email) call one Floor action endpoint that persists `public.decision_packages` and routes Approve / Edit / Kill verbs.

## Consequences

**Positive.** One source of truth for R7 audit. The CRM, Slack, and email all render the same package row. Slack keeps working machinery (dedupe, stale-guard, message timestamps) without being a second writable truth.

**Negative.** Migration work in Phase 0 and Phase 1 to swap Slack from fixtures to live `public.*` rows and demote hermes-side writes.

**Neutral.** `hermes.slack_event_dedupe` and channel-operation tables stay hermes-scoped. They are delivery infrastructure, not approval truth.

**Follow-up.** Phase 0 deploys the action endpoint on dev. Phase 1 completes the fixture-to-live seam on both Slack and the cockpit. The cockpit must not become a third approval path.
