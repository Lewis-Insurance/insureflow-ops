-- Create ao_renewals table for Auto-Owners renewal tracking
CREATE TABLE IF NOT EXISTS public.ao_renewals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name TEXT NOT NULL,
  policy_number TEXT NOT NULL UNIQUE,
  policy_type TEXT NOT NULL,
  renewal_date DATE NOT NULL,
  current_premium DECIMAL(10, 2),
  current_carrier TEXT DEFAULT 'Auto-Owners',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'quoted', 'won', 'lost')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  custom_data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.ao_renewals ENABLE ROW LEVEL SECURITY;

-- Create policies for ao_renewals
CREATE POLICY "Users can view ao_renewals"
ON public.ao_renewals
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert ao_renewals"
ON public.ao_renewals
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update ao_renewals"
ON public.ao_renewals
FOR UPDATE
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete ao_renewals"
ON public.ao_renewals
FOR DELETE
USING (auth.uid() IS NOT NULL);

-- Create indexes for better performance
CREATE INDEX idx_ao_renewals_policy_number ON public.ao_renewals(policy_number);
CREATE INDEX idx_ao_renewals_renewal_date ON public.ao_renewals(renewal_date);
CREATE INDEX idx_ao_renewals_status ON public.ao_renewals(status);
CREATE INDEX idx_ao_renewals_priority ON public.ao_renewals(priority);
CREATE INDEX idx_ao_renewals_assigned_to ON public.ao_renewals(assigned_to);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_ao_renewals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_ao_renewals_updated_at
BEFORE UPDATE ON public.ao_renewals
FOR EACH ROW
EXECUTE FUNCTION public.update_ao_renewals_updated_at();