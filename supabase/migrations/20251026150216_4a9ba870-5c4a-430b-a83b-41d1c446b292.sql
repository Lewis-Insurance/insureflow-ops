-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule the renewal risk batch calculation to run daily at 2 AM
SELECT cron.schedule(
  'daily-renewal-risk-calculation',
  '0 2 * * *', -- Every day at 2 AM
  $$
  SELECT
    net.http_post(
        url:='https://lrqajzwcmdwahnjyidgv.supabase.co/functions/v1/renewal-risk-batch',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxycWFqendjbWR3YWhuanlpZGd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcyODk5OTksImV4cCI6MjA3Mjg2NTk5OX0.Pyob4fMYhHjHhVCxhP2UdSSMAv6i9eqmLD-lxavfV5s"}'::jsonb,
        body:='{"days_ahead": 120}'::jsonb
    ) as request_id;
  $$
);