-- ============================================================================
-- ADD LEAD_SOURCE COLUMN TO LEADS TABLE
-- ============================================================================
-- Required for Canopy Connect integration to track where leads come from
-- ============================================================================

-- Add lead_source column if it doesn't exist
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_source TEXT;

-- Create index for efficient filtering by source
CREATE INDEX IF NOT EXISTS idx_leads_lead_source ON leads(lead_source);

-- Comment for documentation
COMMENT ON COLUMN leads.lead_source IS 'Source of the lead (canopy_import, manual, web_form, referral, etc.)';
