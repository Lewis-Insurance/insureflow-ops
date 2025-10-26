-- Drop the old constraint
ALTER TABLE public.leads 
DROP CONSTRAINT IF EXISTS leads_decision_timeframe_check;

-- Add the correct constraint matching the form values
ALTER TABLE public.leads 
ADD CONSTRAINT leads_decision_timeframe_check 
CHECK (decision_timeframe IN ('immediate', '1_3_months', '3_6_months', '6_12_months', 'just_shopping'));