-- ============================================================================
-- CONFIGURE CEO DIGEST RECIPIENTS
-- ============================================================================
-- This migration sets up recipients for the CEO Weekly Digest feature.
--
-- IMPORTANT: Update the email addresses below before running!
-- ============================================================================

-- Step 1: View existing agency workspaces and their current digest settings
-- (This is informational - run this SELECT first to see what's configured)
SELECT
  aw.id AS agency_workspace_id,
  aw.name AS agency_name,
  cds.enabled,
  cds.recipients,
  cds.timezone,
  cds.send_day_of_week,
  cds.send_time_local
FROM agency_workspaces aw
LEFT JOIN ceo_digest_settings cds ON cds.agency_workspace_id = aw.id
ORDER BY aw.name;

-- Step 2: Update recipients for the main agency workspace
-- EDIT THESE EMAIL ADDRESSES before running:
UPDATE ceo_digest_settings
SET
  recipients = '["brian@lewisinsurance.ai"]'::JSONB,
  enabled = TRUE,
  updated_at = NOW()
WHERE agency_workspace_id = 'a11a782a-e9aa-424e-a6c8-a3b3484d1c1b';

-- If no settings row exists yet, insert one:
INSERT INTO ceo_digest_settings (
  agency_workspace_id,
  enabled,
  timezone,
  send_day_of_week,
  send_time_local,
  recipients,
  include_pii,
  thresholds
)
SELECT
  'a11a782a-e9aa-424e-a6c8-a3b3484d1c1b',
  TRUE,
  'America/New_York',
  1, -- Monday
  '08:00',
  '["brian@lewisinsurance.ai"]'::JSONB,
  FALSE,
  '{
    "leads_drop_pct": 25,
    "quotes_drop_pct": 25,
    "overdue_tasks_critical": 10,
    "aging_quotes_days": 7,
    "canopy_reconnects_critical": 3,
    "canopy_errors_critical": 5
  }'::JSONB
WHERE NOT EXISTS (
  SELECT 1 FROM ceo_digest_settings
  WHERE agency_workspace_id = 'a11a782a-e9aa-424e-a6c8-a3b3484d1c1b'
);

-- Step 3: Verify the update
SELECT
  id,
  agency_workspace_id,
  enabled,
  recipients,
  timezone,
  send_day_of_week,
  send_time_local
FROM ceo_digest_settings
WHERE agency_workspace_id = 'a11a782a-e9aa-424e-a6c8-a3b3484d1c1b';
