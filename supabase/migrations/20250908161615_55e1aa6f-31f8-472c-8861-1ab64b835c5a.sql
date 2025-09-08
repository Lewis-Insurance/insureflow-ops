-- =========================================================
-- FINAL SECURITY HARDENING - Fix remaining function search paths
-- =========================================================

-- Fix remaining functions that need search_path set

-- Update process_csv_batch function
CREATE OR REPLACE FUNCTION public.process_csv_batch(batch_id uuid, import_type text DEFAULT 'accounts'::text, field_mapping jsonb DEFAULT '{}'::jsonb)
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

-- Update merge_duplicate_records function
CREATE OR REPLACE FUNCTION public.merge_duplicate_records(group_id uuid, survivor_id uuid, merged_data jsonb DEFAULT NULL::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  group_record RECORD;
  merged_ids uuid[];
  entity_type_val text;
  current_user_id uuid;
  merge_count integer := 0;
BEGIN
  -- Get current user
  current_user_id := auth.uid();
  
  -- Get the duplicate group information
  SELECT * INTO group_record
  FROM duplicate_groups 
  WHERE id = group_id AND status = 'pending';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Duplicate group not found or already processed';
  END IF;
  
  entity_type_val := group_record.entity_type;
  merged_ids := array_remove(group_record.entity_ids, survivor_id);
  
  -- Verify survivor_id is in the group
  IF NOT (survivor_id = ANY(group_record.entity_ids)) THEN
    RAISE EXCEPTION 'Survivor ID not found in duplicate group';
  END IF;
  
  -- Perform the merge based on entity type
  IF entity_type_val = 'accounts' THEN
    -- Update related records to point to survivor account
    UPDATE contacts SET account_id = survivor_id 
    WHERE account_id = ANY(merged_ids);
    
    UPDATE policies SET account_id = survivor_id 
    WHERE account_id = ANY(merged_ids);
    
    UPDATE call_sessions SET account_id = survivor_id 
    WHERE account_id = ANY(merged_ids);
    
    UPDATE sms_messages SET account_id = survivor_id 
    WHERE account_id = ANY(merged_ids);
    
    -- Soft delete the merged accounts
    UPDATE accounts 
    SET deleted_at = now() 
    WHERE id = ANY(merged_ids);
    
    merge_count := array_length(merged_ids, 1);
    
  ELSIF entity_type_val = 'contacts' THEN
    -- Update related records to point to survivor contact  
    UPDATE call_sessions SET contact_id = survivor_id 
    WHERE contact_id = ANY(merged_ids);
    
    UPDATE sms_messages SET contact_id = survivor_id 
    WHERE contact_id = ANY(merged_ids);
    
    UPDATE consents SET contact_id = survivor_id 
    WHERE contact_id = ANY(merged_ids);
    
    -- Soft delete the merged contacts
    UPDATE contacts 
    SET deleted_at = now() 
    WHERE id = ANY(merged_ids);
    
    merge_count := array_length(merged_ids, 1);
  END IF;
  
  -- Record the merge in history
  INSERT INTO merge_history (
    entity_type,
    survivor_id,
    merged_ids,
    merge_data,
    merged_by
  ) VALUES (
    entity_type_val,
    survivor_id,
    merged_ids,
    COALESCE(merged_data, '{}'::jsonb),
    current_user_id
  );
  
  -- Update the duplicate group status
  UPDATE duplicate_groups 
  SET 
    status = 'merged',
    reviewed_at = now(),
    reviewed_by = current_user_id
  WHERE id = group_id;
  
  -- Return results
  result := jsonb_build_object(
    'group_id', group_id,
    'survivor_id', survivor_id,
    'merged_records', merge_count,
    'merged_ids', merged_ids,
    'entity_type', entity_type_val,
    'merged_at', now()
  );
  
  RETURN result;
END;
$$;

-- Additional security hardening - ensure sensitive operations are restricted
REVOKE ALL ON FUNCTION public.process_csv_batch(uuid, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.process_csv_batch(uuid, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.merge_duplicate_records(uuid, uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.merge_duplicate_records(uuid, uuid, jsonb) TO authenticated;