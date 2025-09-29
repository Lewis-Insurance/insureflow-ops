-- Add updated_at column to policies table
ALTER TABLE public.policies 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL;