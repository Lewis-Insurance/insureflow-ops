-- Enable RLS and add consistent access policies for insurance detail tables
-- Policy logic: users can access rows for leads that belong to accounts they are a member of
-- Uses account_memberships table to map user -> account, and leads.account_id

-- HOME
ALTER TABLE IF EXISTS public.lead_home_insurance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view insurance details for their account's leads" ON public.lead_home_insurance;
DROP POLICY IF EXISTS "Users can insert insurance details for their account's leads" ON public.lead_home_insurance;
DROP POLICY IF EXISTS "Users can update insurance details for their account's leads" ON public.lead_home_insurance;
DROP POLICY IF EXISTS "Users can delete insurance details for their account's leads" ON public.lead_home_insurance;

CREATE POLICY "Users can view insurance details for their account's leads"
ON public.lead_home_insurance
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.leads l
    JOIN public.account_memberships am ON l.account_id = am.account_id
    WHERE l.id = public.lead_home_insurance.lead_id
      AND am.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert insurance details for their account's leads"
ON public.lead_home_insurance
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.leads l
    JOIN public.account_memberships am ON l.account_id = am.account_id
    WHERE l.id = public.lead_home_insurance.lead_id
      AND am.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update insurance details for their account's leads"
ON public.lead_home_insurance
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.leads l
    JOIN public.account_memberships am ON l.account_id = am.account_id
    WHERE l.id = public.lead_home_insurance.lead_id
      AND am.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.leads l
    JOIN public.account_memberships am ON l.account_id = am.account_id
    WHERE l.id = public.lead_home_insurance.lead_id
      AND am.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete insurance details for their account's leads"
ON public.lead_home_insurance
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.leads l
    JOIN public.account_memberships am ON l.account_id = am.account_id
    WHERE l.id = public.lead_home_insurance.lead_id
      AND am.user_id = auth.uid()
  )
);

-- RENTERS
ALTER TABLE IF EXISTS public.lead_renters_insurance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view insurance details for their account's leads" ON public.lead_renters_insurance;
DROP POLICY IF EXISTS "Users can insert insurance details for their account's leads" ON public.lead_renters_insurance;
DROP POLICY IF EXISTS "Users can update insurance details for their account's leads" ON public.lead_renters_insurance;
DROP POLICY IF EXISTS "Users can delete insurance details for their account's leads" ON public.lead_renters_insurance;

CREATE POLICY "Users can view insurance details for their account's leads"
ON public.lead_renters_insurance
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.leads l
    JOIN public.account_memberships am ON l.account_id = am.account_id
    WHERE l.id = public.lead_renters_insurance.lead_id
      AND am.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert insurance details for their account's leads"
ON public.lead_renters_insurance
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.leads l
    JOIN public.account_memberships am ON l.account_id = am.account_id
    WHERE l.id = public.lead_renters_insurance.lead_id
      AND am.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update insurance details for their account's leads"
ON public.lead_renters_insurance
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.leads l
    JOIN public.account_memberships am ON l.account_id = am.account_id
    WHERE l.id = public.lead_renters_insurance.lead_id
      AND am.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.leads l
    JOIN public.account_memberships am ON l.account_id = am.account_id
    WHERE l.id = public.lead_renters_insurance.lead_id
      AND am.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete insurance details for their account's leads"
ON public.lead_renters_insurance
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.leads l
    JOIN public.account_memberships am ON l.account_id = am.account_id
    WHERE l.id = public.lead_renters_insurance.lead_id
      AND am.user_id = auth.uid()
  )
);

-- UMBRELLA
ALTER TABLE IF EXISTS public.lead_umbrella_insurance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view insurance details for their account's leads" ON public.lead_umbrella_insurance;
DROP POLICY IF EXISTS "Users can insert insurance details for their account's leads" ON public.lead_umbrella_insurance;
DROP POLICY IF EXISTS "Users can update insurance details for their account's leads" ON public.lead_umbrella_insurance;
DROP POLICY IF EXISTS "Users can delete insurance details for their account's leads" ON public.lead_umbrella_insurance;

CREATE POLICY "Users can view insurance details for their account's leads"
ON public.lead_umbrella_insurance
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.leads l
    JOIN public.account_memberships am ON l.account_id = am.account_id
    WHERE l.id = public.lead_umbrella_insurance.lead_id
      AND am.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert insurance details for their account's leads"
ON public.lead_umbrella_insurance
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.leads l
    JOIN public.account_memberships am ON l.account_id = am.account_id
    WHERE l.id = public.lead_umbrella_insurance.lead_id
      AND am.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update insurance details for their account's leads"
ON public.lead_umbrella_insurance
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.leads l
    JOIN public.account_memberships am ON l.account_id = am.account_id
    WHERE l.id = public.lead_umbrella_insurance.lead_id
      AND am.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.leads l
    JOIN public.account_memberships am ON l.account_id = am.account_id
    WHERE l.id = public.lead_umbrella_insurance.lead_id
      AND am.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete insurance details for their account's leads"
ON public.lead_umbrella_insurance
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.leads l
    JOIN public.account_memberships am ON l.account_id = am.account_id
    WHERE l.id = public.lead_umbrella_insurance.lead_id
      AND am.user_id = auth.uid()
  )
);

-- LIFE
ALTER TABLE IF EXISTS public.lead_life_insurance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view insurance details for their account's leads" ON public.lead_life_insurance;
DROP POLICY IF EXISTS "Users can insert insurance details for their account's leads" ON public.lead_life_insurance;
DROP POLICY IF EXISTS "Users can update insurance details for their account's leads" ON public.lead_life_insurance;
DROP POLICY IF EXISTS "Users can delete insurance details for their account's leads" ON public.lead_life_insurance;

CREATE POLICY "Users can view insurance details for their account's leads"
ON public.lead_life_insurance
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.leads l
    JOIN public.account_memberships am ON l.account_id = am.account_id
    WHERE l.id = public.lead_life_insurance.lead_id
      AND am.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert insurance details for their account's leads"
ON public.lead_life_insurance
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.leads l
    JOIN public.account_memberships am ON l.account_id = am.account_id
    WHERE l.id = public.lead_life_insurance.lead_id
      AND am.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update insurance details for their account's leads"
ON public.lead_life_insurance
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.leads l
    JOIN public.account_memberships am ON l.account_id = am.account_id
    WHERE l.id = public.lead_life_insurance.lead_id
      AND am.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.leads l
    JOIN public.account_memberships am ON l.account_id = am.account_id
    WHERE l.id = public.lead_life_insurance.lead_id
      AND am.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete insurance details for their account's leads"
ON public.lead_life_insurance
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.leads l
    JOIN public.account_memberships am ON l.account_id = am.account_id
    WHERE l.id = public.lead_life_insurance.lead_id
      AND am.user_id = auth.uid()
  )
);

-- COMMERCIAL
ALTER TABLE IF EXISTS public.lead_commercial_insurance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view insurance details for their account's leads" ON public.lead_commercial_insurance;
DROP POLICY IF EXISTS "Users can insert insurance details for their account's leads" ON public.lead_commercial_insurance;
DROP POLICY IF EXISTS "Users can update insurance details for their account's leads" ON public.lead_commercial_insurance;
DROP POLICY IF EXISTS "Users can delete insurance details for their account's leads" ON public.lead_commercial_insurance;

CREATE POLICY "Users can view insurance details for their account's leads"
ON public.lead_commercial_insurance
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.leads l
    JOIN public.account_memberships am ON l.account_id = am.account_id
    WHERE l.id = public.lead_commercial_insurance.lead_id
      AND am.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert insurance details for their account's leads"
ON public.lead_commercial_insurance
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.leads l
    JOIN public.account_memberships am ON l.account_id = am.account_id
    WHERE l.id = public.lead_commercial_insurance.lead_id
      AND am.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update insurance details for their account's leads"
ON public.lead_commercial_insurance
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.leads l
    JOIN public.account_memberships am ON l.account_id = am.account_id
    WHERE l.id = public.lead_commercial_insurance.lead_id
      AND am.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.leads l
    JOIN public.account_memberships am ON l.account_id = am.account_id
    WHERE l.id = public.lead_commercial_insurance.lead_id
      AND am.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete insurance details for their account's leads"
ON public.lead_commercial_insurance
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.leads l
    JOIN public.account_memberships am ON l.account_id = am.account_id
    WHERE l.id = public.lead_commercial_insurance.lead_id
      AND am.user_id = auth.uid()
  )
);
