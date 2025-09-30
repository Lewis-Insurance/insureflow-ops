-- Fix documents RLS to allow staff users to insert documents
-- Drop the existing restrictive INSERT policy
DROP POLICY IF EXISTS "documents_write_by_membership" ON documents;

-- Create a new INSERT policy that allows staff users OR users with account membership
CREATE POLICY "documents_insert_staff_or_membership"
ON documents
FOR INSERT
TO authenticated
WITH CHECK (
  -- Allow if user is staff (from profiles table)
  is_staff()
  OR
  -- Allow if user has owner/staff role in the account
  EXISTS (
    SELECT 1 
    FROM account_memberships m
    WHERE m.account_id = documents.account_id 
    AND m.user_id = auth.uid()
    AND m.role = ANY (ARRAY['owner', 'staff'])
  )
);