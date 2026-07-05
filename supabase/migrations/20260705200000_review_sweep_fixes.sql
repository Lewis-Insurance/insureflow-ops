-- ============================================================================
-- Review sweep fixes (unaddressed Bugbot/Codex findings from PRs #42/#43/#47)
-- ============================================================================
-- 1) get_additional_insured_requirements: grant service_role (generate-
--    certificate calls it through the admin client on every issuance). Prod
--    already carries this grant; the repo migration (20260704170000) did not -
--    this makes the repo match prod. Idempotent.
-- 2) list_active_cert_holders_for_policy: a non-numeric notice_days in a
--    holder's requirements JSON crashed the ::integer cast and took down the
--    whole cancellation holder list. Guard with a digits-only match.
-- 3) notify_cert_holders_on_policy_cancel:
--    a) the open-task guard's prefix match missed LEGACY keys written by
--       20260704180000 (exactly 'cancellation_notice:<id>', no suffix), so a
--       still-open legacy task would not suppress a duplicate. Match both.
--    b) the system task was created with no created_by/assignee_id, and the
--       tasks update policy only lets the assignee, creator, or an admin
--       update - so a CSR could never complete the notice task. The trigger
--       runs in the cancelling user's session: stamp them as creator+assignee.

grant execute on function public.get_additional_insured_requirements(uuid) to service_role;

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
    -- Digits-only guard: garbage notice_days must not crash the list.
    case when ai.requirements->>'notice_days' ~ '^[0-9]{1,4}$'
         then (ai.requirements->>'notice_days')::integer end as notice_days
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

create or replace function public.notify_cert_holders_on_policy_cancel()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_count integer;
  v_legacy text := 'cancellation_notice:' || NEW.id::text;
  v_prefix text := 'cancellation_notice:' || NEW.id::text || ':';
  v_dedupe text := 'cancellation_notice:' || NEW.id::text || ':' || NEW.status
                   || ':' || to_char(now(), 'YYYYMMDD"T"HH24MISS');
begin
  if NEW.status not in ('cancelled', 'non_renewed')
     or OLD.status is not distinct from NEW.status
     or OLD.status in ('cancelled', 'non_renewed') then
    return NEW;
  end if;

  select count(*) into v_count
  from public.certificates c
  where c.status in ('issued', 'sent')
    and c.superseded_by_id is null
    and exists (
      select 1 from public.certificate_policies cp
      where cp.certificate_id = c.id and cp.policy_id = NEW.id
    );

  if v_count = 0 then
    return NEW;
  end if;

  -- Open-task guard: match the episode-scoped prefix AND the bare legacy key
  -- (rows created before 20260705120000 have no suffix).
  if exists (
    select 1 from public.tasks t
    where (t.dedupe_key = v_legacy or t.dedupe_key like v_prefix || '%')
      and t.deleted_at is null
      and t.status not in ('completed', 'cancelled')
  ) then
    return NEW;
  end if;

  insert into public.tasks (
    account_id, source, status, priority, title, description,
    entity_type, entity_id, policy_id, dedupe_key, created_by, assignee_id
  ) values (
    NEW.account_id, 'system', 'pending', 'high',
    'Notify certificate holders: policy ' || coalesce(nullif(btrim(NEW.policy_number), ''), '(no number)') || ' ' || NEW.status,
    'Policy ' || coalesce(nullif(btrim(NEW.policy_number), ''), '') || ' transitioned to ' || NEW.status || '. '
      || v_count || ' active certificate holder(s) were promised notice of cancellation. '
      || 'Open the policy to review the holder list and mark each notified.',
    'policy', NEW.id, NEW.id, v_dedupe,
    auth.uid(), auth.uid()
  )
  on conflict (dedupe_key) do nothing;

  return NEW;
end;
$function$;
