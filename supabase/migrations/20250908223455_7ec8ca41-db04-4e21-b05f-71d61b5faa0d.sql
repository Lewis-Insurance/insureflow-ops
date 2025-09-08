-- Create test function to check auth context
CREATE OR REPLACE FUNCTION test_auth_context() 
RETURNS json 
LANGUAGE SQL 
AS $$
  SELECT json_build_object(
    'auth_uid', auth.uid(),
    'user_role', auth.role(),
    'jwt_payload', auth.jwt()
  );
$$;