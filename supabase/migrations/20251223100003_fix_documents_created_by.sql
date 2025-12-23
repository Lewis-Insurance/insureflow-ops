-- ============================================================
-- Fix documents table - add created_by column if missing
-- The documents table uses 'uploaded_by' but some code uses 'created_by'
-- This migration adds created_by as an alias/computed column
-- ============================================================

-- Add created_by column to documents table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'documents' 
        AND column_name = 'created_by'
    ) THEN
        -- Add the column
        ALTER TABLE public.documents 
        ADD COLUMN created_by UUID REFERENCES public.profiles(id);
        
        -- Copy existing uploaded_by values to created_by
        UPDATE public.documents SET created_by = uploaded_by WHERE created_by IS NULL;
        
        -- Create trigger to keep them in sync
        CREATE OR REPLACE FUNCTION sync_documents_created_by()
        RETURNS TRIGGER AS $func$
        BEGIN
            -- If created_by is set but uploaded_by is not, copy it
            IF NEW.created_by IS NOT NULL AND NEW.uploaded_by IS NULL THEN
                NEW.uploaded_by := NEW.created_by;
            END IF;
            -- If uploaded_by is set but created_by is not, copy it
            IF NEW.uploaded_by IS NOT NULL AND NEW.created_by IS NULL THEN
                NEW.created_by := NEW.uploaded_by;
            END IF;
            RETURN NEW;
        END;
        $func$ LANGUAGE plpgsql;
        
        DROP TRIGGER IF EXISTS trigger_sync_documents_created_by ON public.documents;
        CREATE TRIGGER trigger_sync_documents_created_by
            BEFORE INSERT OR UPDATE ON public.documents
            FOR EACH ROW
            EXECUTE FUNCTION sync_documents_created_by();
            
        RAISE NOTICE 'Added created_by column to documents table';
    ELSE
        RAISE NOTICE 'created_by column already exists in documents table';
    END IF;
END $$;

-- Also ensure document_extractions has created_by column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'document_extractions' 
        AND column_name = 'created_by'
    ) THEN
        ALTER TABLE public.document_extractions 
        ADD COLUMN created_by UUID REFERENCES public.profiles(id);
        
        RAISE NOTICE 'Added created_by column to document_extractions table';
    ELSE
        RAISE NOTICE 'created_by column already exists in document_extractions table';
    END IF;
END $$;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_documents_created_by ON public.documents(created_by);
CREATE INDEX IF NOT EXISTS idx_document_extractions_created_by ON public.document_extractions(created_by);
