-- Cancellation notice trigger: stop a second cancellation from aborting the
-- policy status UPDATE (audit finding, MAJOR).
--
-- BUG: notify_cert_holders_on_policy_cancel() keyed the notice task's dedupe_key
-- as 'cancellation_notice:<policy_id>' -- permanent per policy. tasks.dedupe_key
-- has a NON-partial UNIQUE index (tasks_dedupe_key_unique), and the idempotency
-- guard only skipped when an OPEN task existed. So once the first notice task was
-- completed, a genuinely new cancellation episode (policy reinstated -> active,
-- then re-cancelled, or cancelled -> non_renewed) passed the open-task guard,
-- reached the INSERT, and collided with the completed task's key. Because this is
-- an AFTER UPDATE trigger, the unique violation rolled back the entire policy
-- status update -- staff could no longer re-cancel/non-renew that policy.
--
-- FIX (preserves the evident intent -- a new cancellation episode SHOULD re-task
-- holders, which is why the guard checked for an OPEN task rather than any task):
--   1. Episode-scope the full dedupe_key (append status + a timestamp) so a new
--      cancellation never collides with a resolved task from a prior episode.
--   2. Keep the "don't stack a second OPEN task for this policy" idempotency guard,
--      but match on the stable per-policy PREFIX (the full key now varies per
--      episode). The firing guards already ensure the trigger fires at most once
--      per active->cancelled transition, so this only suppresses a rare concurrent
--      double-fire.
--   3. Add ON CONFLICT (dedupe_key) DO NOTHING as a hard backstop so NO path can
--      ever abort the status UPDATE, even if a key somehow repeats.
-- Idempotent: CREATE OR REPLACE only; the existing trigger already binds this fn.

create or replace function public.notify_cert_holders_on_policy_cancel()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_count integer;
  -- Stable per-policy prefix for the open-task idempotency check.
  v_prefix text := 'cancellation_notice:' || NEW.id::text || ':';
  -- Episode-scoped full key: prefix + the transition status + a timestamp, so a
  -- later cancellation episode of the same policy gets its own key.
  v_dedupe text := 'cancellation_notice:' || NEW.id::text || ':' || NEW.status
                   || ':' || to_char(now(), 'YYYYMMDD"T"HH24MISS');
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

  -- Idempotency: skip when an OPEN notice task for THIS policy already exists
  -- (prefix match; the full key is episode-scoped). Allows a fresh task once the
  -- prior one is resolved, but never stacks two open tasks for one cancellation.
  if exists (
    select 1 from public.tasks t
    where t.dedupe_key like v_prefix || '%'
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
  )
  -- Hard backstop: an AFTER UPDATE trigger must never abort the status change.
  on conflict (dedupe_key) do nothing;

  return NEW;
end;
$function$;
