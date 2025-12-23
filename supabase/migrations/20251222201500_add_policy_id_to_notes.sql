-- Add policy_id to notes so notes can be associated to a specific policy (in addition to account/customer).
-- Idempotent and safe to re-run.

ALTER TABLE public.notes
ADD COLUMN IF NOT EXISTS policy_id uuid REFERENCES public.policies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notes_policy_id ON public.notes(policy_id);


