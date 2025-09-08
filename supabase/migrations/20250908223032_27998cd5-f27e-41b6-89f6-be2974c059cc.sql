-- Create missing account membership for the user
INSERT INTO public.account_memberships (account_id, user_id, role) 
VALUES ('11111111-1111-4111-8111-111111111111', '40b27b11-44c7-4201-a12b-0f72a1a63fa3', 'owner')
ON CONFLICT (account_id, user_id) DO NOTHING;

-- Also create membership for the second account  
INSERT INTO public.account_memberships (account_id, user_id, role) 
VALUES ('22222222-2222-4222-8222-222222222222', '40b27b11-44c7-4201-a12b-0f72a1a63fa3', 'owner')
ON CONFLICT (account_id, user_id) DO NOTHING;