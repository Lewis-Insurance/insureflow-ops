-- Add DEFAULT auth.uid() to the per-user FK columns on the non-AO renewal
-- child tables. Mirrors 20260511000000_ao_child_created_by_default for the
-- AO module: the client-side inserts don't send these columns, so they
-- previously failed the NOT NULL constraint. With this default, the JWT's
-- auth.uid() fills the column on insert.
--
-- Affected actions: "Log Call" / "Log Contact", "Add Note", "Add Quote",
-- "Upload Document" on /renewals/:id.

ALTER TABLE public.renewal_contact_log
  ALTER COLUMN contacted_by SET DEFAULT auth.uid();

ALTER TABLE public.renewal_notes
  ALTER COLUMN created_by SET DEFAULT auth.uid();

ALTER TABLE public.renewal_quotes
  ALTER COLUMN created_by SET DEFAULT auth.uid();

ALTER TABLE public.renewal_documents
  ALTER COLUMN uploaded_by SET DEFAULT auth.uid();
