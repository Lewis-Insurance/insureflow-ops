-- Cancellation notice workflow (07 §5): detection read model + a dedicated trigger.
--
-- Verify-first (07 §5.2) RESOLVED: policies.status is free text with values
-- {active, cancelled, expired, inactive, lapsed, lost, non_renewed}; the cancellation
-- transitions are 'cancelled' and 'non_renewed'. There is NO existing cancellation-notice
-- pipeline (the policies triggers are audit/search/updated-at/renewal-sync/automation-rules/
-- activation; the cancel_* functions are automation-enrollment/outbox), so this adds a
-- dedicated AFTER UPDATE OF status trigger rather than hooking a parallel one. tasks is
-- scoped by account_id (no agency_workspace_id column) and has dedupe_key for idempotency.
--
-- v1 scope: detection + one task + the holder list. Automated notice letters are P2.

-- ---------------------------------------------------------------------------
-- 1) list_active_cert_holders_for_policy(p_policy_id) -- the holder list (07 §5.2)
--    Active certs (issued/sent, not superseded/voided) that reference the policy, with
--    the promised-notice identity (snapshot holder name + mailing address), the live
--    directory holder_id, and the holder's notice_days from requirements if set.
--    EXISTS (not a join) so a cert referencing the policy on multiple lines is not
--    duplicated. SECURITY INVOKER: certificates staff+workspace RLS scopes the result.
-- ---------------------------------------------------------------------------
create or replace function public.list_active_cert_holders_for_policy(p_policy_id uuid)
returns table(
  certificate_id     uuid,
  certificate_number text,
  holder_id          uuid,
  holder_name        text,
  holder_address     jsonb,
  issued_at          timestamptz,
  notice_days        integer
)
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select
    c.id                                   as certificate_id,
    c.certificate_number,
    c.holder_id,
    c.snapshot->'holder'->>'name'          as holder_name,
    c.snapshot->'holder'->'address'        as holder_address,
    c.issued_at,
    nullif(ai.requirements->>'notice_days','')::integer as notice_days
  from public.certificates c
  left join public.additional_insureds ai on ai.id = c.holder_id
  where c.status in ('issued', 'sent')
    and c.superseded_by_id is null
    and exists (
      select 1 from public.certificate_policies cp
      where cp.certificate_id = c.id and cp.policy_id = p_policy_id
    )
  order by c.issued_at desc;
$function$;

comment on function public.list_active_cert_holders_for_policy(uuid) is
  'Cancellation notice holder list (07 §5.2): active certs referencing the policy, with the promised-notice snapshot identity (name+address), the live holder_id, and notice_days from the holder requirements. SECURITY INVOKER; certificates RLS scopes it.';

revoke execute on function public.list_active_cert_holders_for_policy(uuid) from anon, public;
grant  execute on function public.list_active_cert_holders_for_policy(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Detection trigger: on a policy transitioning INTO cancelled/non_renewed, create
--    exactly ONE system task naming the affected holder count. No task when there are
--    zero active certs. Idempotent: skip when an OPEN system task already exists for this
--    policy cancellation (dedupe_key). SECURITY DEFINER so the task insert is not blocked
--    by the updating user's RLS.
-- ---------------------------------------------------------------------------
create or replace function public.notify_cert_holders_on_policy_cancel()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_count integer;
  v_dedupe text := 'cancellation_notice:' || NEW.id::text;
begin
  -- Fire only on a genuine transition INTO cancelled/non_renewed.
  if NEW.status not in ('cancelled', 'non_renewed')
     or OLD.status is not distinct from NEW.status
     or OLD.status in ('cancelled', 'non_renewed') then
    return NEW;
  end if;

  -- Active cert holders promised notice on this policy.
  select count(*) into v_count
  from public.certificates c
  where c.status in ('issued', 'sent')
    and c.superseded_by_id is null
    and exists (
      select 1 from public.certificate_policies cp
      where cp.certificate_id = c.id and cp.policy_id = NEW.id
    );

  if v_count = 0 then
    return NEW;   -- No task when the policy has zero active certs (07 §5.3).
  end if;

  -- Idempotency: skip when an open system task for this policy cancellation exists.
  if exists (
    select 1 from public.tasks t
    where t.dedupe_key = v_dedupe
      and t.deleted_at is null
      and t.status not in ('completed', 'cancelled')
  ) then
    return NEW;
  end if;

  insert into public.tasks (
    account_id, source, status, priority, title, description,
    entity_type, entity_id, policy_id, dedupe_key
  ) values (
    NEW.account_id, 'system', 'pending', 'high',
    'Notify certificate holders: policy ' || coalesce(nullif(btrim(NEW.policy_number), ''), '(no number)') || ' ' || NEW.status,
    'Policy ' || coalesce(nullif(btrim(NEW.policy_number), ''), '') || ' transitioned to ' || NEW.status || '. '
      || v_count || ' active certificate holder(s) were promised notice of cancellation. '
      || 'Open the policy to review the holder list and mark each notified.',
    'policy', NEW.id, NEW.id, v_dedupe
  );

  return NEW;
end;
$function$;

drop trigger if exists trg_notify_cert_holders_on_policy_cancel on public.policies;
create trigger trg_notify_cert_holders_on_policy_cancel
after update of status on public.policies
for each row execute function public.notify_cert_holders_on_policy_cancel();
