-- Enable the http extension if not already enabled
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- Create a function to call the edge function via webhook
CREATE OR REPLACE FUNCTION public.trigger_on_parse_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  payload jsonb;
BEGIN
  -- Build the payload with the new record
  payload := jsonb_build_object(
    'record', to_jsonb(NEW),
    'type', 'INSERT',
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA
  );

  -- Make async HTTP POST request to the edge function
  PERFORM extensions.http_post(
    url := 'https://lrqajzwcmdwahnjyidgv.functions.supabase.co/on_parse_complete',
    body := payload::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    )
  );

  RETURN NEW;
END;
$$;

-- Create the trigger on parsed_documents table
DROP TRIGGER IF EXISTS on_parsed_document_insert ON public.parsed_documents;

CREATE TRIGGER on_parsed_document_insert
AFTER INSERT ON public.parsed_documents
FOR EACH ROW
EXECUTE FUNCTION public.trigger_on_parse_complete();

-- Add comment for documentation
COMMENT ON FUNCTION public.trigger_on_parse_complete() IS 
'Webhook trigger that calls on_parse_complete edge function when a new document is parsed';
