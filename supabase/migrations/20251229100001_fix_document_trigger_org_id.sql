-- Fix tr_document_uploaded trigger that references non-existent org_id column
-- The documents table doesn't have org_id, only account_id

CREATE OR REPLACE FUNCTION tr_document_uploaded()
RETURNS TRIGGER AS $$
DECLARE
    v_workspace_id UUID;
BEGIN
    -- Get workspace from account if set
    IF NEW.account_id IS NOT NULL THEN
        v_workspace_id := get_account_workspace_id(NEW.account_id);
    END IF;

    -- Note: removed org_id fallback since documents table doesn't have org_id column

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
                'classification', NEW.classification
            ),
            'document.uploaded:' || NEW.id::TEXT || ':' || TO_CHAR(NEW.created_at, 'YYYY-MM-DD-HH24-MI')
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger to use updated function
DROP TRIGGER IF EXISTS tr_documents_uploaded ON documents;
CREATE TRIGGER tr_documents_uploaded
    AFTER INSERT ON documents
    FOR EACH ROW
    EXECUTE FUNCTION tr_document_uploaded();
