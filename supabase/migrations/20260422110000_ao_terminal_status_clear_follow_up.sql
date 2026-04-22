-- Fix B-v2-2: When ao_renewals.follow_up_date or follow_up_reason transitions
-- from non-null to null (terminal status or manual clear), clear any pending
-- ao_renewal_follow_ups row and its linked task so the partial unique index
-- doesn't block future follow-up inserts.

CREATE OR REPLACE FUNCTION public.clear_ao_renewal_pending_follow_up()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task_id uuid;
BEGIN
  -- Only act when a shortcut col goes null (terminal status clear)
  IF (OLD.follow_up_date IS NOT NULL AND NEW.follow_up_date IS NULL)
     OR (OLD.follow_up_reason IS NOT NULL AND NEW.follow_up_reason IS NULL) THEN

    -- Grab task_id before updating the row
    SELECT task_id INTO v_task_id
    FROM public.ao_renewal_follow_ups
    WHERE renewal_id = NEW.id AND status = 'pending'
    LIMIT 1;

    -- Clear the pending child row
    UPDATE public.ao_renewal_follow_ups
    SET status = 'cleared',
        completed_at = now(),
        updated_at = now()
    WHERE renewal_id = NEW.id
      AND status = 'pending';

    -- Complete the linked task if one exists
    IF v_task_id IS NOT NULL THEN
      UPDATE public.tasks
      SET status = 'completed',
          completed_at = now(),
          updated_at = now()
      WHERE id = v_task_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ao_renewals_clear_pending_follow_up ON public.ao_renewals;

CREATE TRIGGER trg_ao_renewals_clear_pending_follow_up
AFTER UPDATE OF follow_up_date, follow_up_reason ON public.ao_renewals
FOR EACH ROW
EXECUTE FUNCTION public.clear_ao_renewal_pending_follow_up();
