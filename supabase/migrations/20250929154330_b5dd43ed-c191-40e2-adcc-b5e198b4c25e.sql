-- Fix storage RLS for customer-docs uploads
-- Ensure idempotency: drop then recreate policies
DROP POLICY IF EXISTS "customer-docs write staff" ON storage.objects;
DROP POLICY IF EXISTS "customer-docs update staff" ON storage.objects;
DROP POLICY IF EXISTS "customer-docs delete staff" ON storage.objects;
DROP POLICY IF EXISTS "customer-docs read staff" ON storage.objects;
DROP POLICY IF EXISTS "customer-docs read by membership" ON storage.objects;

CREATE POLICY "customer-docs write staff"
  ON storage.objects
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'customer-docs' AND public.is_staff()
  );

CREATE POLICY "customer-docs update staff"
  ON storage.objects
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'customer-docs' AND public.is_staff()
  )
  WITH CHECK (
    bucket_id = 'customer-docs' AND public.is_staff()
  );

CREATE POLICY "customer-docs delete staff"
  ON storage.objects
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'customer-docs' AND public.is_staff()
  );

CREATE POLICY "customer-docs read staff"
  ON storage.objects
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'customer-docs' AND public.is_staff()
  );

CREATE POLICY "customer-docs read by membership"
  ON storage.objects
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'customer-docs'
    AND (
      public.is_staff() OR EXISTS (
        SELECT 1 FROM public.account_memberships am
        WHERE am.user_id = auth.uid()
          AND (storage.foldername(objects.name))[1] = am.account_id::text
      )
    )
  );