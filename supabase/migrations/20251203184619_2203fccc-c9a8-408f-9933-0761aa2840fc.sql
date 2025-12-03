-- Add a simple policy to allow all authenticated users to view all leads
-- This ensures everyone can see leads created by anyone

-- First, drop the restrictive SELECT policies
DROP POLICY IF EXISTS "Users can view leads they created or are assigned to" ON public.leads;
DROP POLICY IF EXISTS "Users can view leads for their account" ON public.leads;
DROP POLICY IF EXISTS "Users can view their assigned leads" ON public.leads;

-- Create a simple policy allowing all authenticated users to view all leads
CREATE POLICY "Everyone can view all leads" 
ON public.leads 
FOR SELECT 
TO authenticated
USING (true);