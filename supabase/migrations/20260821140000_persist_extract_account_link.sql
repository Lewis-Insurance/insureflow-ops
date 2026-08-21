-- Phase 1a: atomic persist of extract account link (analysis + optional document).
-- Staff-only; gates on target account workspace membership.

create or replace function public.persist_extract_account_link(
  p_analysis_id uuid,
  p_account_id uuid,
  p_document_id uuid default null,
  p_extracted_data jsonb default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_analysis record;
  v_doc_rows integer;
begin
  if not public.is_staff() then
    raise exception 'staff only';
  end if;

  if not exists (
    select 1
    from public.accounts a
    where a.id = p_account_id
      and public.is_agency_member(a.agency_workspace_id)
  ) then
    raise exception 'account not found or not accessible';
  end if;

  select da.id, da.document_id
  into v_analysis
  from public.document_analysis da
  where da.id = p_analysis_id;

  if not found then
    raise exception 'analysis not found';
  end if;

  if p_document_id is not null and v_analysis.document_id is distinct from p_document_id then
    raise exception 'document_id does not match analysis';
  end if;

  update public.document_analysis
  set
    account_id = p_account_id,
    extracted_data = coalesce(p_extracted_data, extracted_data),
    updated_at = now()
  where id = p_analysis_id;

  if not found then
    raise exception 'analysis update failed';
  end if;

  if p_document_id is not null then
    update public.documents
    set
      account_id = p_account_id,
      updated_at = now()
    where id = p_document_id;

    get diagnostics v_doc_rows = row_count;

    if v_doc_rows = 0 then
      raise exception 'document update affected 0 rows';
    end if;
  end if;
end;
$$;

comment on function public.persist_extract_account_link(uuid, uuid, uuid, jsonb) is
  'Staff-only atomic link of document analysis (and optional document) to an account.';

revoke all on function public.persist_extract_account_link(uuid, uuid, uuid, jsonb) from anon, public;
grant execute on function public.persist_extract_account_link(uuid, uuid, uuid, jsonb) to authenticated;

-- ROLLBACK
-- drop function if exists public.persist_extract_account_link(uuid, uuid, uuid, jsonb);
