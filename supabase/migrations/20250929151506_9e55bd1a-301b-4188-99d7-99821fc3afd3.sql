-- Examples of CORRECT policy syntax for the policies table

-- Example 1: Basic user access to their own policies
-- CREATE POLICY "Users can view their own policies" 
-- ON policies FOR SELECT 
-- USING (insured_user_id = auth.uid());

-- Example 2: If you want to check JSONB fields within policies
-- CREATE POLICY "Users can view active policies with specific coverage" 
-- ON policies FOR SELECT 
-- USING (
--   insured_user_id = auth.uid() 
--   AND coverage->>'status' = 'active'
-- );

-- Example 3: Staff access via account membership
-- CREATE POLICY "Staff can manage policies for their accounts" 
-- ON policies FOR ALL 
-- USING (
--   EXISTS (
--     SELECT 1 FROM account_memberships m 
--     WHERE m.account_id = policies.account_id 
--     AND m.user_id = auth.uid() 
--     AND m.role IN ('owner', 'staff')
--   )
-- );

-- Let me check what specific policy you're trying to create
-- First, let's see the current error details
SELECT 1; -- This is just a placeholder query to help debug