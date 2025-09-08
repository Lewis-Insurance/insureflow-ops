-- Fix recursive RLS policy issue by creating a security definer function
-- This function bypasses RLS to prevent infinite recursion

CREATE OR REPLACE FUNCTION public.get_user_role(user_id uuid)
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = user_id LIMIT 1;
$$;

-- Update the has_role function to use the new security definer function
CREATE OR REPLACE FUNCTION public.has_role(uid uuid, desired user_role)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT public.get_user_role(uid) = desired;
$$;

-- Update is_admin function
CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT public.get_user_role(uid) = 'admin'::user_role;
$$;

-- Update is_staff function  
CREATE OR REPLACE FUNCTION public.is_staff(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT public.get_user_role(uid) IN ('staff'::user_role, 'admin'::user_role);
$$;