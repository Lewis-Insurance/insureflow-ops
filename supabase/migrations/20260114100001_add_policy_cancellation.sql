-- ============================================
-- Migration: Add Policy Cancellation Fields
-- Issue addressed: #3 from Management System Bug Fixes
-- ============================================

-- ============================================
-- PART 1: Add cancelled_at and cancellation_reason columns
-- ============================================
ALTER TABLE public.policies
ADD COLUMN IF NOT EXISTS cancelled_at DATE;

ALTER TABLE public.policies
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

COMMENT ON COLUMN public.policies.cancelled_at IS
  'Scheduled or actual cancellation date. If future date, policy remains active until this date.';

COMMENT ON COLUMN public.policies.cancellation_reason IS
  'Reason for cancellation (optional)';

-- ============================================
-- PART 2: Add index for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_policies_cancelled_at
ON public.policies(cancelled_at)
WHERE cancelled_at IS NOT NULL;

-- ============================================
-- PART 3: Add view for active policies (considering scheduled cancellations)
-- ============================================
CREATE OR REPLACE VIEW public.v_active_policies AS
SELECT
  p.*,
  CASE
    WHEN p.cancelled_at IS NOT NULL AND p.cancelled_at > CURRENT_DATE THEN 'scheduled_cancellation'
    WHEN p.cancelled_at IS NOT NULL AND p.cancelled_at <= CURRENT_DATE THEN 'cancelled'
    ELSE p.status
  END AS display_status,
  CASE
    WHEN p.cancelled_at IS NOT NULL AND p.cancelled_at > CURRENT_DATE THEN true
    ELSE false
  END AS is_scheduled_cancellation
FROM public.policies p
WHERE p.deleted_at IS NULL
  AND (p.status = 'active' OR (p.cancelled_at IS NOT NULL AND p.cancelled_at > CURRENT_DATE));

COMMENT ON VIEW public.v_active_policies IS
  'Active policies including those scheduled for future cancellation';

-- ============================================
-- ROLLBACK SCRIPT (save separately)
-- ============================================
/*
-- To rollback this migration:
DROP VIEW IF EXISTS public.v_active_policies;
DROP INDEX IF EXISTS idx_policies_cancelled_at;
ALTER TABLE public.policies DROP COLUMN IF EXISTS cancelled_at;
ALTER TABLE public.policies DROP COLUMN IF EXISTS cancellation_reason;
*/
