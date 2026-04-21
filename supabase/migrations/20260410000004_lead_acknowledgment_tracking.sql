-- Add lead acknowledgment tracking columns
-- This tracks when a team member has seen/acknowledged a new lead

ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS acknowledged_by UUID REFERENCES auth.users(id);

-- Add index for efficient querying of unacknowledged leads
CREATE INDEX IF NOT EXISTS idx_leads_unacknowledged
ON public.leads (acknowledged_at)
WHERE acknowledged_at IS NULL;

-- Add index on source_details for Canopy lead queries
CREATE INDEX IF NOT EXISTS idx_leads_source_details
ON public.leads USING gin (source_details);

COMMENT ON COLUMN public.leads.acknowledged_at IS 'Timestamp when a team member acknowledged/viewed the lead';
COMMENT ON COLUMN public.leads.acknowledged_by IS 'User ID who acknowledged the lead';
