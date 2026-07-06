-- 20260706220000_submission_packets_bucket.sql
--
-- Declare the PRIVATE storage bucket for generated GL submission packets
-- (ACORD 125 + 126, filled + flattened + merged by the
-- generate-submission-packet edge function). The bucket already exists in
-- prod (created out-of-band); this migration makes the repo the source of
-- truth, and on conflict do nothing keeps it a no-op there.
--
-- public = false is load-bearing: packet objects are NEVER served publicly.
-- They are reachable only through short-lived signed URLs
-- (createSignedUrl, 3600 seconds) minted by the edge function for
-- authenticated staff callers; there are no storage.objects RLS grants for
-- this bucket, so the anon/authenticated roles cannot read it directly.

insert into storage.buckets (id, name, public)
values ('submission-packets', 'submission-packets', false)
on conflict (id) do nothing;
