-- Migration: Add terminal status fields for renewals
-- Purpose: Support full details capture for cancelled, lapsed, non-renewed, lost, moved statuses

-- Add lapsed_reason field (similar to other reason fields)
ALTER TABLE public.renewals ADD COLUMN IF NOT EXISTS lapsed_reason TEXT;

-- Add termination_effective_date for tracking when termination takes effect
ALTER TABLE public.renewals ADD COLUMN IF NOT EXISTS termination_effective_date DATE;

-- Add renewal_premium to track the renewed premium amount
ALTER TABLE public.renewals ADD COLUMN IF NOT EXISTS renewal_premium NUMERIC(12,2);

-- Update the status check constraint to ensure all statuses are valid
-- First drop the existing constraint if it exists
DO $$
BEGIN
  ALTER TABLE public.renewals DROP CONSTRAINT IF EXISTS renewals_status_check;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- Add updated constraint with all valid statuses
ALTER TABLE public.renewals ADD CONSTRAINT renewals_status_check
  CHECK (status IN (
    'pending',      -- Initial state
    'contacted',    -- Customer has been contacted
    'quoted',       -- Quotes have been provided
    'renewed',      -- Successfully renewed
    'lost',         -- Lost to competitor
    'cancelled',    -- Customer cancelled
    'moved',        -- Moved to different carrier
    'non_renewed',  -- Carrier non-renewed
    'lapsed',       -- Policy lapsed (non-payment)
    'upcoming',     -- Legacy: upcoming renewal
    'in_progress',  -- Legacy: being worked
    'completed'     -- Legacy: completed
  ));

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_renewals_lapsed_reason ON public.renewals(lapsed_reason) WHERE lapsed_reason IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_renewals_termination_date ON public.renewals(termination_effective_date) WHERE termination_effective_date IS NOT NULL;

-- Comment on new columns
COMMENT ON COLUMN public.renewals.lapsed_reason IS 'Reason for policy lapse (non-payment, customer abandoned, administrative, other)';
COMMENT ON COLUMN public.renewals.termination_effective_date IS 'Effective date when the termination/cancellation takes effect';
COMMENT ON COLUMN public.renewals.renewal_premium IS 'The new premium amount after renewal';
