-- Drop the profiles view first
DROP VIEW IF EXISTS public.profiles CASCADE;

-- Recreate profiles table to fix TypeScript errors
CREATE TABLE public.profiles (
  id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  role text DEFAULT 'user',
  is_staff boolean DEFAULT false,
  avatar_url text,
  notification_email text,
  phone text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policies for profiles table
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Staff can view all profiles" ON public.profiles
  FOR SELECT USING (is_staff());

-- Create or replace the function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, is_staff)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', null),
    COALESCE(new.raw_user_meta_data->>'phone', null),
    false
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN new;
END;
$$;