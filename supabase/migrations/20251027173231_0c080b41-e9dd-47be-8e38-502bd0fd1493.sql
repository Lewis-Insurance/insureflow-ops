-- Fix RLS policies for AO Renewals to allow all authenticated users full access

-- Drop existing restrictive policies for ao_renewal_contact_log
DROP POLICY IF EXISTS "Users can update their own contact logs" ON public.ao_renewal_contact_log;
DROP POLICY IF EXISTS "Users can delete their own contact logs" ON public.ao_renewal_contact_log;
DROP POLICY IF EXISTS "Authenticated users can create contact logs" ON public.ao_renewal_contact_log;

-- Create new permissive policies for ao_renewal_contact_log
CREATE POLICY "All authenticated users can create contact logs" 
  ON public.ao_renewal_contact_log 
  FOR INSERT 
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "All authenticated users can update contact logs" 
  ON public.ao_renewal_contact_log 
  FOR UPDATE 
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "All authenticated users can delete contact logs" 
  ON public.ao_renewal_contact_log 
  FOR DELETE 
  TO authenticated
  USING (true);

-- Drop existing restrictive policies for ao_renewal_notes
DROP POLICY IF EXISTS "Users can update their own notes" ON public.ao_renewal_notes;
DROP POLICY IF EXISTS "Users can delete their own notes" ON public.ao_renewal_notes;
DROP POLICY IF EXISTS "Authenticated users can create notes" ON public.ao_renewal_notes;

-- Create new permissive policies for ao_renewal_notes
CREATE POLICY "All authenticated users can create notes" 
  ON public.ao_renewal_notes 
  FOR INSERT 
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "All authenticated users can update notes" 
  ON public.ao_renewal_notes 
  FOR UPDATE 
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "All authenticated users can delete notes" 
  ON public.ao_renewal_notes 
  FOR DELETE 
  TO authenticated
  USING (true);