-- Fix knowledge_base RLS policies to allow inserts without account_id requirement
-- Drop existing policies
DROP POLICY IF EXISTS "Users can view knowledge in their account" ON public.knowledge_base;
DROP POLICY IF EXISTS "Staff can manage knowledge" ON public.knowledge_base;

-- Create new, more permissive policies for authenticated users
-- Allow all authenticated users to view all knowledge
CREATE POLICY "Authenticated users can view all knowledge"
ON public.knowledge_base
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Allow all authenticated users to insert knowledge
CREATE POLICY "Authenticated users can insert knowledge"
ON public.knowledge_base
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Allow users to update knowledge they created
CREATE POLICY "Users can update their own knowledge"
ON public.knowledge_base
FOR UPDATE
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

-- Allow users to delete knowledge they created  
CREATE POLICY "Users can delete their own knowledge"
ON public.knowledge_base
FOR DELETE
USING (created_by = auth.uid());

-- Make account_id nullable since it's not being used
ALTER TABLE public.knowledge_base 
ALTER COLUMN account_id DROP NOT NULL;