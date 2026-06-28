-- =====================================================================
-- Batch 1E — fix sync_account_types so it resolves commercial_business
-- =====================================================================
-- Root cause: pick_enum_label does EXACT enum-label matching, but the
-- business_candidates list (business/organization/commercial/...) never contained
-- 'commercial_business' (the account_type_v2 label), so the trigger could not map
-- type='commercial_business' -> account_type='business'. Fix: add 'commercial_business'
-- (first, preferred) to the candidate list. account_type_v2={household,commercial_business};
-- account_type(account_type_new)={individual,business,household}. 2026-06-28
-- =====================================================================

CREATE OR REPLACE FUNCTION public.sync_account_types()
RETURNS trigger LANGUAGE plpgsql AS $function$
declare
  business_candidates text[] := array['commercial_business','business','organization','commercial','company','corp','corporate','biz'];
  home_candidates     text[] := array['household','personal','individual','consumer','residential'];

  v2_business_label text := public.pick_enum_label('account_type_v2'::regtype, business_candidates);
  v2_home_label     text := public.pick_enum_label('account_type_v2'::regtype, home_candidates);

  original_type text := OLD."type"::text;
  original_account_type text := OLD.account_type::text;
  new_type text := NEW."type"::text;
  new_account_type text := NEW.account_type::text;
begin
  IF TG_OP = 'UPDATE' AND (
    COALESCE(original_type, '') = COALESCE(new_type, '') AND
    COALESCE(original_account_type, '') = COALESCE(new_account_type, '')
  ) THEN
    RETURN NEW;
  END IF;

  if new."type" is not null and (TG_OP = 'INSERT' OR new."type"::text != COALESCE(original_type, '')) then
    if v2_business_label is not null and new."type"::text = v2_business_label then
      new.account_type := 'business';
    elsif v2_home_label is not null and new."type"::text = v2_home_label then
      new.account_type := 'individual';
    end if;
  end if;

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