-- Fix circular RLS dependency causing stack depth exceeded error
-- The issue: accounts RLS → is_member() → account_memberships → is_member() → accounts → infinite loop

-- First, drop the problematic policies on account_memberships
DROP POLICY IF EXISTS "am_select" ON account_memberships;
DROP POLICY IF EXISTS "am_select_self" ON account_memberships;
DROP POLICY IF EXISTS "am_write" ON account_memberships;
DROP POLICY IF EXISTS "memberships_select_staff_or_self" ON account_memberships;

-- Create new policies that DON'T create circular dependencies
-- Users can see their own memberships (no circular reference)
CREATE POLICY "memberships_select_own"
ON account_memberships FOR SELECT
USING (user_id = auth.uid());

-- Staff can see all memberships
CREATE POLICY "memberships_select_staff"
ON account_memberships FOR SELECT
USING (is_staff());

-- Only staff can manage memberships (no circular reference needed)
CREATE POLICY "memberships_write_staff"
ON account_memberships FOR ALL
USING (is_staff())
WITH CHECK (is_staff());

-- Now fix accounts policies to avoid the circular reference
DROP POLICY IF EXISTS "accounts_write" ON accounts;

-- Replace with a policy that doesn't cause circular dependency
-- Staff can do everything
CREATE POLICY "accounts_all_staff"
ON accounts FOR ALL
USING (is_staff())
WITH CHECK (is_staff());