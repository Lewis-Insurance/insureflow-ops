-- AO Renewals command-surface upgrade
-- Adds follow-up scheduling and waiting-on-insured workflow support.

ALTER TABLE public.ao_renewals
ADD COLUMN IF NOT EXISTS follow_up_date DATE,
ADD COLUMN IF NOT EXISTS quoted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS waiting_on_insured_since TIMESTAMPTZ;

ALTER TABLE public.ao_renewals DROP CONSTRAINT IF EXISTS ao_renewals_status_check;
ALTER TABLE public.ao_renewals ADD CONSTRAINT ao_renewals_status_check
CHECK (status IN ('pending', 'contacted', 'quoted', 'waiting_on_insured', 'renewed', 'lost', 'cancelled', 'moved'));

CREATE INDEX IF NOT EXISTS idx_ao_renewals_follow_up_date ON public.ao_renewals(follow_up_date)
  WHERE follow_up_date IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tr_ao_renewals_status_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'quoted' THEN
      NEW.quoted_at := COALESCE(NEW.quoted_at, NOW());
      NEW.waiting_on_insured_since := NULL;
    ELSIF NEW.status = 'waiting_on_insured' THEN
      NEW.waiting_on_insured_since := COALESCE(NEW.waiting_on_insured_since, NOW());
    ELSIF NEW.status IN ('pending', 'contacted', 'renewed', 'lost', 'cancelled', 'moved') THEN
      NEW.waiting_on_insured_since := NULL;
      IF NEW.status <> 'quoted' THEN
        NEW.quoted_at := CASE WHEN NEW.status = 'quoted' THEN COALESCE(NEW.quoted_at, NOW()) ELSE NEW.quoted_at END;
      END IF;
    END IF;
  END IF;

  IF NEW.status IN ('renewed', 'lost', 'cancelled', 'moved') THEN
    NEW.follow_up_date := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS tr_ao_renewals_status_timestamps ON public.ao_renewals;
CREATE TRIGGER tr_ao_renewals_status_timestamps
BEFORE UPDATE ON public.ao_renewals
FOR EACH ROW
EXECUTE FUNCTION public.tr_ao_renewals_status_timestamps();

UPDATE public.ao_renewals
SET quoted_at = CASE
      WHEN status = 'quoted' AND quoted_at IS NULL THEN updated_at
      ELSE quoted_at
    END,
    waiting_on_insured_since = CASE
      WHEN status = 'waiting_on_insured' AND waiting_on_insured_since IS NULL THEN updated_at
      ELSE waiting_on_insured_since
    END
WHERE status IN ('quoted', 'waiting_on_insured');

CREATE OR REPLACE VIEW public.ao_renewals_pipeline_summary AS
SELECT
  COUNT(*) AS total_renewals,
  COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
  COUNT(*) FILTER (WHERE status = 'contacted') AS contacted_count,
  COUNT(*) FILTER (WHERE status = 'quoted') AS quoted_count,
  COUNT(*) FILTER (WHERE status = 'waiting_on_insured') AS waiting_on_insured_count,
  COUNT(*) FILTER (WHERE status = 'renewed') AS renewed_count,
  COUNT(*) FILTER (WHERE status = 'moved') AS moved_count,
  COUNT(*) FILTER (WHERE status IN ('lost', 'cancelled')) AS lost_count,
  COUNT(*) FILTER (WHERE follow_up_date < CURRENT_DATE AND status IN ('contacted', 'quoted', 'waiting_on_insured')) AS overdue_follow_up_count,
  COUNT(*) FILTER (WHERE renewal_date <= CURRENT_DATE + INTERVAL '30 days' AND status = 'pending') AS pending_within_30_days_count,
  COUNT(*) FILTER (WHERE renewal_date <= CURRENT_DATE + INTERVAL '5 days' AND status IN ('contacted', 'quoted', 'waiting_on_insured')) AS active_within_5_days_count
FROM public.ao_renewals;

GRANT SELECT ON public.ao_renewals_pipeline_summary TO authenticated;
