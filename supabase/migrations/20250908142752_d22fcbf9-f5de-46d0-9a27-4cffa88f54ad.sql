-- Implement real duplicate detection function  
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
$$;