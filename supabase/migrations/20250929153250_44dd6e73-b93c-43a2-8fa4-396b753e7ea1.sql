-- Fix the write_audit_log function that has incorrect JSONB syntax
CREATE OR REPLACE FUNCTION public.write_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'extensions', 'public'
AS $function$
declare
  current_user_id uuid;
  target_id uuid;
  payload jsonb;
begin
  -- Who did it (may be null for service actions)
  begin
    current_user_id := auth.uid();
  exception when others then
    current_user_id := null;
  end;

  -- Pick an ID to record - FIX: Use direct column access instead of JSONB syntax
  if (tg_op = 'INSERT') then
    target_id := new.id;  -- ✅ FIXED: was (new->>'id')::uuid
    payload := to_jsonb(new);
  elsif (tg_op = 'UPDATE') then
    target_id := new.id;  -- ✅ FIXED: was (new->>'id')::uuid
    payload := jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new));
  elsif (tg_op = 'DELETE') then
    target_id := old.id;  -- ✅ FIXED: was (old->>'id')::uuid
    payload := to_jsonb(old);
  end if;

  insert into public.audit_logs(user_id, action, entity, entity_id, details)
  values (current_user_id, tg_op, tg_table_name, target_id, payload);

  if (tg_op = 'DELETE') then
    return old;
  else
    return new;
  end if;
end
$function$;