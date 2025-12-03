-- Add RLS policies for ao_renewals table to allow all operations
-- This is needed because RLS is enabled but no policies exist

-- Policy for SELECT (anyone can view)
CREATE POLICY "Allow all select on ao_renewals" 
ON public.ao_renewals 
FOR SELECT 
USING (true);

-- Policy for INSERT (anyone can insert)
CREATE POLICY "Allow all insert on ao_renewals" 
ON public.ao_renewals 
FOR INSERT 
WITH CHECK (true);

-- Policy for UPDATE (anyone can update)
CREATE POLICY "Allow all update on ao_renewals" 
ON public.ao_renewals 
FOR UPDATE 
USING (true);

-- Policy for DELETE (anyone can delete)
CREATE POLICY "Allow all delete on ao_renewals" 
ON public.ao_renewals 
FOR DELETE 
USING (true);