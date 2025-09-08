-- Fix remaining function search path issues
-- These are the final 2 WARN-level search path warnings

-- Update any remaining functions that don't have search_path set
CREATE OR REPLACE FUNCTION public.get_user_role(user_id uuid)
RETURNS user_role
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = user_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_sms_consent(target_contact_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_consent boolean := false;
BEGIN
  SELECT 
    CASE WHEN c.event = 'consent_granted' THEN true ELSE false END
  INTO has_consent
  FROM public.twilio_consents c
  WHERE c.contact_id = target_contact_id 
    AND c.channel = 'sms'
  ORDER BY c.created_at DESC
  LIMIT 1;
  
  RETURN COALESCE(has_consent, false);
END;
$$;

-- Update other functions that may be missing search_path
CREATE OR REPLACE FUNCTION public.normalize_phone_number(phone_input text)
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

CREATE OR REPLACE FUNCTION public.generate_backup_codes()
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