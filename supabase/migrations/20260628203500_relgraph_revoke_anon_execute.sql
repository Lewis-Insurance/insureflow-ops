-- Relationship Graph — harden the new RPCs: only authenticated staff may execute.
-- New functions default to EXECUTE for PUBLIC (hence anon). These are SECURITY
-- DEFINER and return customer data, so revoke anon/public and keep authenticated.

revoke execute on function public.search_accounts(text, integer) from anon, public;
revoke execute on function public.get_account_relationships(uuid) from anon, public;
revoke execute on function public.get_account_link_suggestions(uuid) from anon, public;
revoke execute on function public.confirm_relationship_suggestion(uuid, text) from anon, public;
revoke execute on function public.relgraph_merge_duplicate_group(uuid, uuid) from anon, public;
revoke execute on function public.list_duplicate_groups_for_review(integer, integer) from anon, public;

grant execute on function public.search_accounts(text, integer) to authenticated;
grant execute on function public.get_account_relationships(uuid) to authenticated;
grant execute on function public.get_account_link_suggestions(uuid) to authenticated;
grant execute on function public.confirm_relationship_suggestion(uuid, text) to authenticated;
grant execute on function public.relgraph_merge_duplicate_group(uuid, uuid) to authenticated;
grant execute on function public.list_duplicate_groups_for_review(integer, integer) to authenticated;
