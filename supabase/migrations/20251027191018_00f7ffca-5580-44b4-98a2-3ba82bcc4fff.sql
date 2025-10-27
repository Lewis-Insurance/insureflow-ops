-- Add estimated_effective_date column to leads table
ALTER TABLE public.leads
ADD COLUMN estimated_effective_date DATE;