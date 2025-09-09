-- Fix audit_logs RLS policy to allow triggers to insert
-- The issue is that audit triggers try to write to audit_logs but RLS blocks them

-- Drop existing restrictive policies and create proper ones
DROP POLICY IF EXISTS "admin_only_audit_logs" ON audit_logs;
DROP POLICY IF EXISTS "audit_logs_read" ON audit_logs;

-- Allow inserts from triggers (service role or system operations)
CREATE POLICY "audit_logs_insert_system" ON audit_logs
FOR INSERT 
WITH CHECK (true);

-- Allow staff/admin to read audit logs
CREATE POLICY "audit_logs_read_staff" ON audit_logs
FOR SELECT 
USING (is_staff());

-- Allow admin users to view all audit logs
CREATE POLICY "audit_logs_read_admin" ON audit_logs
FOR SELECT 
USING (is_admin());