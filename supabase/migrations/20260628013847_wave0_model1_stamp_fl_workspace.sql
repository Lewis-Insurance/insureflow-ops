-- =====================================================================
-- Wave 0 · MODEL-1 — Stamp the 187 FL workspace-NULL accounts
-- =====================================================================
-- Purpose : 194 active accounts have agency_workspace_id IS NULL (tenant gap).
--           Single tenant => destination is unambiguous. Stamp ONLY the 187
--           that are state='FL'. The 7 non-FL / no-policy rows are PARKED for
--           human review (NOT stamped here).
-- Type    : Additive DML (fills NULLs only; no data destroyed).
-- Safety  : Snapshot captured first => fully reversible. Idempotent (re-run
--           affects 0 rows). type/account_type unchanged, so sync_account_types
--           is a no-op; search_vector trigger does not fire (workspace col).
-- Reverse : UPDATE accounts SET agency_workspace_id = NULL
--             WHERE id IN (SELECT id FROM cleanup.model1_stamp_snapshot);
-- Baseline: 194 ws-NULL active = 187 FL (stamp) + 7 review.  Date: 2026-06-27
-- =====================================================================

-- Internal staging/audit schema (not exposed via PostgREST; service-role only).
CREATE SCHEMA IF NOT EXISTS cleanup;
COMMENT ON SCHEMA cleanup IS
  'Internal staging/audit/snapshot artifacts for the 2026-06 data-integrity cleanup. Not API-exposed; RLS-enabled, service-role only.';

-- Snapshot the exact pre-image set (idempotent: first run only).
CREATE TABLE IF NOT EXISTS cleanup.model1_stamp_snapshot (
  id               uuid PRIMARY KEY,
  old_workspace_id uuid,
  state            text,
  acct_type        text,
  captured_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cleanup.model1_stamp_snapshot ENABLE ROW LEVEL SECURITY;

INSERT INTO cleanup.model1_stamp_snapshot (id, old_workspace_id, state, acct_type)
SELECT a.id, a.agency_workspace_id, a.state, a.type::text
FROM accounts a
WHERE a.deleted_at IS NULL
  AND a.agency_workspace_id IS NULL
  AND a.state = 'FL'
ON CONFLICT (id) DO NOTHING;

-- Stamp ONLY the 187 FL workspace-NULL accounts to the single tenant.
UPDATE accounts
SET agency_workspace_id = 'f1f07037-3032-45f8-93ca-72c0f47e4fbb'
WHERE deleted_at IS NULL
  AND agency_workspace_id IS NULL
  AND state = 'FL';
-- expected rowcount: 187
