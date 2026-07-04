-- Holder requirements engine (07 §4): DB foundation.
--
-- The additional_insureds.requirements / requirements_notes columns already shipped with
-- the Phase 4 table (07 §2.2 P0). This adds:
--   E5: certificate_events.action gains 'requirements_overridden' (the ONLY new action
--       07 permits, Section 1). Additive CHECK swap with the full 8-value list.
--   set_additional_insured_requirements(): the drawer's requirements editor save path.
--   get_additional_insured_requirements(): the generator reads the picked holder's
--       requirements to run the compliance evaluation.
--
-- E4 (certificates.snapshot.requirements_evaluation) needs no DDL: snapshot is jsonb and
-- the key is optional/additive.

-- E5: extend the certificate_events action taxonomy (07 Section 1 + §4.4).
alter table public.certificate_events drop constraint if exists certificate_events_action_check;
alter table public.certificate_events add constraint certificate_events_action_check
  check (action in (
    'generated','previewed','downloaded','emailed','reissued','voided','document_restored',
    'requirements_overridden'
  ));

-- Requirements editor save path (07 §4.3). resolve_additional_insured does NOT carry
-- requirements, so the drawer persists them through this dedicated, staff+workspace-gated
-- updater. Validates nothing about the jsonb shape here (the drawer validates on write and
-- the evaluator reads defensively) beyond staff authorization.
create or replace function public.set_additional_insured_requirements(
  p_id uuid,
  p_requirements jsonb default null,
  p_requirements_notes text default null
) returns void
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_ws uuid;
begin
  select agency_workspace_id into v_ws
    from public.additional_insureds
   where id = p_id and deleted_at is null and merged_into_id is null;
  if v_ws is null then
    raise exception 'additional insured not found';
  end if;
  if not (public.is_staff() and public.is_agency_member(v_ws)) then
    raise exception 'staff only';
  end if;
  update public.additional_insureds
     set requirements = p_requirements,
         requirements_notes = p_requirements_notes,
         updated_at = now()
   where id = p_id;
end;
$function$;
comment on function public.set_additional_insured_requirements(uuid, jsonb, text) is
  'Persist a holder requirements profile (07 §4.3). Staff + workspace gated. requirements is the closed schema {min_limits,flags,required_endorsement_forms,notice_days,required_lines}; requirements_notes is free text that never participates in evaluation.';
revoke execute on function public.set_additional_insured_requirements(uuid, jsonb, text) from anon, public;
grant  execute on function public.set_additional_insured_requirements(uuid, jsonb, text) to authenticated;

-- Requirements reader for the generator holder pick (07 §4.4). SECURITY INVOKER: the
-- additional_insureds staff+workspace RLS scopes what the caller can read.
create or replace function public.get_additional_insured_requirements(p_id uuid)
returns table(requirements jsonb, requirements_notes text)
language sql stable security invoker set search_path to 'public'
as $function$
  select ai.requirements, ai.requirements_notes
    from public.additional_insureds ai
   where ai.id = p_id
     and ai.deleted_at is null
     and ai.merged_into_id is null;
$function$;
comment on function public.get_additional_insured_requirements(uuid) is
  'Read a holder requirements profile for the generator compliance evaluation (07 §4.4). SECURITY INVOKER; additional_insureds RLS scopes the result.';
revoke execute on function public.get_additional_insured_requirements(uuid) from anon, public;
grant  execute on function public.get_additional_insured_requirements(uuid) to authenticated;
