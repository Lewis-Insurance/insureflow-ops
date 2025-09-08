-- Fix security linter warnings from Profile Hardening Pack

-- Fix function search paths (add SET search_path to all functions missing it)
CREATE OR REPLACE FUNCTION normalize_phone_number(phone_input text)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  cleaned_phone text;
  normalized_phone text;
BEGIN
  -- Remove all non-digit characters except +
  cleaned_phone := regexp_replace(phone_input, '[^+0-9]', '', 'g');
  
  -- If no country code, assume US (+1)
  IF cleaned_phone !~ '^\+' THEN
    IF length(cleaned_phone) = 10 THEN
      normalized_phone := '+1' || cleaned_phone;
    ELSIF length(cleaned_phone) = 11 AND left(cleaned_phone, 1) = '1' THEN
      normalized_phone := '+' || cleaned_phone;
    ELSE
      normalized_phone := cleaned_phone; -- Return as-is if can't determine
    END IF;
  ELSE
    normalized_phone := cleaned_phone;
  END IF;
  
  RETURN normalized_phone;
END;
$$;

CREATE OR REPLACE FUNCTION generate_backup_codes()
RETURNS text[]
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  codes text[] := '{}';
  i integer;
  code text;
BEGIN
  FOR i IN 1..8 LOOP
    code := encode(gen_random_bytes(6), 'hex');
    codes := array_append(codes, upper(left(code, 4)) || '-' || upper(right(code, 4)));
  END LOOP;
  
  RETURN codes;
END;
$$;

-- Add missing WITH CHECK clauses to policies
DROP POLICY IF EXISTS "Users can view their own email change requests" ON email_change_requests;
DROP POLICY IF EXISTS "Users can create email change requests" ON email_change_requests;
DROP POLICY IF EXISTS "Admins can manage email change requests" ON email_change_requests;

CREATE POLICY "Users can view their own email change requests" ON email_change_requests
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create email change requests" ON email_change_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage email change requests" ON email_change_requests
  FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can view their own role change requests" ON role_change_requests;
DROP POLICY IF EXISTS "Users can create role change requests" ON role_change_requests;
DROP POLICY IF EXISTS "Admins can manage role change requests" ON role_change_requests;

CREATE POLICY "Users can view their own role change requests" ON role_change_requests
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create role change requests" ON role_change_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage role change requests" ON role_change_requests
  FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can revoke their own sessions" ON user_sessions;
CREATE POLICY "Users can revoke their own sessions" ON user_sessions
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "System can create access logs" ON profile_access_logs;
CREATE POLICY "System can create access logs" ON profile_access_logs
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can manage their export requests" ON data_export_requests;
CREATE POLICY "Users can manage their export requests" ON data_export_requests
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can manage their phone verification" ON phone_verification_codes;
CREATE POLICY "Users can manage their phone verification" ON phone_verification_codes
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can create impersonation sessions" ON impersonation_logs;
CREATE POLICY "Admins can create impersonation sessions" ON impersonation_logs
  FOR INSERT WITH CHECK (is_admin(auth.uid()));

-- Update existing function with proper search path
CREATE OR REPLACE FUNCTION has_role(uid uuid, desired user_role)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  select exists(select 1 from public.profiles p where p.id = uid and p.role = desired);
$$;

CREATE OR REPLACE FUNCTION is_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  select public.has_role(uid, 'admin'::user_role);
$$;

CREATE OR REPLACE FUNCTION is_staff(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  select public.has_role(uid, 'staff'::user_role) or public.is_admin(uid);
$$;