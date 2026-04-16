-- AO Renewals follow-up enhancement layer
-- Adds structured follow-up support and DB-side enforcement for waiting-on-insured discipline.

ALTER TABLE public.ao_renewals
ADD COLUMN IF NOT EXISTS follow_up_reason TEXT,
ADD COLUMN IF NOT EXISTS follow_up_note TEXT,
ADD COLUMN IF NOT EXISTS follow_up_completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS follow_up_cleared_at TIMESTAMPTZ;

ALTER TABLE public.ao_renewals DROP CONSTRAINT IF EXISTS ao_renewals_follow_up_reason_length;
ALTER TABLE public.ao_renewals
  ADD CONSTRAINT ao_renewals_follow_up_reason_length
  CHECK (follow_up_reason IS NULL OR char_length(follow_up_reason) <= 120);

ALTER TABLE public.ao_renewals DROP CONSTRAINT IF EXISTS ao_renewals_follow_up_note_length;
ALTER TABLE public.ao_renewals
  ADD CONSTRAINT ao_renewals_follow_up_note_length
  CHECK (follow_up_note IS NULL OR char_length(follow_up_note) <= 240);

CREATE OR REPLACE FUNCTION public.tr_ao_renewals_follow_up_guard()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'waiting_on_insured' AND NEW.follow_up_date IS NULL THEN
    RAISE EXCEPTION 'follow_up_date is required when status is waiting_on_insured';
  END IF;

  IF NEW.follow_up_date IS NOT NULL THEN
    NEW.follow_up_completed_at := NULL;
    NEW.follow_up_cleared_at := NULL;
  END IF;

  IF NEW.follow_up_date IS NULL AND OLD.follow_up_date IS NOT NULL THEN
    NEW.follow_up_cleared_at := COALESCE(NEW.follow_up_cleared_at, NOW());
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS tr_ao_renewals_follow_up_guard ON public.ao_renewals;
CREATE TRIGGER tr_ao_renewals_follow_up_guard
BEFORE INSERT OR UPDATE ON public.ao_renewals
FOR EACH ROW
EXECUTE FUNCTION public.tr_ao_renewals_follow_up_guard();
