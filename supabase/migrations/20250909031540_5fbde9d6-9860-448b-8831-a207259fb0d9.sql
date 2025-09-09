-- Add compatibility views for any remaining legacy code
CREATE OR REPLACE VIEW public.insureds AS
SELECT
  a.id,
  COALESCE(ip.type, a.type::text) as type,
  COALESCE(ip.display_name, a.name) as name,
  COALESCE(ip.updated_at, a.updated_at) as updated_at,
  a.search_vector,
  (SELECT ie.email FROM public.insured_emails ie WHERE ie.account_id = a.id ORDER BY ie.is_primary DESC, ie.created_at ASC LIMIT 1) as primary_contact_email,
  (SELECT ipn.e164 FROM public.insured_phones ipn WHERE ipn.account_id = a.id ORDER BY ipn.is_primary DESC, ipn.created_at ASC LIMIT 1) as phone,
  (SELECT ie.email FROM public.insured_emails ie WHERE ie.account_id = a.id ORDER BY ie.is_primary DESC, ie.created_at ASC LIMIT 1) as email
FROM public.accounts a
LEFT JOIN public.insured_profiles ip ON ip.account_id = a.id;

-- Add profiles view for any remaining legacy code that references contacts as profiles
CREATE OR REPLACE VIEW public.profiles AS
SELECT
  c.id,
  c.first_name,
  c.last_name,
  c.email,
  c.phone,
  c.account_id,
  c.updated_at,
  c.created_at
FROM public.contacts c;

-- Ensure the search vector trigger exists for accounts table
CREATE OR REPLACE FUNCTION public.accounts_search_vector_tg()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('simple', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.email, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.phone, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(NEW.tin_last4, '')), 'D');
  RETURN NEW;
END;
$function$;

-- Create trigger if it doesn't exist
DROP TRIGGER IF EXISTS accounts_search_vector_tg ON public.accounts;
CREATE TRIGGER accounts_search_vector_tg
  BEFORE INSERT OR UPDATE OF name, email, phone, tin_last4 ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.accounts_search_vector_tg();

-- Ensure GIN index exists
CREATE INDEX IF NOT EXISTS accounts_search_vector_gin
  ON public.accounts USING gin (search_vector);