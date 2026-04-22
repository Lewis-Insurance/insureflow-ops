-- Fix tr_document_uploaded trigger that references non-existent 'classification' column
-- The documents table has 'document_type', not 'classification'

CREATE OR REPLACE FUNCTION tr_document_uploaded()
RETURNS TRIGGER AS $$
DECLARE
    v_workspace_id UUID;
BEGIN
    -- Get workspace from account if set
    IF NEW.account_id IS NOT NULL THEN
        v_workspace_id := get_account_workspace_id(NEW.account_id);
    END IF;

    IF v_workspace_id IS NOT NULL THEN
        PERFORM enqueue_outbox_event(
            v_workspace_id,
            'document.uploaded',
            'document',
            NEW.id,
            jsonb_build_object(
                'account_id', NEW.account_id,
                'policy_id', NEW.policy_id,
                'filename', NEW.filename,
                'kind', NEW.kind,
                'storage_path', NEW.storage_path,
                'document_type', NEW.document_type  -- Fixed: was NEW.classification (column doesn't exist)
            ),
            'document.uploaded:' || NEW.id::TEXT || ':' || TO_CHAR(NEW.created_at, 'YYYY-MM-DD-HH24-MI')
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: No need to recreate trigger since we're just replacing the function
