-- Implement real merge duplicate records function
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