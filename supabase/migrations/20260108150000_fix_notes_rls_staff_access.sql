-- Fix notes RLS access for staff users
-- Creates customer_notes table and fixes is_staff() function

-- Create customer_notes table
CREATE TABLE IF NOT EXISTS public.customer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  note_text text NOT NULL,
  note_category text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  is_important boolean DEFAULT false,
  tags text[]
);

-- Enable RLS
ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;

-- Create index
CREATE INDEX IF NOT EXISTS idx_customer_notes_customer_id ON public.customer_notes(customer_id);

-- Fix is_staff function to use profiles table with active column
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND active = true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff() TO anon;

-- RLS policies for customer_notes
CREATE POLICY "customer_notes_read" ON public.customer_notes FOR SELECT USING (is_staff());
CREATE POLICY "customer_notes_write" ON public.customer_notes FOR INSERT WITH CHECK (is_staff());
CREATE POLICY "customer_notes_update" ON public.customer_notes FOR UPDATE USING (is_staff());
CREATE POLICY "customer_notes_delete" ON public.customer_notes FOR DELETE USING (is_staff());
