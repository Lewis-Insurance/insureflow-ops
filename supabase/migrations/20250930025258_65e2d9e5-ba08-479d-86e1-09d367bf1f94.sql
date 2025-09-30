-- Fix telephony_settings constraints and add Willow number
ALTER TABLE public.telephony_settings 
ALTER COLUMN forward_number DROP NOT NULL;

-- Update with Willow's number (you'll need to provide the actual Willow number)
UPDATE public.telephony_settings 
SET forward_number = 'WILLOW_NUMBER_HERE' 
WHERE forward_number IS NULL OR forward_number = '';

-- If no rows exist, insert one
INSERT INTO public.telephony_settings (twilio_phone_number, forward_number)
SELECT '+13864879494', 'WILLOW_NUMBER_HERE'
WHERE NOT EXISTS (SELECT 1 FROM public.telephony_settings);