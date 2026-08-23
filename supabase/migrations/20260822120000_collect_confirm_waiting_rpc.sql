-- Portal came back, confirm is waiting.
-- One row per extracted portal upload with pending write-back proposals, scoped to the
-- producer who minted the collection link. Feeds CollectConfirmWaitingCard on My dashboard.
-- No new tables or columns: minted-by comes from collection_audit_log.new_value->>'token_id'
-- (written by document-collection on document_uploaded) with comparison_workspaces.created_by
-- as the fallback.
--
-- SECURITY DEFINER because collection_uploads / collection_access_tokens /
-- comparison_workspaces RLS is per-creator and document_analysis RLS is open; the function
-- re-applies is_staff() + is_agency_member(accounts.agency_workspace_id) and pins to auth.uid().

create or replace function public.get_my_collect_confirm_waiting(p_limit integer default 6)
returns table (
  analysis_id uuid,
  account_id uuid,
  account_name text,
  upload_id uuid,
  filename text,
  uploaded_at timestamptz,
  pending_count integer,
  line_class text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    da.id as analysis_id,
    a.id as account_id,
    a.name as account_name,
    cu.id as upload_id,
    cu.filename,
    cu.created_at as uploaded_at,
    count(p.id)::integer as pending_count,
    min(p.line_class) as line_class
  from public.collection_uploads cu
  join public.document_analysis da on da.document_id = cu.document_id
  join public.extract_writeback_proposals p
    on p.document_analysis_id = da.id
   and p.status = 'pending'
  join public.accounts a on a.id = p.account_id and a.deleted_at is null
  join public.collection_requirements cr on cr.id = cu.requirement_id
  join public.comparison_workspaces cw on cw.id = cr.workspace_id
  where public.is_staff()
    and cu.upload_channel = 'portal'
    and cu.processing_status = 'extracted'
    and public.is_agency_member(a.agency_workspace_id)
    and coalesce(
      (
        select t.created_by
        from public.collection_audit_log al
        join public.collection_access_tokens t
          on t.id = nullif(al.new_value->>'token_id', '')::uuid
        where al.upload_id = cu.id
          and al.action = 'document_uploaded'
        order by al.created_at desc
        limit 1
      ),
      cw.created_by
    ) = auth.uid()
  group by da.id, a.id, a.name, cu.id, cu.filename, cu.created_at
  order by cu.created_at desc
  limit greatest(coalesce(p_limit, 6), 1);
$$;

comment on function public.get_my_collect_confirm_waiting(integer) is
  'Staff-only. Extracted portal uploads with pending extract write-back proposals for the producer who minted the link. Read only; never applies a proposal.';

revoke all on function public.get_my_collect_confirm_waiting(integer) from anon, public;
grant execute on function public.get_my_collect_confirm_waiting(integer) to authenticated;

-- ROLLBACK
-- drop function if exists public.get_my_collect_confirm_waiting(integer);
