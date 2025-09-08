-- Create RPC function for atomic account + membership creation
CREATE OR REPLACE FUNCTION public.create_account_with_membership(
  account_data jsonb,
  owner_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_account_id uuid;
  account_record record;
  result jsonb;
BEGIN
  -- Insert account
  INSERT INTO public.accounts (
    type, name, tin_last4, address_line1, address_line2, 
    city, state, zip_code, phone, email, source
  ) VALUES (
    (account_data->>'type')::account_type,
    account_data->>'name',
    account_data->>'tin_last4', 
    account_data->>'address_line1',
    account_data->>'address_line2',
    account_data->>'city',
    account_data->>'state',
    account_data->>'zip_code',
    account_data->>'phone',
    account_data->>'email',
    account_data->>'source'
  ) RETURNING * INTO account_record;
  
  new_account_id := account_record.id;
  
  -- Create owner membership
  INSERT INTO public.account_memberships (account_id, user_id, role)
  VALUES (new_account_id, owner_user_id, 'owner');
  
  -- Return the account data
  result := jsonb_build_object(
    'success', true,
    'account', to_jsonb(account_record)
  );
  
  RETURN result;
END;
$$;