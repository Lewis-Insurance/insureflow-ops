-- Create table for pending follow-up confirmations when leads are marked as Lost
CREATE TABLE public.lead_followup_confirmations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  lead_name TEXT NOT NULL,
  lead_email TEXT,
  lead_phone TEXT,
  insurance_types TEXT[],
  assigned_to UUID REFERENCES auth.users(id),
  estimated_effective_date DATE,
  created_by UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'dismissed')),
  confirmed_at TIMESTAMP WITH TIME ZONE,
  confirmed_by UUID REFERENCES auth.users(id),
  task_id UUID REFERENCES public.tasks(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.lead_followup_confirmations ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own followup confirmations"
ON public.lead_followup_confirmations
FOR SELECT
USING (
  auth.uid() = assigned_to OR 
  auth.uid() = created_by OR
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'manager')
  )
);

CREATE POLICY "Users can create followup confirmations"
ON public.lead_followup_confirmations
FOR INSERT
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own followup confirmations"
ON public.lead_followup_confirmations
FOR UPDATE
USING (
  auth.uid() = assigned_to OR
  auth.uid() = created_by OR
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'manager')
  )
);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_lead_followup_confirmations_updated_at
BEFORE UPDATE ON public.lead_followup_confirmations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster queries
CREATE INDEX idx_lead_followup_confirmations_status ON public.lead_followup_confirmations(status);
CREATE INDEX idx_lead_followup_confirmations_assigned_to ON public.lead_followup_confirmations(assigned_to);
CREATE INDEX idx_lead_followup_confirmations_created_at ON public.lead_followup_confirmations(created_at DESC);