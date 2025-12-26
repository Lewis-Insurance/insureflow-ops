-- SSN Encryption/Decryption Functions
-- Uses pgcrypto for symmetric encryption with a server-side key

-- Ensure pgcrypto extension is available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create a secure settings table for encryption keys if it doesn't exist
CREATE TABLE IF NOT EXISTS secure_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on secure_settings - only service role can access
ALTER TABLE secure_settings ENABLE ROW LEVEL SECURITY;

-- No policies means only service role (bypasses RLS) can access
-- This is intentional for security

-- Create SSN access audit log table
CREATE TABLE IF NOT EXISTS ssn_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  contact_id uuid NOT NULL,
  action text NOT NULL, -- 'reveal', 'encrypt'
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on audit log
ALTER TABLE ssn_access_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Admins can view SSN access logs" ON ssn_access_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Index for audit log queries
CREATE INDEX IF NOT EXISTS idx_ssn_access_log_user ON ssn_access_log(user_id);
CREATE INDEX IF NOT EXISTS idx_ssn_access_log_contact ON ssn_access_log(contact_id);
CREATE INDEX IF NOT EXISTS idx_ssn_access_log_created ON ssn_access_log(created_at DESC);

-- Encrypt SSN function (SECURITY DEFINER to access secure_settings)
CREATE OR REPLACE FUNCTION encrypt_ssn(ssn text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  encryption_key text;
  clean_ssn text;
BEGIN
  -- Validate SSN format (9 digits, with or without dashes)
  clean_ssn := regexp_replace(ssn, '[^0-9]', '', 'g');

  IF length(clean_ssn) != 9 THEN
    RAISE EXCEPTION 'Invalid SSN format: must be 9 digits';
  END IF;

  -- Get encryption key from secure settings
  SELECT value INTO encryption_key
  FROM secure_settings
  WHERE key = 'ssn_encryption_key';

  IF encryption_key IS NULL THEN
    -- Generate and store a new key if one doesn't exist
    encryption_key := encode(gen_random_bytes(32), 'base64');
    INSERT INTO secure_settings (key, value)
    VALUES ('ssn_encryption_key', encryption_key)
    ON CONFLICT (key) DO NOTHING;

    -- Re-fetch in case of race condition
    SELECT value INTO encryption_key
    FROM secure_settings
    WHERE key = 'ssn_encryption_key';
  END IF;

  -- Encrypt using pgcrypto
  RETURN encode(
    pgp_sym_encrypt(clean_ssn, encryption_key),
    'base64'
  );
END;
$$;

-- Decrypt SSN function (SECURITY DEFINER to access secure_settings)
-- This function checks permissions and logs access
CREATE OR REPLACE FUNCTION decrypt_ssn(enc text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  encryption_key text;
  decrypted_ssn text;
  user_role text;
  is_staff boolean;
BEGIN
  -- Check if user has permission to reveal SSN
  SELECT p.role, p.is_staff INTO user_role, is_staff
  FROM profiles p
  WHERE p.id = auth.uid();

  IF user_role IS NULL THEN
    RAISE EXCEPTION 'User not found or not authenticated';
  END IF;

  -- Only admin, agent, or staff can reveal SSN
  IF user_role NOT IN ('admin', 'agent') AND is_staff IS NOT TRUE THEN
    RAISE EXCEPTION 'Permission denied: insufficient privileges to reveal SSN';
  END IF;

  -- Get encryption key
  SELECT value INTO encryption_key
  FROM secure_settings
  WHERE key = 'ssn_encryption_key';

  IF encryption_key IS NULL THEN
    RAISE EXCEPTION 'Encryption key not configured';
  END IF;

  -- Decrypt
  BEGIN
    decrypted_ssn := pgp_sym_decrypt(
      decode(enc, 'base64'),
      encryption_key
    );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Failed to decrypt SSN: invalid encrypted data';
  END;

  -- Format as XXX-XX-XXXX
  RETURN substring(decrypted_ssn, 1, 3) || '-' ||
         substring(decrypted_ssn, 4, 2) || '-' ||
         substring(decrypted_ssn, 6, 4);
END;
$$;

-- Wrapper function to decrypt SSN and log access
CREATE OR REPLACE FUNCTION reveal_ssn(p_contact_id uuid, p_encrypted_ssn text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result text;
BEGIN
  -- Decrypt the SSN
  result := decrypt_ssn(p_encrypted_ssn);

  -- Log the access
  INSERT INTO ssn_access_log (user_id, contact_id, action)
  VALUES (auth.uid(), p_contact_id, 'reveal');

  RETURN result;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION encrypt_ssn(text) TO authenticated;
GRANT EXECUTE ON FUNCTION decrypt_ssn(text) TO authenticated;
GRANT EXECUTE ON FUNCTION reveal_ssn(uuid, text) TO authenticated;

-- Comment for documentation
COMMENT ON FUNCTION encrypt_ssn(text) IS 'Encrypts a 9-digit SSN using AES-256. Returns base64-encoded encrypted string.';
COMMENT ON FUNCTION decrypt_ssn(text) IS 'Decrypts an encrypted SSN. Requires admin/agent/staff role.';
COMMENT ON FUNCTION reveal_ssn(uuid, text) IS 'Decrypts SSN and logs access for audit purposes. Use this function for UI operations.';
