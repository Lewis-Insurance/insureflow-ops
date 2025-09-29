-- Create missing profile for existing user
INSERT INTO public.profiles (id, full_name, phone, is_staff, role)
VALUES (
  '40b27b11-44c7-4201-a12b-0f72a1a63fa3',
  'Brian Lewis', 
  NULL,
  true,  -- Make them staff so they can manage documents
  'staff'
)
ON CONFLICT (id) DO UPDATE SET
  is_staff = true,
  role = 'staff';

-- Check for and create profiles for any other authenticated users without profiles
INSERT INTO public.profiles (id, full_name, phone, is_staff, role)
SELECT 
  au.id,
  COALESCE(au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1)) as full_name,
  au.raw_user_meta_data->>'phone' as phone,
  true as is_staff,  -- Default to staff for existing users
  'staff' as role
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;