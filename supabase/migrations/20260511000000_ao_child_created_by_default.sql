-- Add DEFAULT auth.uid() to created_by on AO renewal child tables so inserts
-- no longer rely on the client doing supabase.auth.getUser() before issuing
-- the request. Pre-existing rows are untouched.

ALTER TABLE public.ao_renewal_notes
  ALTER COLUMN created_by SET DEFAULT auth.uid();

ALTER TABLE public.ao_renewal_contact_log
  ALTER COLUMN created_by SET DEFAULT auth.uid();

ALTER TABLE public.ao_renewal_follow_ups
  ALTER COLUMN created_by SET DEFAULT auth.uid();
