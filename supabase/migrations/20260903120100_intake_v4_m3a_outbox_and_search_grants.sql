-- intake-v4 migration M3a: close the anonymous door on the outbox functions and global search.
--
-- ledger version: pending
--
-- NEEDS LANDEN APPROVAL BEFORE PROD APPLY. Apply through the Supabase management API
-- (MCP apply_migration) only. Never run a CLI push against production.
--
-- Why this is separate from M3b
--   M3b (the leads policy rewrite) waits on Brian's answer about what the public
--   site's /api/lead route does. This half waits on nobody: the three outbox
--   functions have exactly one caller, the dispatch-outbox edge function, which uses
--   the service role. No app code and no other database function calls them (report
--   section 11.3). Revoking anonymous, PUBLIC and authenticated execute therefore
--   changes nothing for any live path.
--
-- The hole being closed
--   Production access control lists read today, for all four functions:
--     {=X/postgres, postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres}
--   The leading "=X/postgres" is EXECUTE granted to PUBLIC. All three outbox
--   functions are SECURITY DEFINER and check nothing, so an anonymous caller holding
--   the public key could read pending event payloads or flip their delivery status.
--   Payloads carry filenames, storage paths, policy numbers and premiums.
--
-- global_search_v1 returns nothing without a signed in user (it returns early when
-- auth.uid() is null), so its anonymous grant is hygiene rather than a live hole. It
-- is fixed here because it is the same one line change and the same review.
--
-- Target shape, copied from the discipline already used by import_resolve_account,
-- find_duplicate_accounts and the renewal functions:
--     {postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}
--
-- Note on global_search_v1: authenticated keeps EXECUTE because the command palette
-- calls it as the signed in user. Only anon and PUBLIC lose it.
--
-- Smoke test after apply
--   1. As the anonymous role, call each of the three outbox functions: expect 42501.
--   2. As the anonymous role, call global_search_v1: expect 42501.
--   3. As the service role, call get_pending_outbox_events(1): expect success.
--   4. As a signed in staff user, run a command palette search: expect results.

revoke execute on function public.get_pending_outbox_events(integer) from public;
revoke execute on function public.get_pending_outbox_events(integer) from anon;
revoke execute on function public.get_pending_outbox_events(integer) from authenticated;

revoke execute on function public.mark_event_delivered(bigint, integer) from public;
revoke execute on function public.mark_event_delivered(bigint, integer) from anon;
revoke execute on function public.mark_event_delivered(bigint, integer) from authenticated;

revoke execute on function public.mark_event_failed(bigint, text, integer) from public;
revoke execute on function public.mark_event_failed(bigint, text, integer) from anon;
revoke execute on function public.mark_event_failed(bigint, text, integer) from authenticated;

grant execute on function public.get_pending_outbox_events(integer) to service_role;
grant execute on function public.mark_event_delivered(bigint, integer) to service_role;
grant execute on function public.mark_event_failed(bigint, text, integer) to service_role;

revoke execute on function public.global_search_v1(text, integer) from public;
revoke execute on function public.global_search_v1(text, integer) from anon;
grant execute on function public.global_search_v1(text, integer) to authenticated;
grant execute on function public.global_search_v1(text, integer) to service_role;

-- >>> DOWN BEGIN
/*
grant execute on function public.get_pending_outbox_events(integer) to public;
grant execute on function public.get_pending_outbox_events(integer) to anon;
grant execute on function public.get_pending_outbox_events(integer) to authenticated;
grant execute on function public.mark_event_delivered(bigint, integer) to public;
grant execute on function public.mark_event_delivered(bigint, integer) to anon;
grant execute on function public.mark_event_delivered(bigint, integer) to authenticated;
grant execute on function public.mark_event_failed(bigint, text, integer) to public;
grant execute on function public.mark_event_failed(bigint, text, integer) to anon;
grant execute on function public.mark_event_failed(bigint, text, integer) to authenticated;
grant execute on function public.global_search_v1(text, integer) to public;
grant execute on function public.global_search_v1(text, integer) to anon;
*/
-- >>> DOWN END
