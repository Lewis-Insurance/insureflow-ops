-- Batch 5C — flip all SECURITY DEFINER public views to security_invoker=true.
-- Single-tenant: staff see all rows so results are unchanged; anon/portal now get
-- RLS-scoped results. Clears all 41 advisor "Security Definer View" ERRORs.
-- Verified: none of the 41 reference auth.users (only auth.uid(), invoker-safe).
-- DOWN: for each view, ALTER VIEW public.<name> SET (security_invoker = false);
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname FROM pg_class c
    WHERE c.relkind='v' AND c.relnamespace='public'::regnamespace
      AND NOT (coalesce(c.reloptions::text[],'{}') @> ARRAY['security_invoker=true']
            OR coalesce(c.reloptions::text[],'{}') @> ARRAY['security_invoker=on'])
  LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', r.relname);
  END LOOP;
END $$;
