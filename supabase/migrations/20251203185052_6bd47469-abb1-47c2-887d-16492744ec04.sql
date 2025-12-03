-- Add policy to allow all authenticated users to view all profiles
-- This is needed for joins in leads, tasks, etc. to work correctly

CREATE POLICY "Everyone can view all profiles" 
ON public.profiles 
FOR SELECT 
TO authenticated
USING (true);