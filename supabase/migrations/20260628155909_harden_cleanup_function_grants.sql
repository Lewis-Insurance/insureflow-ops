-- =====================================================================
-- Harden cleanup function grants — SECURITY DEFINER mutators = service_role only
-- =====================================================================
-- Supabase's default privileges GRANT EXECUTE to anon/authenticated on every new
-- public function, so `REVOKE ... FROM PUBLIC` in the Wave 2/4 migrations did NOT
-- remove those explicit grants — leaving the SECURITY DEFINER merge engine callable
-- by any logged-in user. Revoke the explicit anon/authenticated grants too.
-- Date: 2026-06-28
-- =====================================================================
REVOKE EXECUTE ON FUNCTION public.merge_accounts(uuid, uuid[], text, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.merge_accounts(uuid, uuid[], text, uuid, boolean) TO service_role;

REVOKE EXECUTE ON FUNCTION public.enforce_commercial_account_type() FROM PUBLIC, anon, authenticated;
