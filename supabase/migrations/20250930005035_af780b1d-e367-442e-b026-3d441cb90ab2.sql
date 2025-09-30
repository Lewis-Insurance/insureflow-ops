-- Fix carriers table policy to be more restrictive
-- The current policy allows unrestricted access with 'true' condition

-- Remove the overly permissive carriers policy
DROP POLICY IF EXISTS "Carriers are readable by authenticated users" ON public.carriers;

-- Create a more restrictive policy that only allows authenticated users
CREATE POLICY "carriers_authenticated_read" 
ON public.carriers 
FOR SELECT 
TO authenticated
USING (auth.uid() IS NOT NULL);

-- Staff can still manage carriers (this policy already exists and is secure)
-- "Staff can manage carriers" policy is already properly restrictive