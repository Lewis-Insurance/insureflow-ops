-- Update is_staff() to include 'agent' role
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.profiles 
    WHERE id = auth.uid() 
    AND (is_staff = true OR role IN ('agent', 'admin', 'staff'))
  );
$$;

-- Add RLS read policies for agents
DROP POLICY IF EXISTS "agents_read_customer_identities" ON public.customer_identities;
CREATE POLICY "agents_read_customer_identities"
  ON public.customer_identities FOR SELECT
  USING (is_staff());

DROP POLICY IF EXISTS "agents_read_allowlist" ON public.inbound_allowlist;
CREATE POLICY "agents_read_allowlist"
  ON public.inbound_allowlist FOR SELECT
  USING (is_staff());

-- Optional: unique constraint on phone for reverse lookup
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'customer_identities_phone_unique'
  ) THEN
    ALTER TABLE public.customer_identities
      ADD CONSTRAINT customer_identities_phone_unique UNIQUE (phone);
  END IF;
END $$;