-- =====================================================================
-- Batch 1B — the 7 workspace-NULL accounts (KEEP Joanne, soft-delete 6)
-- =====================================================================
-- Joanne Ducas (00fe662f, VT, 1 policy) -> stamp to the agency workspace.
-- The other 6 (AO Commercial Non-renewals, Ronald Lewis, Suzanne Rhoden-Mancini,
-- Jeremiah Garling, Emmett Mims, Seth Harrison; all 0 policies) -> soft-delete.
-- Reversible via cleanup.batch1b_snapshot. Verify: workspace-NULL active -> 0.
-- 2026-06-28
-- =====================================================================

CREATE TABLE IF NOT EXISTS cleanup.batch1b_snapshot (
  account_id uuid PRIMARY KEY, action text, old_workspace_id uuid, captured_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE cleanup.batch1b_snapshot ENABLE ROW LEVEL SECURITY;

INSERT INTO cleanup.batch1b_snapshot (account_id, action, old_workspace_id)
SELECT id,
  CASE WHEN id = '00fe662f-21f1-49fe-b295-814d1e525067' THEN 'stamp' ELSE 'soft_delete' END,
  agency_workspace_id
FROM public.accounts
WHERE deleted_at IS NULL AND agency_workspace_id IS NULL
ON CONFLICT (account_id) DO NOTHING;

-- KEEP Joanne Ducas: stamp to the single tenant.
UPDATE public.accounts SET agency_workspace_id = 'f1f07037-3032-45f8-93ca-72c0f47e4fbb'
WHERE id = '00fe662f-21f1-49fe-b295-814d1e525067' AND deleted_at IS NULL;

-- SOFT-DELETE the remaining 6 workspace-NULL accounts (now all that's left NULL).
UPDATE public.accounts SET deleted_at = now()
WHERE deleted_at IS NULL AND agency_workspace_id IS NULL;