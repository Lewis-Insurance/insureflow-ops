-- ── ao_renewal_follow_ups ─────────────────────────────────────────────────────
-- Child table that tracks every follow-up set, completed, or cleared for a renewal.
-- The parent ao_renewals.follow_up_date/reason/task_id cols are kept as a fast-read
-- shortcut and are kept in sync by the trigger below.

CREATE TABLE IF NOT EXISTS public.ao_renewal_follow_ups (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  renewal_id        uuid        NOT NULL REFERENCES public.ao_renewals(id) ON DELETE CASCADE,
  follow_up_date    date        NOT NULL,
  reason            text        NULL,
  status            text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'completed', 'cleared')),
  completed_at      timestamptz NULL,
  completion_note   text        NULL,
  task_id           uuid        NULL REFERENCES public.tasks(id) ON DELETE SET NULL,
  created_by        uuid        NULL REFERENCES auth.users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Only one pending follow-up per renewal at a time
CREATE UNIQUE INDEX IF NOT EXISTS ao_renewal_follow_ups_one_pending
  ON public.ao_renewal_follow_ups (renewal_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_ao_renewal_follow_ups_renewal_id
  ON public.ao_renewal_follow_ups (renewal_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Match the same pattern as ao_renewal_notes: any active agency staff member
-- can access follow-up records.
ALTER TABLE public.ao_renewal_follow_ups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ao_follow_ups_staff_select" ON public.ao_renewal_follow_ups;
CREATE POLICY "ao_follow_ups_staff_select" ON public.ao_renewal_follow_ups
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.agency_workspace_memberships m
      WHERE m.user_id = auth.uid() AND m.status = 'active'
    )
  );

DROP POLICY IF EXISTS "ao_follow_ups_staff_insert" ON public.ao_renewal_follow_ups;
CREATE POLICY "ao_follow_ups_staff_insert" ON public.ao_renewal_follow_ups
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agency_workspace_memberships m
      WHERE m.user_id = auth.uid() AND m.status = 'active'
    )
  );

DROP POLICY IF EXISTS "ao_follow_ups_staff_update" ON public.ao_renewal_follow_ups;
CREATE POLICY "ao_follow_ups_staff_update" ON public.ao_renewal_follow_ups
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.agency_workspace_memberships m
      WHERE m.user_id = auth.uid() AND m.status = 'active'
    )
  );

-- ── Trigger: keep ao_renewals shortcut cols in sync ───────────────────────────
CREATE OR REPLACE FUNCTION sync_ao_renewals_follow_up_shortcut()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    -- A pending row was inserted or updated to pending — push up to parent
    UPDATE public.ao_renewals
    SET follow_up_date   = NEW.follow_up_date,
        follow_up_reason = NEW.reason,
        follow_up_task_id = NEW.task_id,
        updated_at        = now()
    WHERE id = NEW.renewal_id;
  ELSE
    -- Row completed or cleared — null out parent shortcut only if this
    -- was the row driving the parent (same date/reason match)
    UPDATE public.ao_renewals
    SET follow_up_date    = NULL,
        follow_up_reason  = NULL,
        follow_up_task_id = NULL,
        updated_at        = now()
    WHERE id = NEW.renewal_id
      AND (follow_up_date = OLD.follow_up_date OR follow_up_date IS NULL);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ao_follow_ups_sync ON public.ao_renewal_follow_ups;
CREATE TRIGGER trg_ao_follow_ups_sync
  AFTER INSERT OR UPDATE ON public.ao_renewal_follow_ups
  FOR EACH ROW EXECUTE FUNCTION sync_ao_renewals_follow_up_shortcut();

-- ── updated_at auto-stamp ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_ao_renewal_follow_up_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_ao_follow_ups_updated_at ON public.ao_renewal_follow_ups;
CREATE TRIGGER trg_ao_follow_ups_updated_at
  BEFORE UPDATE ON public.ao_renewal_follow_ups
  FOR EACH ROW EXECUTE FUNCTION touch_ao_renewal_follow_up_updated_at();

-- ── Backfill: migrate existing active follow-ups ──────────────────────────────
INSERT INTO public.ao_renewal_follow_ups
  (renewal_id, follow_up_date, reason, status, task_id, created_at, updated_at)
SELECT
  id,
  follow_up_date::date,
  follow_up_reason,
  'pending',
  follow_up_task_id,
  now(),
  now()
FROM public.ao_renewals
WHERE follow_up_date IS NOT NULL
ON CONFLICT DO NOTHING;
