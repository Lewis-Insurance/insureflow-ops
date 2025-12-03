-- Drop and recreate policies to ensure they work for all cases
-- Allow anyone (anon or authenticated) to view leads
DROP POLICY IF EXISTS "Everyone can view all leads" ON public.leads;
DROP POLICY IF EXISTS "Users can view all leads" ON public.leads;
DROP POLICY IF EXISTS "Staff can view leads" ON public.leads;

CREATE POLICY "Public read access to leads" 
ON public.leads 
FOR SELECT 
USING (true);

-- Same for profiles - allow anyone to read profiles
DROP POLICY IF EXISTS "Everyone can view all profiles" ON public.profiles;

CREATE POLICY "Public read access to profiles" 
ON public.profiles 
FOR SELECT 
USING (true);

-- Same for lead_sources
DROP POLICY IF EXISTS "Users can view lead sources" ON public.lead_sources;
DROP POLICY IF EXISTS "Users can view all lead sources" ON public.lead_sources;

CREATE POLICY "Public read access to lead_sources" 
ON public.lead_sources 
FOR SELECT 
USING (true);