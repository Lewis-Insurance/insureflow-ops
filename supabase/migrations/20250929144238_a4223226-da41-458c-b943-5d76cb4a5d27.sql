-- Fix the accounts_search_vector_tg function to prevent infinite recursion
CREATE OR REPLACE FUNCTION public.accounts_search_vector_tg()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Only update search vector if the relevant fields have actually changed
  IF TG_OP = 'UPDATE' AND (
    COALESCE(OLD.name, '') = COALESCE(NEW.name, '') AND
    COALESCE(OLD.email, '') = COALESCE(NEW.email, '') AND
    COALESCE(OLD.phone, '') = COALESCE(NEW.phone, '') AND
    COALESCE(OLD.tin_last4, '') = COALESCE(NEW.tin_last4, '')
  ) THEN
    RETURN NEW; -- No changes to searchable fields, exit early
  END IF;

  NEW.search_vector := 
    setweight(to_tsvector('simple', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.email, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.phone, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(NEW.tin_last4, '')), 'D');
  RETURN NEW;
END;
$function$;