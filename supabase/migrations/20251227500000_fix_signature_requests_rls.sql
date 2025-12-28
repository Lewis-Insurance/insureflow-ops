-- ============================================
-- FIX: Add WITH CHECK to signature_requests UPDATE policy
-- ============================================
-- Security issue: UPDATE policy only has USING clause.
-- Without WITH CHECK, users could potentially update the created_by field
-- to take ownership of other users' signature requests.
--
-- This migration adds WITH CHECK to ensure the updated row still
-- belongs to the current user.
-- ============================================

-- Drop the existing UPDATE policy
DROP POLICY IF EXISTS "Users can update their signature requests" ON signature_requests;

-- Recreate with both USING and WITH CHECK clauses
CREATE POLICY "Users can update their signature requests"
  ON signature_requests FOR UPDATE
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- ============================================
-- Also fix submission_tracking if it exists
-- ============================================
-- Note: submission_tracking only has INSERT and SELECT policies,
-- no UPDATE policy exists to fix.

-- ============================================
-- VERIFICATION
-- ============================================
-- Run this query to verify the policy was updated:
-- SELECT polname, polcmd, pg_get_expr(polwithcheck, polrelid) as with_check
-- FROM pg_policy
-- WHERE polrelid = 'signature_requests'::regclass;
