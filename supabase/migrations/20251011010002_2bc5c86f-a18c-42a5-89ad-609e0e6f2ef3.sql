-- Add customer_identities table for email-to-profile mapping
CREATE TABLE IF NOT EXISTS public.customer_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(email)
);

-- Add inbound_allowlist table for email/SMS/voice filtering
CREATE TABLE IF NOT EXISTS public.inbound_allowlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL CHECK (channel IN ('email','sms','voice')),
  value TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inbound_allowlist ON public.inbound_allowlist(channel, value);

-- Enable RLS
ALTER TABLE public.customer_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_allowlist ENABLE ROW LEVEL SECURITY;

-- RLS policies for customer_identities (staff only)
DROP POLICY IF EXISTS "staff_manage_customer_identities" ON public.customer_identities;
CREATE POLICY "staff_manage_customer_identities"
  ON public.customer_identities FOR ALL
  USING (is_staff())
  WITH CHECK (is_staff());

-- RLS policies for inbound_allowlist (staff only)
DROP POLICY IF EXISTS "staff_manage_allowlist" ON public.inbound_allowlist;
CREATE POLICY "staff_manage_allowlist"
  ON public.inbound_allowlist FOR ALL
  USING (is_staff())
  WITH CHECK (is_staff());