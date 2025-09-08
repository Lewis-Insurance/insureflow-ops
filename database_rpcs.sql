-- RPC function for CSV batch processing
CREATE OR REPLACE FUNCTION public.process_csv_batch(
  batch_id uuid,
  import_type text,
  field_mapping jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  batch_record import_batches%ROWTYPE;
  staging_rows import_staging[];
  processed_count integer := 0;
  success_count integer := 0;
  error_count integer := 0;
  current_row import_staging%ROWTYPE;
  mapped_data jsonb;
  validation_errors jsonb := '[]'::jsonb;
  result jsonb;
BEGIN
  -- Get batch record
  SELECT * INTO batch_record FROM import_batches WHERE id = batch_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found: %', batch_id;
  END IF;
  
  -- Update batch status
  UPDATE import_batches 
  SET status = 'processing', started_at = now()
  WHERE id = batch_id;
  
  -- Get staging rows for this batch
  SELECT array_agg(s ORDER BY s.row_number) INTO staging_rows
  FROM import_staging s
  WHERE s.batch_id = batch_id;
  
  -- Process each row
  FOR i IN 1..array_length(staging_rows, 1) LOOP
    current_row := staging_rows[i];
    processed_count := processed_count + 1;
    
    -- Apply field mapping
    mapped_data := '{}';
    FOR key, value IN SELECT * FROM jsonb_each_text(field_mapping) LOOP
      IF current_row.raw_data ? key THEN
        mapped_data := jsonb_set(mapped_data, ARRAY[value], to_jsonb(current_row.raw_data->>key));
      END IF;
    END LOOP;
    
    -- Validate mapped data
    IF import_type = 'accounts' THEN
      -- Validate account data
      IF NOT (mapped_data ? 'name' AND length(mapped_data->>'name') > 0) THEN
        validation_errors := validation_errors || '["Account name is required"]'::jsonb;
        error_count := error_count + 1;
        
        UPDATE import_staging 
        SET validation_status = 'invalid',
            validation_errors = validation_errors::text::jsonb,
            mapped_data = mapped_data
        WHERE id = current_row.id;
        
        CONTINUE;
      END IF;
      
      -- Insert valid account
      BEGIN
        INSERT INTO accounts (name, email, phone, type, address_line1, city, state, zip_code)
        VALUES (
          mapped_data->>'name',
          mapped_data->>'email',
          mapped_data->>'phone',
          COALESCE(mapped_data->>'type', 'individual')::account_type,
          mapped_data->>'address_line1',
          mapped_data->>'city',
          mapped_data->>'state',
          mapped_data->>'zip_code'
        );
        
        success_count := success_count + 1;
        
        UPDATE import_staging 
        SET validation_status = 'valid',
            mapped_data = mapped_data
        WHERE id = current_row.id;
        
      EXCEPTION WHEN OTHERS THEN
        error_count := error_count + 1;
        
        UPDATE import_staging 
        SET validation_status = 'invalid',
            validation_errors = jsonb_build_array(SQLERRM),
            mapped_data = mapped_data
        WHERE id = current_row.id;
      END;
      
    ELSIF import_type = 'contacts' THEN
      -- Validate contact data
      IF NOT (mapped_data ? 'first_name' AND length(mapped_data->>'first_name') > 0) OR
         NOT (mapped_data ? 'last_name' AND length(mapped_data->>'last_name') > 0) THEN
        validation_errors := validation_errors || '["First and last name are required"]'::jsonb;
        error_count := error_count + 1;
        
        UPDATE import_staging 
        SET validation_status = 'invalid',
            validation_errors = validation_errors::text::jsonb,
            mapped_data = mapped_data
        WHERE id = current_row.id;
        
        CONTINUE;
      END IF;
      
      -- Insert valid contact
      BEGIN
        INSERT INTO contacts (first_name, last_name, email, phone, account_id)
        VALUES (
          mapped_data->>'first_name',
          mapped_data->>'last_name',
          mapped_data->>'email',
          mapped_data->>'phone',
          (mapped_data->>'account_id')::uuid
        );
        
        success_count := success_count + 1;
        
        UPDATE import_staging 
        SET validation_status = 'valid',
            mapped_data = mapped_data
        WHERE id = current_row.id;
        
      EXCEPTION WHEN OTHERS THEN
        error_count := error_count + 1;
        
        UPDATE import_staging 
        SET validation_status = 'invalid',
            validation_errors = jsonb_build_array(SQLERRM),
            mapped_data = mapped_data
        WHERE id = current_row.id;
      END;
    END IF;
  END LOOP;
  
  -- Update batch with final results
  UPDATE import_batches 
  SET 
    status = 'completed',
    processed_rows = processed_count,
    successful_rows = success_count,
    error_rows = error_count,
    completed_at = now()
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

-- RPC function for duplicate detection
CREATE OR REPLACE FUNCTION public.scan_for_duplicates(
  entity_type text DEFAULT 'accounts',
  similarity_threshold numeric DEFAULT 0.8
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  duplicate_groups jsonb := '[]'::jsonb;
  current_group jsonb;
  group_id uuid;
  similarity_score numeric;
  rec1 record;
  rec2 record;
BEGIN
  IF entity_type = 'accounts' THEN
    -- Find potential duplicate accounts based on name and email similarity
    FOR rec1 IN 
      SELECT id, name, email, phone 
      FROM accounts 
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
    LOOP
      -- Find similar accounts
      FOR rec2 IN
        SELECT id, name, email, phone,
               GREATEST(
                 similarity(rec1.name, name),
                 CASE WHEN rec1.email IS NOT NULL AND email IS NOT NULL 
                      THEN similarity(rec1.email, email) 
                      ELSE 0 END
               ) as match_score
        FROM accounts 
        WHERE deleted_at IS NULL 
          AND id > rec1.id  -- Avoid duplicate pairs
          AND (
            similarity(rec1.name, name) >= similarity_threshold OR
            (rec1.email IS NOT NULL AND email IS NOT NULL AND similarity(rec1.email, email) >= similarity_threshold)
          )
      LOOP
        -- Create or update duplicate group
        group_id := gen_random_uuid();
        
        current_group := jsonb_build_object(
          'id', group_id,
          'entity_type', 'accounts',
          'entity_ids', jsonb_build_array(rec1.id, rec2.id),
          'match_score', rec2.match_score,
          'status', 'pending',
          'created_at', now()
        );
        
        duplicate_groups := duplicate_groups || current_group;
        
        -- Insert into duplicate_groups table
        INSERT INTO duplicate_groups (
          id, entity_type, entity_ids, match_score, status, created_at
        ) VALUES (
          group_id,
          'accounts',
          ARRAY[rec1.id, rec2.id],
          rec2.match_score,
          'pending',
          now()
        ) ON CONFLICT DO NOTHING;
      END LOOP;
    END LOOP;
    
  ELSIF entity_type = 'contacts' THEN
    -- Find potential duplicate contacts based on name and email similarity
    FOR rec1 IN 
      SELECT id, first_name, last_name, email, phone 
      FROM contacts 
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
    LOOP
      FOR rec2 IN
        SELECT id, first_name, last_name, email, phone,
               GREATEST(
                 similarity(rec1.first_name || ' ' || rec1.last_name, first_name || ' ' || last_name),
                 CASE WHEN rec1.email IS NOT NULL AND email IS NOT NULL 
                      THEN similarity(rec1.email, email) 
                      ELSE 0 END
               ) as match_score
        FROM contacts 
        WHERE deleted_at IS NULL 
          AND id > rec1.id
          AND (
            similarity(rec1.first_name || ' ' || rec1.last_name, first_name || ' ' || last_name) >= similarity_threshold OR
            (rec1.email IS NOT NULL AND email IS NOT NULL AND similarity(rec1.email, email) >= similarity_threshold)
          )
      LOOP
        group_id := gen_random_uuid();
        
        current_group := jsonb_build_object(
          'id', group_id,
          'entity_type', 'contacts',
          'entity_ids', jsonb_build_array(rec1.id, rec2.id),
          'match_score', rec2.match_score,
          'status', 'pending',
          'created_at', now()
        );
        
        duplicate_groups := duplicate_groups || current_group;
        
        INSERT INTO duplicate_groups (
          id, entity_type, entity_ids, match_score, status, created_at
        ) VALUES (
          group_id,
          'contacts',
          ARRAY[rec1.id, rec2.id],
          rec2.match_score,
          'pending',
          now()
        ) ON CONFLICT DO NOTHING;
      END LOOP;
    END LOOP;
  END IF;
  
  RETURN jsonb_build_object(
    'entity_type', entity_type,
    'groups_found', jsonb_array_length(duplicate_groups),
    'groups', duplicate_groups,
    'scanned_at', now()
  );
END;
$$;

-- RPC function for merging duplicate records
CREATE OR REPLACE FUNCTION public.merge_duplicate_records(
  group_id uuid,
  survivor_id uuid,
  merged_data jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  group_record duplicate_groups%ROWTYPE;
  entity_id uuid;
  merge_result jsonb;
  affected_records integer := 0;
BEGIN
  -- Get the duplicate group
  SELECT * INTO group_record FROM duplicate_groups WHERE id = group_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Duplicate group not found: %', group_id;
  END IF;
  
  -- Verify survivor_id is in the group
  IF NOT (survivor_id = ANY(group_record.entity_ids)) THEN
    RAISE EXCEPTION 'Survivor ID % not found in group %', survivor_id, group_id;
  END IF;
  
  -- Record the merge in history
  INSERT INTO merge_history (
    entity_type, survivor_id, merged_ids, merge_data, merged_by, created_at
  ) VALUES (
    group_record.entity_type,
    survivor_id,
    array_remove(group_record.entity_ids, survivor_id),
    COALESCE(merged_data, '{}'::jsonb),
    auth.uid(),
    now()
  );
  
  -- Perform the merge based on entity type
  IF group_record.entity_type = 'accounts' THEN
    -- Merge accounts
    FOR entity_id IN SELECT unnest(group_record.entity_ids) WHERE unnest != survivor_id LOOP
      -- Update related records to point to survivor
      UPDATE contacts SET account_id = survivor_id WHERE account_id = entity_id;
      UPDATE policies SET account_id = survivor_id WHERE account_id = entity_id;
      UPDATE events SET entity_id = survivor_id WHERE entity_id = entity_id AND entity_type = 'account';
      
      -- Soft delete the merged account
      UPDATE accounts SET deleted_at = now() WHERE id = entity_id;
      
      affected_records := affected_records + 1;
    END LOOP;
    
  ELSIF group_record.entity_type = 'contacts' THEN
    -- Merge contacts
    FOR entity_id IN SELECT unnest(group_record.entity_ids) WHERE unnest != survivor_id LOOP
      -- Update related records
      UPDATE events SET entity_id = survivor_id WHERE entity_id = entity_id AND entity_type = 'contact';
      
      -- Soft delete the merged contact
      UPDATE contacts SET deleted_at = now() WHERE id = entity_id;
      
      affected_records := affected_records + 1;
    END LOOP;
  END IF;
  
  -- Update the duplicate group status
  UPDATE duplicate_groups 
  SET status = 'merged', reviewed_at = now(), reviewed_by = auth.uid()
  WHERE id = group_id;
  
  -- Return merge results
  merge_result := jsonb_build_object(
    'group_id', group_id,
    'survivor_id', survivor_id,
    'merged_records', affected_records,
    'entity_type', group_record.entity_type,
    'merged_at', now()
  );
  
  RETURN merge_result;
END;
$$;