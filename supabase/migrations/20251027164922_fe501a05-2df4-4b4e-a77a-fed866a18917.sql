-- Create ao_renewal_notes table for individual timestamped notes
CREATE TABLE IF NOT EXISTS public.ao_renewal_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  renewal_id UUID NOT NULL REFERENCES public.ao_renewals(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.ao_renewal_notes ENABLE ROW LEVEL SECURITY;

-- Create policies for ao_renewal_notes
CREATE POLICY "Users can view all notes"
  ON public.ao_renewal_notes
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create notes"
  ON public.ao_renewal_notes
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own notes"
  ON public.ao_renewal_notes
  FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own notes"
  ON public.ao_renewal_notes
  FOR DELETE
  USING (auth.uid() = created_by);

-- Create index for faster queries
CREATE INDEX idx_ao_renewal_notes_renewal_id ON public.ao_renewal_notes(renewal_id);
CREATE INDEX idx_ao_renewal_notes_created_at ON public.ao_renewal_notes(created_at DESC);

-- Create trigger for updated_at
CREATE TRIGGER update_ao_renewal_notes_updated_at
  BEFORE UPDATE ON public.ao_renewal_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();