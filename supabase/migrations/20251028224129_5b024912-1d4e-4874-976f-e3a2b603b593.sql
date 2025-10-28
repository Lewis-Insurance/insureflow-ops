-- Add workspace_document_id column to parsed_documents to link with workspace_documents
ALTER TABLE parsed_documents
ADD COLUMN workspace_document_id uuid REFERENCES workspace_documents(id) ON DELETE CASCADE;

-- Create index for faster lookups
CREATE INDEX idx_parsed_documents_workspace_document_id 
ON parsed_documents(workspace_document_id);