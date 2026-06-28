# Phase-0 identity bridge — design decision (guardrail #3)

**Problem.** Levitate keys its entire send stack on `contacts.id` + `org_id`. `contacts` was deliberately
RETIRED in Wave 5 (its 26 inbound FKs were re-pointed onto `accounts`, and they stay there). The audience
lives in `accounts` keyed by `agency_workspace_id`.

**Decision — a DERIVED PROJECTION, not a resurrected entity.**
- We do **not** re-establish `contacts` as a source-of-truth entity and we do **not** re-point any Wave-5 FK
  back to it. `accounts` remains the single source of truth.
- We materialize a one-way **marketing-send projection**: one `contacts` row per emailable active account,
  tagged `source = 'phase0_account_projection'`, keyed back via `account_id` (`ON DELETE CASCADE`), with a
  partial-unique index so it's idempotent/regenerable and never hand-edited. (Migration `..220939`.)
- `org_id == agency_workspace_id == f1f07037-…` for this single tenant; it lives on the Levitate tables
  (`marketing_send_queue`, `communication_preferences`, `communication_evidence`), **not** on the contact.
- Suppression baseline is NOT pre-seeded: there are no known opt-outs/DNC/deceased to seed, and an absent
  `communication_preferences` row already means "allowed". Preferences accrue via the opt-out subsystem
  (`marketing-unsubscribe`) and bounce/complaint ingestion.

**Result.** 665 projected contacts = the 665 email-reachable cross-sell households (one contact per household's
contact account). Levitate's contact-keyed queue/prefs/evidence/opt-out-token all work against these rows
unchanged, while the entity model stays account-centric. Regenerate by re-running the projection insert.
