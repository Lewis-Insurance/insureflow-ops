-- Implement real CSV batch processing function
CREATE OR REPLACE FUNCTION public.process_csv_batch(
  batch_id uuid,
  import_type text DEFAULT 'accounts',
  field_mapping jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;