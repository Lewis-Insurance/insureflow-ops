-- Create test membership so user can see the test123 policy
-- This is for demonstration purposes

-- First, let's get the current user ID from the auth context
-- Since we can't get it directly in this query, we'll create the membership for any authenticated user

INSERT INTO public.account_memberships (account_id, user_id, role)
SELECT 
  '11111111-1111-4111-8111-111111111111'::uuid,
  auth.uid(),
  'member'
WHERE auth.uid() IS NOT NULL
ON CONFLICT (account_id, user_id) DO NOTHING;