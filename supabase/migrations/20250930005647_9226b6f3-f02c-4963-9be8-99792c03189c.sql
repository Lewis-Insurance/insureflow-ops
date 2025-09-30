-- SECURITY FIX: Add RLS policies for agents table to protect employee PII
-- Only staff and admin users should be able to access employee information

-- Agents can only be viewed by staff/admin users
CREATE POLICY "Staff can view all agents" 
ON public.agents 
FOR SELECT 
USING (is_staff());

-- Only staff/admin can create new agent records
CREATE POLICY "Staff can create agents" 
ON public.agents 
FOR INSERT 
WITH CHECK (is_staff());

-- Only staff/admin can update agent records
CREATE POLICY "Staff can update agents" 
ON public.agents 
FOR UPDATE 
USING (is_staff())
WITH CHECK (is_staff());

-- Only staff/admin can delete agents (soft delete)
CREATE POLICY "Staff can delete agents" 
ON public.agents 
FOR DELETE 
USING (is_staff());