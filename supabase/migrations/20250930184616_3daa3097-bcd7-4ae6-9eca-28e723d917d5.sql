-- Grant admin privileges to blewis@lewisinsurance.com
UPDATE public.profiles
SET 
  is_staff = true,
  role = 'admin'
WHERE id = '40b27b11-44c7-4201-a12b-0f72a1a63fa3';