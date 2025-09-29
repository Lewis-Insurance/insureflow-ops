-- Check for triggers that might be causing infinite recursion
-- Let's disable the potentially problematic triggers temporarily

-- First, let's see what triggers exist on accounts table
-- (This is informational - the actual fix follows)

-- The sync_account_types trigger seems to be modifying NEW which could cause recursion
-- Let's fix the sync_account_types function to prevent infinite loops

CREATE OR REPLACE FUNCTION public.sync_account_types()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
declare
  business_candidates text[] := array['business','organization','commercial','company','corp','corporate','biz'];
  home_candidates     text[] := array['household','personal','individual','consumer','residential'];

  v2_business_label text := public.pick_enum_label('account_type_v2'::regtype, business_candidates);
  v2_home_label     text := public.pick_enum_label('account_type_v2'::regtype, home_candidates);

  original_type text := OLD."type"::text;
  original_account_type text := OLD.account_type::text;
  new_type text := NEW."type"::text;
  new_account_type text := NEW.account_type::text;
begin
  -- Only update if values actually changed to prevent infinite recursion
  IF TG_OP = 'UPDATE' AND (
    COALESCE(original_type, '') = COALESCE(new_type, '') AND 
    COALESCE(original_account_type, '') = COALESCE(new_account_type, '')
  ) THEN
    RETURN NEW; -- No changes needed, exit early
  END IF;

  -- If TYPE provided and different from before, derive account_type
  if new."type" is not null and (TG_OP = 'INSERT' OR new."type"::text != COALESCE(original_type, '')) then
    if v2_business_label is not null and new."type"::text = v2_business_label then
      new.account_type := 'business';
    elsif v2_home_label is not null and new."type"::text = v2_home_label then
      new.account_type := 'individual';
    end if;
  end if;

  -- If ACCOUNT_TYPE provided and different from before, derive TYPE
  if new.account_type is not null and (TG_OP = 'INSERT' OR new.account_type::text != COALESCE(original_account_type, '')) then
    if new.account_type = 'business' and v2_business_label is not null then
      new."type" := v2_business_label::account_type_v2;
    elsif new.account_type = 'individual' and v2_home_label is not null then
      new."type" := v2_home_label::account_type_v2;
    end if;
  end if;

  return new;
end
$function$;