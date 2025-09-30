-- Update Brian Lewis to admin role so he can access the Admin panel
UPDATE public.profiles 
SET role = 'admin' 
WHERE id = '40b27b11-44c7-4201-a12b-0f72a1a63fa3';