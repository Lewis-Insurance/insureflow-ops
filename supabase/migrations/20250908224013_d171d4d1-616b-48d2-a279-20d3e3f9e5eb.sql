-- Fix the account update function to handle type casting properly
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
  
  -- Perform the update with proper type casting
  UPDATE accounts 
  SET 
    name = COALESCE(account_data->>'name', name),
    address_line1 = COALESCE(account_data->>'address_line1', address_line1),
    address_line2 = COALESCE(account_data->>'address_line2', address_line2),
    city = COALESCE(account_data->>'city', city),
    state = COALESCE(account_data->>'state', state),
    zip_code = COALESCE(account_data->>'zip_code', zip_code),
    phone = COALESCE(account_data->>'phone', phone),
    email = COALESCE(account_data->>'email', email),
    source = COALESCE(account_data->>'source', source),
    tin_last4 = COALESCE(account_data->>'tin_last4', tin_last4),
    account_type = CASE 
      WHEN account_data ? 'account_type' THEN (account_data->>'account_type')::account_type_new
      ELSE account_type 
    END,
    type = CASE 
      WHEN account_data ? 'type' THEN (account_data->>'type')::account_type_v2
      ELSE type 
    END,
    updated_at = NOW()
  WHERE id = update_account_secure.account_id;
  
  -- Return the updated record
  SELECT to_json(a.*) INTO result_data
  FROM accounts a 
  WHERE a.id = update_account_secure.account_id;
  
  RETURN result_data;
END;
$$;