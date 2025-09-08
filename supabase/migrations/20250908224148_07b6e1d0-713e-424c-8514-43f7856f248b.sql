-- Fix the account update function - the issue might be with JSONB operations
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
  
  -- Perform the update with explicit field handling
  UPDATE accounts 
  SET 
    name = CASE WHEN account_data ? 'name' THEN account_data->>'name' ELSE name END,
    address_line1 = CASE WHEN account_data ? 'address_line1' THEN account_data->>'address_line1' ELSE address_line1 END,
    address_line2 = CASE WHEN account_data ? 'address_line2' THEN account_data->>'address_line2' ELSE address_line2 END,
    city = CASE WHEN account_data ? 'city' THEN account_data->>'city' ELSE city END,
    state = CASE WHEN account_data ? 'state' THEN account_data->>'state' ELSE state END,
    zip_code = CASE WHEN account_data ? 'zip_code' THEN account_data->>'zip_code' ELSE zip_code END,
    phone = CASE WHEN account_data ? 'phone' THEN account_data->>'phone' ELSE phone END,
    email = CASE WHEN account_data ? 'email' THEN account_data->>'email' ELSE email END,
    source = CASE WHEN account_data ? 'source' THEN account_data->>'source' ELSE source END,
    tin_last4 = CASE WHEN account_data ? 'tin_last4' THEN account_data->>'tin_last4' ELSE tin_last4 END,
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