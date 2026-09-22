-- The nightly-or-hourly job that keeps the Haven feed agreeing with the book.
--
-- Run this by hand in the Supabase SQL editor on the hosted project, after
-- 20260922060000_haven_feed_reconcile.sql is applied and the integration you
-- want reconciled is enabled. Do not run it from a build, and do not commit
-- values. Replace <integration-id> with the real one.
--
-- Unlike most scheduled work here this needs no Vault secret, no anon key and no
-- HTTP: haven_feed_reconcile is a plain SQL function, so pg_cron calls it
-- directly. Nothing leaves the database.
--
-- The job is idempotent in two independent ways, which is the point of it:
--   * an existing job of the same name is unscheduled first, so re-running this
--     file replaces rather than duplicates the schedule
--   * a reconcile pass with nothing to do publishes nothing and withdraws
--     nothing, so running it too often is wasteful rather than harmful
--
-- CADENCE
--
-- Haven's reader hides a summary once authorization_checked_at + ttl_seconds has
-- passed, and the agreed freshness is 24 hours. This job is only half of that
-- clock — Haven's own poll is the other half — but there is no point in Haven
-- polling more often than the book is reconciled. Hourly gives 24x headroom
-- against the TTL and makes a withdrawal effective within the hour. A change
-- made in InsureFlow is visible in Haven within one reconcile plus one poll.

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('haven-feed-reconcile')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'haven-feed-reconcile');

SELECT cron.schedule(
  'haven-feed-reconcile',
  '7 * * * *',  -- hourly at :07, off the top of the hour so it does not pile up
                -- with everything else scheduled on the hour
  $$SELECT public.haven_feed_reconcile('<integration-id>'::uuid)$$
);

-- Verify:
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'haven-feed-reconcile';
--   SELECT status, return_message, start_time
--     FROM cron.job_run_details
--    WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'haven-feed-reconcile')
--    ORDER BY start_time DESC LIMIT 5;
--
-- A failing run leaves return_message set and does NOT retry before the next
-- hour. That is deliberate: a reconcile that could not run is a difference the
-- next pass finds, not work that was lost.
