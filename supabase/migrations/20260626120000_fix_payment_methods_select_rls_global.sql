-- Fix: Payment Method dropdown empty in Record Payment modal
-- Migration: 20260626120000_fix_payment_methods_select_rls_global.sql
--
-- ROOT CAUSE
-- The security fix 20260625023008_security_fix_enable_rls_financial_tables
-- (re)enabled RLS on payment_methods to block anon access. That was correct for
-- the real financial tables, but payment_methods is a GLOBAL LOOKUP table: its
-- rows are seeded with org_id = NULL (see 20251230200000_fix_payment_methods_and_seed).
-- The only SELECT policy is `org_id = get_user_org_id()`. A NULL org_id never
-- matches, so authenticated org members now see ZERO payment methods. The
-- Record Payment <Select> renders with no <SelectItem> children, which looks
-- like the dropdown "won't open."
--
-- FIX
-- Keep RLS enabled (preserve the security fix — anon stays blocked), but allow
-- authenticated users to read GLOBAL methods (org_id IS NULL) in addition to
-- their own org's custom methods.

DROP POLICY IF EXISTS "Users can view payment methods for their org" ON public.payment_methods;

CREATE POLICY "Users can view payment methods"
    ON public.payment_methods
    FOR SELECT
    TO authenticated
    USING (org_id IS NULL OR org_id = get_user_org_id());

-- Allow staff to manage their own org's methods OR the shared global defaults.
DROP POLICY IF EXISTS "Staff can manage payment methods" ON public.payment_methods;

CREATE POLICY "Staff can manage payment methods"
    ON public.payment_methods
    FOR ALL
    TO authenticated
    USING ((org_id IS NULL OR org_id = get_user_org_id()) AND is_staff())
    WITH CHECK ((org_id IS NULL OR org_id = get_user_org_id()) AND is_staff());
