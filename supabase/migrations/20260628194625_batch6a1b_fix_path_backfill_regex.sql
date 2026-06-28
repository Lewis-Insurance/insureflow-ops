-- Batch 6A (part 1b) — fix the path extraction to handle URLs both WITH and WITHOUT the
-- /public/ segment (the acord_templates seeds use /object/acord-templates/<file> with no /public/).
-- Strips scheme+host+/object/ + optional public/|sign/ + the bucket segment + any ?query string.
UPDATE public.acord_templates
  SET pdf_template_path = nullif(split_part(regexp_replace(regexp_replace(pdf_template_url,'^.*/object/(public/|sign/)?',''),'^[^/]+/',''),'?',1),'')
  WHERE pdf_template_url IS NOT NULL;
UPDATE public.acord_forms
  SET pdf_path = nullif(split_part(regexp_replace(regexp_replace(pdf_url,'^.*/object/(public/|sign/)?',''),'^[^/]+/',''),'?',1),'')
  WHERE pdf_url IS NOT NULL;
UPDATE public.carrier_document_templates
  SET sample_document_path = nullif(split_part(regexp_replace(regexp_replace(sample_document_url,'^.*/object/(public/|sign/)?',''),'^[^/]+/',''),'?',1),'')
  WHERE sample_document_url IS NOT NULL;
