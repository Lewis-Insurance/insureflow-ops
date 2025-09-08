-- Check for any triggers that might be causing issues and remove the problematic JSONB operation
-- Let's completely rewrite the function to avoid any JSONB operations that could fail

CREATE OR REPLACE FUNCTION update_account_secure(
  account_id UUID,
  account_data JSONB
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_data JSON;
  membership_check BOOLEAN;
  account_name TEXT;
  account_email TEXT;
  account_phone TEXT;
  account_address1 TEXT;
  account_address2 TEXT;
  account_city TEXT;
  account_state TEXT;
  account_zip TEXT;
  account_source TEXT;
  account_tin TEXT;
  account_type_val account_type_new;
  type_val account_type_v2;
BEGIN
  -- Check if user has permission to update this account
  SELECT EXISTS (
    SELECT 1 FROM account_memberships m 
    WHERE m.account_id = update_account_secure.account_id 
    AND m.user_id = auth.uid() 
    AND m.role = ANY (ARRAY['owner'::text, 'staff'::text])
  ) INTO membership_check;
  
  IF NOT membership_check THEN
    RAISE EXCEPTION 'Access denied: insufficient permissions to update account';
  END IF;
  
  -- Extract values from JSONB safely
  account_name := account_data->>'name';
  account_email := account_data->>'email';
  account_phone := account_data->>'phone';
  account_address1 := account_data->>'address_line1';
  account_address2 := account_data->>'address_line2';
  account_city := account_data->>'city';
  account_state := account_data->>'state';
  account_zip := account_data->>'zip_code';
  account_source := account_data->>'source';
  account_tin := account_data->>'tin_last4';
  
  -- Handle enum types safely
  IF account_data ? 'account_type' THEN
    account_type_val := (account_data->>'account_type')::account_type_new;
  END IF;
  
  IF account_data ? 'type' THEN
    type_val := (account_data->>'type')::account_type_v2;
  END IF;
  
  -- Perform the update with explicit NULL handling
  UPDATE accounts 
  SET 
    name = COALESCE(account_name, name),
    address_line1 = COALESCE(account_address1, address_line1),
    address_line2 = COALESCE(account_address2, address_line2),
    city = COALESCE(account_city, city),
    state = COALESCE(account_state, state),
    zip_code = COALESCE(account_zip, zip_code),
    phone = COALESCE(account_phone, phone),
    email = COALESCE(account_email, email),
    source = COALESCE(account_source, source),
    tin_last4 = COALESCE(account_tin, tin_last4),
    account_type = COALESCE(account_type_val, account_type),
    type = COALESCE(type_val, type),
    updated_at = NOW()
  WHERE id = update_account_secure.account_id;
  
  -- Check if any rows were updated
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found or no changes made';
  END IF;
  
  -- Return the updated record
  SELECT to_json(a.*) INTO result_data
  FROM accounts a 
  WHERE a.id = update_account_secure.account_id;
  
  RETURN result_data;
END;
$$;