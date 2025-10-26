-- Update renewals table status constraint to use correct values
ALTER TABLE public.renewals DROP CONSTRAINT IF EXISTS renewals_status_check;
ALTER TABLE public.renewals ADD CONSTRAINT renewals_status_check 
  CHECK (status IN ('upcoming', 'in_progress', 'completed', 'lost', 'cancelled'));

-- Update default status value
ALTER TABLE public.renewals ALTER COLUMN status SET DEFAULT 'upcoming';