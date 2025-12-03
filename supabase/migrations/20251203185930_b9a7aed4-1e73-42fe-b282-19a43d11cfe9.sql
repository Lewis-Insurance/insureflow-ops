-- Fix RLS policies for lead_commercial_insurance table
DROP POLICY IF EXISTS "Users can view commercial insurance for their accounts" ON public.lead_commercial_insurance;
DROP POLICY IF EXISTS "Users can insert commercial insurance for their accounts" ON public.lead_commercial_insurance;
DROP POLICY IF EXISTS "Users can update commercial insurance for their accounts" ON public.lead_commercial_insurance;
DROP POLICY IF EXISTS "Users can delete commercial insurance for their accounts" ON public.lead_commercial_insurance;

-- Create permissive policies for authenticated users
CREATE POLICY "Authenticated users can view commercial insurance" 
ON public.lead_commercial_insurance 
FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert commercial insurance" 
ON public.lead_commercial_insurance 
FOR INSERT 
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update commercial insurance" 
ON public.lead_commercial_insurance 
FOR UPDATE 
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Authenticated users can delete commercial insurance" 
ON public.lead_commercial_insurance 
FOR DELETE 
TO authenticated
USING (true);