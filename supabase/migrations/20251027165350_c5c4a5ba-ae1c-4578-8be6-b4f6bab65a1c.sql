-- Create ao_renewal_contact_log table for tracking contact history
CREATE TABLE IF NOT EXISTS public.ao_renewal_contact_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  renewal_id UUID NOT NULL REFERENCES public.ao_renewals(id) ON DELETE CASCADE,
  contact_date DATE NOT NULL,
  contact_method TEXT NOT NULL CHECK (contact_method IN ('phone', 'email', 'in_person', 'sms', 'other')),
  notes TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.ao_renewal_contact_log ENABLE ROW LEVEL SECURITY;

-- Create policies for ao_renewal_contact_log
CREATE POLICY "Users can view all contact logs"
  ON public.ao_renewal_contact_log
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create contact logs"
  ON public.ao_renewal_contact_log
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own contact logs"
  ON public.ao_renewal_contact_log
  FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own contact logs"
  ON public.ao_renewal_contact_log
  FOR DELETE
  USING (auth.uid() = created_by);

-- Create index for faster queries
CREATE INDEX idx_ao_renewal_contact_log_renewal_id ON public.ao_renewal_contact_log(renewal_id);
CREATE INDEX idx_ao_renewal_contact_log_contact_date ON public.ao_renewal_contact_log(contact_date DESC);

-- Create trigger for updated_at
CREATE TRIGGER update_ao_renewal_contact_log_updated_at
  BEFORE UPDATE ON public.ao_renewal_contact_log
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to update last_contact_date on ao_renewals when contact is logged
CREATE OR REPLACE FUNCTION update_renewal_last_contact()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.ao_renewals
  SET last_contact_date = NEW.contact_date
  WHERE id = NEW.renewal_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update last_contact_date
CREATE TRIGGER update_renewal_last_contact_trigger
  AFTER INSERT ON public.ao_renewal_contact_log
  FOR EACH ROW
  EXECUTE FUNCTION update_renewal_last_contact();