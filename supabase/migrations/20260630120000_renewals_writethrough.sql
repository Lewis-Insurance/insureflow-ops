-- Renewals write-through: in-progress draft columns + renewal_documents soft-delete.
--
-- The two-tier renewal model persists the agent's working edits (proposed new-term
-- effective/expiration/term) on the renewal row WITHOUT touching the policy until a
-- terminal commit (Renewed/Moved/Lost). These draft columns are NOT mirrored by
-- auto_sync_policy_to_renewal, so the draft is structurally safe from policy-side syncs.
--
-- Applied to PROD (lrqajzwcmdwahnjyidgv) via Supabase MCP on 2026-06-30.

ALTER TABLE public.renewals
  ADD COLUMN IF NOT EXISTS policy_term         text,
  ADD COLUMN IF NOT EXISTS new_effective_date  date,
  ADD COLUMN IF NOT EXISTS new_expiration_date date;

-- Mirror the policies.policy_term domain (6-month -> 'semiannual', 12-month -> 'annual').
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.renewals'::regclass
      AND conname  = 'renewals_policy_term_check'
  ) THEN
    ALTER TABLE public.renewals
      ADD CONSTRAINT renewals_policy_term_check
      CHECK (policy_term IS NULL OR policy_term IN ('semiannual', 'annual'));
  END IF;
END $$;

-- Soft-delete for renewal documents (invariant: soft deletes only).
ALTER TABLE public.renewal_documents
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_renewal_documents_active
  ON public.renewal_documents (renewal_id)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.renewals.policy_term         IS 'Draft policy term for the in-progress renewal (semiannual|annual); pushed to policies.policy_term on terminal commit.';
COMMENT ON COLUMN public.renewals.new_effective_date  IS 'Draft new-term effective date; pushed to policies.effective_date on terminal commit.';
COMMENT ON COLUMN public.renewals.new_expiration_date IS 'Draft new-term expiration date (derived from effective + term); pushed to policies.expiration_date on terminal commit.';
