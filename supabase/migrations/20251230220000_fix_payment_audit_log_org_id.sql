-- Fix Payment Audit Log: Make org_id nullable
-- Migration: 20251230220000_fix_payment_audit_log_org_id.sql

-- The premium_payments.org_id was made nullable, but the audit trigger
-- requires org_id. Make it nullable in the audit log as well.

ALTER TABLE payment_audit_log ALTER COLUMN org_id DROP NOT NULL;

-- Verify
DO $$
BEGIN
  RAISE NOTICE 'payment_audit_log.org_id is now nullable';
END $$;
