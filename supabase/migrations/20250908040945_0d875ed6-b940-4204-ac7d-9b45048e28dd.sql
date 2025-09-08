-- Profile Hardening Pack Database Schema

-- Add MFA fields to profiles
ALTER TABLE profiles 
ADD COLUMN mfa_enabled boolean DEFAULT false,
ADD COLUMN mfa_secret text,
ADD COLUMN backup_codes text[],
ADD COLUMN phone_verified boolean DEFAULT false,
ADD COLUMN phone_verification_sent_at timestamp with time zone,
ADD COLUMN timezone text DEFAULT 'UTC',
ADD COLUMN locale text DEFAULT 'en',
ADD COLUMN notification_email boolean DEFAULT true,
ADD COLUMN notification_sms boolean DEFAULT false,
ADD COLUMN avatar_url text;

-- Create email change requests table
CREATE TABLE email_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  current_email text NOT NULL,
  requested_email text NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  requested_at timestamp with time zone NOT NULL DEFAULT now(),
  reviewed_at timestamp with time zone,
  reviewed_by uuid REFERENCES profiles(id),
  review_reason text,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create role change requests table  
CREATE TABLE role_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  current_role user_role NOT NULL,
  requested_role user_role NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  requested_at timestamp with time zone NOT NULL DEFAULT now(),
  reviewed_at timestamp with time zone,
  reviewed_by uuid REFERENCES profiles(id),
  review_reason text,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create user sessions table
CREATE TABLE user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_token text UNIQUE,
  device_info jsonb,
  ip_address inet,
  user_agent text,
  location_data jsonb,
  last_active timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  revoked_at timestamp with time zone
);

-- Create access logs table (who viewed/edited profiles)
CREATE TABLE profile_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  accessor_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action text NOT NULL, -- 'view', 'edit', 'export', 'reveal_pii'
  details jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create data export requests table
CREATE TABLE data_export_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  request_type text NOT NULL, -- 'profile', 'activity', 'full'
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  export_url text,
  expires_at timestamp with time zone,
  requested_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  download_count integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create phone verification codes table
CREATE TABLE phone_verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  verification_code text NOT NULL,
  attempts integer DEFAULT 0,
  verified boolean DEFAULT false,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create impersonation logs table  
CREATE TABLE impersonation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  impersonator_id uuid NOT NULL REFERENCES profiles(id),
  target_user_id uuid NOT NULL REFERENCES profiles(id),
  session_id text NOT NULL,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  ended_at timestamp with time zone,
  reason text,
  ip_address inet,
  user_agent text,
  actions_taken jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on all new tables
ALTER TABLE email_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_export_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_verification_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE impersonation_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own email change requests" ON email_change_requests
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create email change requests" ON email_change_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage email change requests" ON email_change_requests
  FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Users can view their own role change requests" ON role_change_requests
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create role change requests" ON role_change_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Owners can manage role change requests" ON role_change_requests
  FOR ALL USING (has_role(auth.uid(), 'owner'));

CREATE POLICY "Users can view their own sessions" ON user_sessions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can revoke their own sessions" ON user_sessions
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Staff can view profile access logs" ON profile_access_logs
  FOR SELECT USING (is_staff(auth.uid()));

CREATE POLICY "Users can view access logs for their profile" ON profile_access_logs
  FOR SELECT USING (target_user_id = auth.uid());

CREATE POLICY "System can create access logs" ON profile_access_logs
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can manage their export requests" ON data_export_requests
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Users can manage their phone verification" ON phone_verification_codes
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Staff can view impersonation logs" ON impersonation_logs
  FOR SELECT USING (is_staff(auth.uid()));

CREATE POLICY "Owners can create impersonation sessions" ON impersonation_logs
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'owner'));

-- Create indexes for performance
CREATE INDEX idx_email_change_requests_user_status ON email_change_requests(user_id, status);
CREATE INDEX idx_role_change_requests_user_status ON role_change_requests(user_id, status);
CREATE INDEX idx_user_sessions_user_active ON user_sessions(user_id, last_active DESC);
CREATE INDEX idx_profile_access_logs_target_created ON profile_access_logs(target_user_id, created_at DESC);
CREATE INDEX idx_data_export_requests_user_status ON data_export_requests(user_id, status);
CREATE INDEX idx_phone_verification_user_expires ON phone_verification_codes(user_id, expires_at);
CREATE INDEX idx_impersonation_logs_target_started ON impersonation_logs(target_user_id, started_at DESC);

-- Function to log profile access
CREATE OR REPLACE FUNCTION log_profile_access(
  target_id uuid,
  action_type text,
  details_json jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profile_access_logs (
    target_user_id,
    accessor_user_id,
    action,
    details,
    ip_address,
    created_at
  ) VALUES (
    target_id,
    auth.uid(),
    action_type,
    details_json,
    inet_client_addr(),
    now()
  );
END;
$$;

-- Function to normalize phone numbers to E.164 format
CREATE OR REPLACE FUNCTION normalize_phone_number(phone_input text)
RETURNS text
LANGUAGE plpgsql
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

-- Function to generate secure backup codes
CREATE OR REPLACE FUNCTION generate_backup_codes()
RETURNS text[]
LANGUAGE plpgsql
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