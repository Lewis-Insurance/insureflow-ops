-- Fix Supabase security issues
-- 1. Replace security definer views with proper functions (if any exist)
-- 2. Move pg_trgm extension to extensions schema
-- 3. Update existing functions to have proper search_path

-- Check current extensions in public schema
-- Move pg_trgm to extensions schema if it exists
DO $$
BEGIN
    -- Only move if extension exists in public
    IF EXISTS (
        SELECT 1 FROM pg_extension e 
        JOIN pg_namespace n ON e.extnamespace = n.oid 
        WHERE e.extname = 'pg_trgm' AND n.nspname = 'public'
    ) THEN
        -- Create extensions schema if it doesn't exist
        CREATE SCHEMA IF NOT EXISTS extensions;
        
        -- Move extension to extensions schema
        ALTER EXTENSION pg_trgm SET SCHEMA extensions;
        
        -- Update search_path for functions that use pg_trgm
        UPDATE pg_proc SET prosrc = replace(prosrc, 'similarity(', 'extensions.similarity(')
        WHERE proname IN ('scan_for_duplicates', 'find_account_dupes');
    END IF;
EXCEPTION
    WHEN insufficient_privilege THEN
        -- Skip if we don't have permissions to move extensions
        NULL;
    WHEN OTHERS THEN
        -- Log other errors but continue
        RAISE WARNING 'Could not move pg_trgm extension: %', SQLERRM;
END
$$;

-- Update functions to have proper search_path (fix WARN 4)
-- Update scan_for_duplicates function
CREATE OR REPLACE FUNCTION public.scan_for_duplicates(entity_type text DEFAULT 'accounts'::text, similarity_threshold numeric DEFAULT 0.8)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  duplicate_groups jsonb := '[]'::jsonb;
  result jsonb;
  account_dupes RECORD;
  contact_dupes RECORD;
  groups_found integer := 0;
  group_data jsonb;
BEGIN
  -- Scan for account duplicates
  IF entity_type = 'accounts' THEN
    FOR account_dupes IN
      WITH paired AS (
        SELECT 
          a.id as primary_id, 
          b.id as duplicate_id,
          GREATEST(
            CASE WHEN a.email IS NOT NULL AND a.email = b.email THEN 1.0 ELSE 0 END,
            CASE WHEN a.phone IS NOT NULL AND a.phone = b.phone THEN 0.95 ELSE 0 END,
            COALESCE(similarity(a.name, b.name), 0)
          ) as score
        FROM accounts a
        JOIN accounts b ON a.id < b.id
        WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL
      )
      SELECT primary_id, duplicate_id, score 
      FROM paired 
      WHERE score >= similarity_threshold 
      ORDER BY score DESC
    LOOP
      groups_found := groups_found + 1;
      
      -- Create duplicate group entry
      INSERT INTO duplicate_groups (
        entity_type,
        entity_ids,
        match_score,
        status
      ) VALUES (
        'accounts',
        ARRAY[account_dupes.primary_id, account_dupes.duplicate_id],
        account_dupes.score,
        'pending'
      );
      
      -- Build group data for response
      group_data := jsonb_build_object(
        'primary_id', account_dupes.primary_id,
        'duplicate_id', account_dupes.duplicate_id,
        'match_score', account_dupes.score,
        'entity_type', 'accounts'
      );
      
      duplicate_groups := duplicate_groups || jsonb_build_array(group_data);
    END LOOP;
    
  -- Scan for contact duplicates  
  ELSIF entity_type = 'contacts' THEN
    FOR contact_dupes IN
      WITH paired AS (
        SELECT 
          a.id as primary_id, 
          b.id as duplicate_id,
          GREATEST(
            CASE WHEN a.email IS NOT NULL AND a.email = b.email THEN 1.0 ELSE 0 END,
            CASE WHEN a.phone IS NOT NULL AND a.phone = b.phone THEN 0.95 ELSE 0 END,
            COALESCE(similarity(a.first_name || ' ' || a.last_name, b.first_name || ' ' || b.last_name), 0)
          ) as score
        FROM contacts a
        JOIN contacts b ON a.id < b.id  
        WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL
      )
      SELECT primary_id, duplicate_id, score 
      FROM paired 
      WHERE score >= similarity_threshold 
      ORDER BY score DESC
    LOOP
      groups_found := groups_found + 1;
      
      -- Create duplicate group entry
      INSERT INTO duplicate_groups (
        entity_type,
        entity_ids,
        match_score,
        status
      ) VALUES (
        'contacts',
        ARRAY[contact_dupes.primary_id, contact_dupes.duplicate_id],
        contact_dupes.score,
        'pending'
      );
      
      -- Build group data for response
      group_data := jsonb_build_object(
        'primary_id', contact_dupes.primary_id,
        'duplicate_id', contact_dupes.duplicate_id,
        'match_score', contact_dupes.score,
        'entity_type', 'contacts'
      );
      
      duplicate_groups := duplicate_groups || jsonb_build_array(group_data);
    END LOOP;
  END IF;
  
  -- Return results
  result := jsonb_build_object(
    'entity_type', entity_type,
    'groups_found', groups_found,
    'groups', duplicate_groups,
    'scanned_at', now()
  );
  
  RETURN result;
END;
$function$;

-- Update process_csv_batch function  
CREATE OR REPLACE FUNCTION public.process_csv_batch(batch_id uuid, import_type text DEFAULT 'accounts'::text, field_mapping jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  processed_count integer := 0;
  success_count integer := 0;
  error_count integer := 0;
  result jsonb;
  staging_row RECORD;
  mapped_row jsonb;
  new_account_id uuid;
  new_contact_id uuid;
BEGIN
  -- Update batch status to processing
  UPDATE import_batches 
  SET status = 'processing', started_at = now()
  WHERE id = batch_id;
  
  -- Process each row in the staging table for this batch
  FOR staging_row IN 
    SELECT * FROM import_staging 
    WHERE batch_id = process_csv_batch.batch_id
    ORDER BY row_number
  LOOP
    processed_count := processed_count + 1;
    
    BEGIN
      -- Apply field mapping to convert raw data to mapped data
      mapped_row := jsonb_build_object();
      
      -- Process accounts
      IF import_type = 'accounts' THEN
        INSERT INTO accounts (
          name, 
          type,
          email,
          phone,
          address_line1,
          city,
          state,
          zip_code
        ) VALUES (
          COALESCE(staging_row.raw_data->>(field_mapping->>'name'), ''),
          COALESCE((staging_row.raw_data->>(field_mapping->>'type'))::account_type, 'individual'),
          staging_row.raw_data->>(field_mapping->>'email'),
          staging_row.raw_data->>(field_mapping->>'phone'),
          staging_row.raw_data->>(field_mapping->>'address_line1'),
          staging_row.raw_data->>(field_mapping->>'city'),
          staging_row.raw_data->>(field_mapping->>'state'),
          staging_row.raw_data->>(field_mapping->>'zip_code')
        ) RETURNING id INTO new_account_id;
        
        -- Update staging row with entity_id
        UPDATE import_staging 
        SET entity_id = new_account_id, validation_status = 'valid'
        WHERE id = staging_row.id;
        
      -- Process contacts  
      ELSIF import_type = 'contacts' THEN
        INSERT INTO contacts (
          first_name,
          last_name,
          email,
          phone,
          account_id,
          role
        ) VALUES (
          COALESCE(staging_row.raw_data->>(field_mapping->>'first_name'), ''),
          COALESCE(staging_row.raw_data->>(field_mapping->>'last_name'), ''),
          staging_row.raw_data->>(field_mapping->>'email'),
          staging_row.raw_data->>(field_mapping->>'phone'),
          COALESCE((staging_row.raw_data->>(field_mapping->>'account_id'))::uuid, gen_random_uuid()),
          staging_row.raw_data->>(field_mapping->>'role')
        ) RETURNING id INTO new_contact_id;
        
        -- Update staging row with entity_id
        UPDATE import_staging 
        SET entity_id = new_contact_id, validation_status = 'valid'
        WHERE id = staging_row.id;
      END IF;
      
      success_count := success_count + 1;
      
    EXCEPTION WHEN OTHERS THEN
      -- Handle validation/insert errors
      UPDATE import_staging 
      SET validation_status = 'invalid',
          validation_errors = jsonb_build_array(SQLERRM)
      WHERE id = staging_row.id;
      
      error_count := error_count + 1;
    END;
  END LOOP;
  
  -- Update final batch status
  UPDATE import_batches 
  SET 
    status = 'completed',
    completed_at = now(),
    processed_rows = processed_count,
    successful_rows = success_count,
    error_rows = error_count
  WHERE id = batch_id;
  
  -- Return results
  result := jsonb_build_object(
    'batch_id', batch_id,
    'processed_rows', processed_count,
    'successful_rows', success_count,
    'error_rows', error_count,
    'status', 'completed'
  );
  
  RETURN result;
END;
$function$;