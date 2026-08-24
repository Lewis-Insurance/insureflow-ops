-- Least-privilege staff delivery boundary for Client English Pack.
-- The portal-documents bucket already exists; this migration does not create it.

create or replace function public.resolve_client_english_pack_delivery(p_account_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_account accounts%rowtype; v_portal record; v_agency agency_workspaces%rowtype;
begin
  select * into v_account from accounts where id = p_account_id;
  if not found or not is_staff() or not exists (
    select 1 from agency_workspace_memberships m where m.agency_workspace_id = v_account.agency_workspace_id and m.user_id = auth.uid() and m.status = 'active'
  ) then raise exception 'access_denied' using errcode = '42501'; end if;
  select email, first_name into v_portal from client_portal_users
    where account_id = p_account_id and portal_status in ('active', 'invited') order by created_at asc limit 1;
  select * into v_agency from agency_workspaces where id = v_account.agency_workspace_id;
  return jsonb_build_object('account_email', v_account.email, 'portal_email', v_portal.email,
    'first_name', coalesce(v_portal.first_name, v_account.goes_by, split_part(v_account.name, ' ', 1)),
    'agency_name', coalesce(v_agency.name, 'Lewis Insurance'), 'agency_phone', coalesce(v_agency.phone, '(386) 755-0050'));
end $$;

create or replace function public.finalize_client_english_pack_document(p_account_id uuid, p_policy_id uuid, p_path text, p_sha256 text, p_size integer)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if not is_staff() or p_path !~ ('^' || p_account_id::text || '/client-english-pack/[a-f0-9]{12}-[a-f0-9-]+\.pdf$')
    or p_sha256 !~ '^[a-f0-9]{64}$' or not exists (select 1 from accounts a join agency_workspace_memberships m on m.agency_workspace_id=a.agency_workspace_id where a.id=p_account_id and m.user_id=auth.uid() and m.status='active')
    or (p_policy_id is not null and not exists (select 1 from policies where id=p_policy_id and account_id=p_account_id))
    or not exists (select 1 from storage.objects o where o.bucket_id='portal-documents' and o.name=p_path
      and (o.metadata->>'size')::bigint=p_size and coalesce(o.metadata->>'mimetype','application/pdf')='application/pdf')
  then raise exception 'access_denied' using errcode='42501'; end if;
  insert into documents(account_id,policy_id,filename,name,kind,document_type,storage_bucket,storage_path,mime_type,size_bytes,sha256,customer_visible,file_missing,uploaded_by)
  values(p_account_id,p_policy_id,'Client coverage summary.pdf','Client coverage summary.pdf','customer_document','client_english_pack','portal-documents',p_path,'application/pdf',p_size,p_sha256,false,false,auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.publish_client_english_pack_document(p_document_id uuid, p_account_id uuid, p_policy_id uuid, p_path text, p_sha256 text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_doc documents%rowtype; v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_document_id::text, 0));
  select d.* into v_doc from documents d join accounts a on a.id=d.account_id join agency_workspace_memberships m on m.agency_workspace_id=a.agency_workspace_id
    where d.id=p_document_id and m.user_id=auth.uid() and m.status='active' and is_staff();
  if not found or v_doc.account_id<>p_account_id or v_doc.policy_id is distinct from p_policy_id or v_doc.storage_bucket<>'portal-documents' or v_doc.storage_path<>p_path or v_doc.sha256<>p_sha256 or v_doc.document_type<>'client_english_pack'
  then raise exception 'artifact_mismatch' using errcode='22023'; end if;
  select id into v_id from portal_documents where account_id=v_doc.account_id and file_path=v_doc.storage_path and is_client_visible=true order by created_at asc limit 1;
  if v_id is not null then return v_id; end if;
  insert into portal_documents(account_id,policy_id,document_type,document_name,file_path,file_size_bytes,mime_type,source_type,uploaded_by_profile_id,is_client_visible,requires_verification,verified_for_client_view)
  values(v_doc.account_id,v_doc.policy_id,'other','Client coverage summary.pdf',v_doc.storage_path,v_doc.size_bytes,'application/pdf','agent_uploaded',auth.uid(),true,false,true) returning id into v_id;
  return v_id;
end $$;

create or replace function public.verify_client_english_pack_document(p_document_id uuid, p_account_id uuid, p_policy_id uuid, p_path text, p_sha256 text, p_recipient text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from documents d join accounts a on a.id=d.account_id join agency_workspace_memberships m on m.agency_workspace_id=a.agency_workspace_id
    where d.id=p_document_id and d.account_id=p_account_id and d.policy_id is not distinct from p_policy_id and d.storage_bucket='portal-documents'
      and d.storage_path=p_path and d.sha256=p_sha256 and d.document_type='client_english_pack' and m.user_id=auth.uid() and m.status='active' and is_staff()
      and p_recipient = coalesce((select nullif(btrim(cpu.email),'') from client_portal_users cpu where cpu.account_id=a.id and cpu.portal_status in ('active','invited') order by cpu.created_at asc limit 1), nullif(btrim(a.email),'')))
$$;

create or replace function public.unpublish_client_english_pack_document(p_portal_document_id uuid, p_document_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer;
begin
  delete from portal_documents pd using documents d, accounts a, agency_workspace_memberships m
   where pd.id=p_portal_document_id and d.id=p_document_id and pd.file_path=d.storage_path and d.document_type='client_english_pack'
     and a.id=d.account_id and m.agency_workspace_id=a.agency_workspace_id and m.user_id=auth.uid() and m.status='active' and is_staff();
  get diagnostics v_count = row_count; return v_count=1;
end $$;

create or replace function public.delete_client_english_pack_document(p_document_id uuid, p_path text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer;
begin
  delete from documents d using accounts a, agency_workspace_memberships m where d.id=p_document_id and d.storage_path=p_path and d.storage_bucket='portal-documents' and d.document_type='client_english_pack'
    and a.id=d.account_id and m.agency_workspace_id=a.agency_workspace_id and m.user_id=auth.uid() and m.status='active' and is_staff();
  get diagnostics v_count = row_count; return v_count=1;
end $$;

revoke all on function public.resolve_client_english_pack_delivery(uuid) from public;
revoke all on function public.finalize_client_english_pack_document(uuid,uuid,text,text,integer) from public;
revoke all on function public.publish_client_english_pack_document(uuid,uuid,uuid,text,text) from public;
revoke all on function public.verify_client_english_pack_document(uuid,uuid,uuid,text,text,text) from public;
revoke all on function public.unpublish_client_english_pack_document(uuid,uuid) from public;
revoke all on function public.delete_client_english_pack_document(uuid,text) from public;
revoke all on function public.resolve_client_english_pack_delivery(uuid) from anon;
revoke all on function public.finalize_client_english_pack_document(uuid,uuid,text,text,integer) from anon;
revoke all on function public.publish_client_english_pack_document(uuid,uuid,uuid,text,text) from anon;
revoke all on function public.verify_client_english_pack_document(uuid,uuid,uuid,text,text,text) from anon;
revoke all on function public.unpublish_client_english_pack_document(uuid,uuid) from anon;
revoke all on function public.delete_client_english_pack_document(uuid,text) from anon;
grant execute on function public.resolve_client_english_pack_delivery(uuid) to authenticated;
grant execute on function public.finalize_client_english_pack_document(uuid,uuid,text,text,integer) to authenticated;
grant execute on function public.publish_client_english_pack_document(uuid,uuid,uuid,text,text) to authenticated;
grant execute on function public.verify_client_english_pack_document(uuid,uuid,uuid,text,text,text) to authenticated;
grant execute on function public.unpublish_client_english_pack_document(uuid,uuid) to authenticated;
grant execute on function public.delete_client_english_pack_document(uuid,text) to authenticated;

create policy "staff upload client english packs" on storage.objects for insert to authenticated with check (
  bucket_id='portal-documents' and name ~ '^[0-9a-f-]{36}/client-english-pack/[a-f0-9]{12}-[a-f0-9-]+\.pdf$'
  and exists(select 1 from accounts a join agency_workspace_memberships m on m.agency_workspace_id=a.agency_workspace_id where a.id=split_part(name,'/',1)::uuid and m.user_id=auth.uid() and m.status='active' and is_staff())
);
create policy "staff delete client english packs" on storage.objects for delete to authenticated using (
  bucket_id='portal-documents' and name ~ '^[0-9a-f-]{36}/client-english-pack/[a-f0-9]{12}-[a-f0-9-]+\.pdf$'
  and exists(select 1 from accounts a join agency_workspace_memberships m on m.agency_workspace_id=a.agency_workspace_id where a.id=split_part(name,'/',1)::uuid and m.user_id=auth.uid() and m.status='active' and is_staff())
);
